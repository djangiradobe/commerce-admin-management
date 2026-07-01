/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License");
*/

// Centralized read/write/test for Adobe Commerce connection credentials.
//
// Storage: a single document in ABDB `system_config_data` at
//   scope=default, scope_id=0, path=_system/commerce/connection
// whose `value` is an encrypted JSON blob:
//   { baseUrl, consumerKey, consumerSecret, accessToken, accessTokenSecret }
//
// Everything except `baseUrl` is sensitive; the whole blob is encrypted with
// SYSTEM_CONFIG_CRYPT_KEY via system-config-crypto. We encrypt the JSON string
// as a unit (one ciphertext) rather than per-field, since the blob is read
// atomically and stored at a single key.

const { getClient } = require('@adobedjangir/commerce-admin-management/abdb')
const { toStateKey } = require('@adobedjangir/commerce-admin-management/shared')
const { encrypt, decrypt, isEncrypted } = require('@adobedjangir/commerce-admin-management/crypto')
const { getCommerceOauthClient } = require('@adobedjangir/commerce-admin-management/oauth1a')

const COLLECTION = 'system_config_data'
const SCOPE = 'default'
const SCOPE_ID = '0'
const PATH = '_system/commerce/connection'
const DOC_ID = toStateKey(SCOPE, SCOPE_ID, PATH)

// Discriminator for the persisted creds blob. 'paas' = Magento OAuth1a
// (the original integration), 'saas' = Adobe Commerce as a Service with
// an IMS Bearer token. Anything else (or missing) → assume 'paas' for
// backward compatibility with blobs written before SaaS was added.
const CONNECTION_TYPE_PAAS = 'paas'
const CONNECTION_TYPE_SAAS = 'saas'
const CONNECTION_TYPES = [CONNECTION_TYPE_PAAS, CONNECTION_TYPE_SAAS]

function normalizeConnectionType (t) {
  return CONNECTION_TYPES.includes(t) ? t : CONNECTION_TYPE_PAAS
}

// Per-cold-start cache so each action call doesn't pay ABDB+decrypt cost.
let credsCache = null
let credsCacheAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

function clearCommerceCredsCache () {
  credsCache = null
  credsCacheAt = 0
}

function normalizeBaseUrl (url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed : trimmed + '/'
}

/**
 * Convert stored creds into the shape OAuth1a callers expect.
 * Returns `null` for SaaS creds since OAuth1a doesn't apply.
 */
function toClientShape (creds) {
  if (!creds) return null
  if (normalizeConnectionType(creds.connectionType) !== CONNECTION_TYPE_PAAS) return null
  return {
    url: normalizeBaseUrl(creds.baseUrl),
    consumerKey: creds.consumerKey,
    consumerSecret: creds.consumerSecret,
    accessToken: creds.accessToken,
    accessTokenSecret: creds.accessTokenSecret
  }
}

/**
 * Convert stored creds into a SaaS-client shape: base URL + optional
 * apiKey for the x-api-key header. The bearer token isn't stored — it's
 * minted per-request by mintSaasBearerToken() from workspace IMS creds.
 */
function toSaasClientShape (creds) {
  if (!creds) return null
  if (normalizeConnectionType(creds.connectionType) !== CONNECTION_TYPE_SAAS) return null
  return {
    url: normalizeBaseUrl(creds.baseUrl),
    apiKey: creds.apiKey || ''
  }
}

function maskValue (v) {
  return v ? '****' + String(v).slice(-4) : ''
}

function maskCreds (creds) {
  if (!creds) return null
  const type = normalizeConnectionType(creds.connectionType)
  if (type === CONNECTION_TYPE_SAAS) {
    return {
      connectionType: CONNECTION_TYPE_SAAS,
      baseUrl: creds.baseUrl || '',
      apiKey: creds.apiKey ? maskValue(creds.apiKey) : ''
    }
  }
  return {
    connectionType: CONNECTION_TYPE_PAAS,
    baseUrl: creds.baseUrl || '',
    consumerKey: maskValue(creds.consumerKey),
    consumerSecret: maskValue(creds.consumerSecret),
    accessToken: maskValue(creds.accessToken),
    accessTokenSecret: maskValue(creds.accessTokenSecret)
  }
}

/**
 * Mint a SaaS-side bearer token from the workspace's IMS Server-to-Server
 * credential. Scope `commerce.accs` is what Adobe Commerce as a Cloud
 * Service requires for tenant-scoped REST. Tokens are short-lived; we
 * mint per-request rather than caching to keep secret-rotation safe.
 *
 * Returns the access-token string. Throws when the workspace credentials
 * are missing or IMS rejects them.
 */
async function mintSaasBearerToken (params) {
  const clientId = params.OAUTH_CLIENT_ID
  const clientSecret = params.OAUTH_CLIENT_SECRET
  const orgId = params.OAUTH_ORG_ID
  if (!clientId || !clientSecret || !orgId) {
    throw new Error('SaaS bearer mint requires OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_ORG_ID')
  }
  const { Ims } = require('@adobe/aio-lib-ims')
  const ims = new Ims()
  const tokenResult = await ims.getAccessTokenByClientCredentials(
    clientId, clientSecret, orgId,
    ['AdobeID', 'openid', 'read_organizations', 'commerce.accs']
  )
  const token = tokenResult?.access_token?.token ||
    (typeof tokenResult?.payload?.access_token === 'string' ? tokenResult.payload.access_token : null)
  if (!token) {
    throw new Error('IMS returned no access token for commerce.accs scope')
  }
  return token
}

async function ensureCollection (client) {
  try {
    await client.createCollection(COLLECTION)
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err)
    if (!/exist|already|duplicate/i.test(msg)) throw err
  }
}

async function tryFindOne (collection, query) {
  try {
    const arr = await collection.find(query).limit(1).toArray()
    return arr && arr.length ? arr[0] : null
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err)
    if (/not found/i.test(msg)) return null
    throw err
  }
}

/**
 * Load the saved commerce creds from ABDB. Returns null if not configured.
 * Returned shape: { baseUrl, consumerKey, consumerSecret, accessToken, accessTokenSecret }
 */
async function readCommerceCreds (params, { fresh = false } = {}) {
  const now = Date.now()
  if (!fresh && credsCache && (now - credsCacheAt) < CACHE_TTL_MS) {
    return credsCache
  }

  let handle
  try {
    handle = await getClient(params)
  } catch (e) {
    return null
  }
  try {
    await ensureCollection(handle.client)
    const collection = await handle.client.collection(COLLECTION)
    const doc = await tryFindOne(collection, { _id: DOC_ID })
    if (!doc || doc.value === undefined || doc.value === null || doc.value === '') {
      credsCache = null
      credsCacheAt = now
      return null
    }
    let raw = doc.value
    if (isEncrypted(raw)) {
      // Decrypt can throw "Unsupported state or unable to authenticate data"
      // when the stored ciphertext was produced with a different
      // SYSTEM_CONFIG_CRYPT_KEY than is currently configured (key rotation
      // without re-encryption, env drift, snapshot from another workspace,
      // etc.). Treat that as "no usable creds" — the UI's wizard gate will
      // re-show and the operator can re-enter. probeCommerceCreds reports
      // the distinction explicitly when callers care.
      try {
        raw = decrypt(raw, params)
      } catch (_) {
        credsCache = null
        credsCacheAt = now
        return null
      }
    }
    let parsed
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (_) {
      return null
    }
    if (!parsed || !parsed.baseUrl) return null
    credsCache = parsed
    credsCacheAt = now
    return parsed
  } finally {
    try { await handle.close() } catch (_) {}
  }
}

/**
 * Persist commerce creds (encrypted JSON blob). Caller is responsible for
 * having validated the connection first.
 */
async function writeCommerceCreds (params, creds) {
  if (!creds || !creds.baseUrl) {
    throw new Error('baseUrl required')
  }
  const type = normalizeConnectionType(creds.connectionType)
  let blob
  if (type === CONNECTION_TYPE_SAAS) {
    blob = {
      connectionType: CONNECTION_TYPE_SAAS,
      baseUrl: normalizeBaseUrl(creds.baseUrl),
      // apiKey is optional — empty string means "fall back to workspace
      // OAUTH_CLIENT_ID as the x-api-key header value at request time".
      apiKey: creds.apiKey ? String(creds.apiKey) : ''
    }
  } else {
    blob = {
      connectionType: CONNECTION_TYPE_PAAS,
      baseUrl: normalizeBaseUrl(creds.baseUrl),
      consumerKey: String(creds.consumerKey || ''),
      consumerSecret: String(creds.consumerSecret || ''),
      accessToken: String(creds.accessToken || ''),
      accessTokenSecret: String(creds.accessTokenSecret || '')
    }
  }
  const payload = JSON.stringify(blob)
  const encrypted = encrypt(payload, params)

  const { client, close } = await getClient(params)
  try {
    await ensureCollection(client)
    const collection = await client.collection(COLLECTION)
    const now = new Date().toISOString()
    try {
      await collection.updateOne(
        { _id: DOC_ID },
        {
          $set: { value: encrypted, updatedAt: now, scope: SCOPE, scope_id: SCOPE_ID, path: PATH },
          $setOnInsert: { _id: DOC_ID, createdAt: now }
        },
        { upsert: true }
      )
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : String(err)
      if (!/upsert|unsupported|not implemented/i.test(msg)) throw err
      const existing = await tryFindOne(collection, { _id: DOC_ID })
      if (existing) {
        await collection.updateOne({ _id: DOC_ID }, { $set: { value: encrypted, updatedAt: now } })
      } else {
        await collection.insertOne({
          _id: DOC_ID, scope: SCOPE, scope_id: SCOPE_ID, path: PATH, value: encrypted, createdAt: now, updatedAt: now
        })
      }
    }
    clearCommerceCredsCache()
  } finally {
    try { await close() } catch (_) {}
  }
}

/**
 * Hit a lightweight authenticated Commerce REST endpoint to verify creds.
 * Returns { ok, storeCount, message } and never throws on auth/network — it
 * normalises the failure into the result envelope.
 */
async function testCommerceConnection (creds, logger, params = {}) {
  const errLogger = logger && typeof logger.error === 'function' ? logger : { error: () => {} }
  if (!creds || !creds.baseUrl) {
    return { ok: false, message: 'baseUrl is required' }
  }
  const type = normalizeConnectionType(creds.connectionType)

  // SaaS / ACCS: mint a fresh bearer from the workspace's IMS S2S creds
  // (commerce.accs scope), then GET the base URL with that bearer + an
  // x-api-key header. The x-api-key defaults to OAUTH_CLIENT_ID when the
  // operator hasn't overridden it via the apiKey field.
  if (type === CONNECTION_TYPE_SAAS) {
    const shape = toSaasClientShape(creds)
    if (!shape || !shape.url) return { ok: false, message: 'baseUrl is required' }
    let bearer
    try {
      bearer = await mintSaasBearerToken(params)
    } catch (err) {
      return { ok: false, message: `Bearer mint failed: ${err.message}` }
    }
    const apiKey = shape.apiKey || params.OAUTH_CLIENT_ID || ''
    const probe = creds.testPath ? String(creds.testPath).replace(/^\/+/, '') : ''
    const url = shape.url + probe
    try {
      const headers = {
        Authorization: 'Bearer ' + bearer,
        Accept: 'application/json'
      }
      if (apiKey) headers['x-api-key'] = apiKey
      const res = await fetch(url, { method: 'GET', headers })
      if (!res.ok) {
        return { ok: false, message: `HTTP ${res.status} from ${url}` }
      }
      return { ok: true, message: `Connected — ${url} responded ${res.status}` }
    } catch (err) {
      return { ok: false, message: err.message || 'SaaS connection failed' }
    }
  }

  // PaaS: existing OAuth1a flow against /store/storeConfigs.
  const shape = toClientShape({ ...creds, connectionType: CONNECTION_TYPE_PAAS })
  if (!shape || !shape.url) {
    return { ok: false, message: 'baseUrl is required' }
  }
  if (!shape.consumerKey || !shape.consumerSecret || !shape.accessToken || !shape.accessTokenSecret) {
    return { ok: false, message: 'All OAuth fields are required' }
  }
  try {
    const oauth = getCommerceOauthClient({ ...shape }, errLogger)
    const stores = await oauth.get('store/storeConfigs')
    const count = Array.isArray(stores) ? stores.length : 0
    return { ok: true, storeCount: count, message: `Connected — ${count} store config(s) returned` }
  } catch (err) {
    const status = err && err.response && err.response.statusCode
    const msg = (err && err.message) ? String(err.message) : 'Connection failed'
    return { ok: false, message: status ? `HTTP ${status}: ${msg}` : msg }
  }
}

/**
 * Resolve commerce creds for any action that needs them.
 * Precedence:
 *   1. explicit creds supplied on params (legacy / local dev fallback)
 *   2. ABDB-stored creds
 *   3. process.env (purely a dev escape hatch)
 *
 * Throws when nothing is configured so the caller emits a clear 412.
 */
async function getCommerceCreds (params, logger) {
  const fromParams = {
    baseUrl: params.COMMERCE_BASE_URL,
    consumerKey: params.COMMERCE_CONSUMER_KEY,
    consumerSecret: params.COMMERCE_CONSUMER_SECRET,
    accessToken: params.COMMERCE_ACCESS_TOKEN,
    accessTokenSecret: params.COMMERCE_ACCESS_TOKEN_SECRET
  }
  if (fromParams.baseUrl && fromParams.consumerKey) {
    return fromParams
  }
  const fromDb = await readCommerceCreds(params)
  if (fromDb && fromDb.baseUrl) return fromDb
  const fromEnv = {
    baseUrl: process.env.COMMERCE_BASE_URL,
    consumerKey: process.env.COMMERCE_CONSUMER_KEY,
    consumerSecret: process.env.COMMERCE_CONSUMER_SECRET,
    accessToken: process.env.COMMERCE_ACCESS_TOKEN,
    accessTokenSecret: process.env.COMMERCE_ACCESS_TOKEN_SECRET
  }
  if (fromEnv.baseUrl && fromEnv.consumerKey) return fromEnv
  const err = new Error('Commerce connection not configured. Complete the Commerce setup wizard first.')
  err.code = 'COMMERCE_NOT_CONFIGURED'
  throw err
}

/**
 * Convenience: returns a ready-to-use OAuth1a client built from stored creds.
 */
async function getStoredCommerceOauthClient (params, logger) {
  const creds = await getCommerceCreds(params, logger)
  return getCommerceOauthClient(toClientShape(creds), logger || { error: () => {} })
}

/**
 * Probe the stored Commerce creds row without throwing. Returns a status
 * envelope:
 *   { configured: boolean,
 *     decryptFailed: boolean,   // record exists but auth-tag check failed
 *     hasRecord: boolean,       // any document at all (encrypted or not)
 *     creds: maskedOrNull }
 *
 * Status-checking callers (the UI wizard gate) should use this instead of
 * readCommerceCreds — it tells them WHY they should re-prompt for creds,
 * which lets the UI render a helpful banner instead of a generic 500.
 */
async function probeCommerceCreds (params) {
  let handle
  try { handle = await getClient(params) } catch (_) {
    return { configured: false, decryptFailed: false, hasRecord: false, creds: null }
  }
  try {
    await ensureCollection(handle.client)
    const collection = await handle.client.collection(COLLECTION)
    const doc = await tryFindOne(collection, { _id: DOC_ID })
    if (!doc || doc.value == null || doc.value === '') {
      return { configured: false, decryptFailed: false, hasRecord: false, creds: null }
    }
    let raw = doc.value
    let decryptFailed = false
    if (isEncrypted(raw)) {
      try { raw = decrypt(raw, params) } catch (_) {
        decryptFailed = true
      }
    }
    if (decryptFailed) {
      return { configured: false, decryptFailed: true, hasRecord: true, creds: null }
    }
    let parsed
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (_) {
      // Record exists, not encrypted, but unparseable — treat as no creds.
      return { configured: false, decryptFailed: false, hasRecord: true, creds: null }
    }
    if (!parsed || !parsed.baseUrl) {
      return { configured: false, decryptFailed: false, hasRecord: true, creds: null }
    }
    return { configured: true, decryptFailed: false, hasRecord: true, creds: maskCreds(parsed) }
  } finally {
    try { await handle.close() } catch (_) {}
  }
}

module.exports = {
  COMMERCE_CONNECTION_PATH: PATH,
  COMMERCE_CONNECTION_DOC_ID: DOC_ID,
  CONNECTION_TYPE_PAAS,
  CONNECTION_TYPE_SAAS,
  CONNECTION_TYPES,
  readCommerceCreds,
  writeCommerceCreds,
  testCommerceConnection,
  getCommerceCreds,
  getStoredCommerceOauthClient,
  probeCommerceCreds,
  toClientShape,
  toSaasClientShape,
  mintSaasBearerToken,
  maskCreds,
  clearCommerceCredsCache
}
