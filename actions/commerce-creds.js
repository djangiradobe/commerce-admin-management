/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License");
*/

// Centralized read/write/test for Adobe Commerce connection credentials.
//
// Storage: a single document in ABDB `system_config_data` at
//   scope=default, scope_id=0, path=_system/commerce/connection
// whose `value` is an encrypted JSON blob in one of two shapes:
//
//   OAuth1a (traditional Commerce on-prem / PaaS):
//     { type: 'oauth1a', baseUrl, consumerKey, consumerSecret,
//       accessToken, accessTokenSecret }
//
//   ACCS (Adobe Commerce as a Cloud Service):
//     { type: 'accs', baseUrl, imsApiKey? }
//     Uses the workspace's existing IMS S2S OAuth credential
//     (commerce.accs scope) to mint a Bearer token per call. The
//     OAUTH_CLIENT_ID / SECRET / ORG_ID / SCOPES already in .env are
//     the same ones used for ABDB — no extra creds needed in the doc.
//     `imsApiKey` defaults to OAUTH_CLIENT_ID; override only if your
//     Commerce instance is gated on a different API key.
//
// Everything sensitive is AES-256-GCM-encrypted via SYSTEM_CONFIG_CRYPT_KEY.
// The whole JSON string is encrypted as a unit since the blob is read
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

function toClientShape (creds) {
  if (!creds) return null
  return {
    url: normalizeBaseUrl(creds.baseUrl),
    consumerKey: creds.consumerKey,
    consumerSecret: creds.consumerSecret,
    accessToken: creds.accessToken,
    accessTokenSecret: creds.accessTokenSecret
  }
}

function maskCreds (creds) {
  if (!creds) return null
  const mask = (v) => (v ? '****' + String(v).slice(-4) : '')
  const type = creds.type || 'oauth1a'
  if (type === 'accs') {
    return {
      type: 'accs',
      baseUrl: creds.baseUrl || '',
      imsApiKey: mask(creds.imsApiKey)
    }
  }
  return {
    type: 'oauth1a',
    baseUrl: creds.baseUrl || '',
    consumerKey: mask(creds.consumerKey),
    consumerSecret: mask(creds.consumerSecret),
    accessToken: mask(creds.accessToken),
    accessTokenSecret: mask(creds.accessTokenSecret)
  }
}

/**
 * Build a Bearer-token Commerce client for ACCS instances. Mirrors the
 * interface of getCommerceOauthClient (get/post/put/delete returning JSON)
 * but uses an IMS S2S access token + optional x-api-key instead of OAuth1a
 * HMAC signing. The token is minted per-call via the existing IMS helper,
 * so no token cache is needed — IMS tokens are 24h-lived and the helper
 * caches internally.
 */
function getCommerceAccsClient (creds, params, logger) {
  const got = require('got')
  const { fetchImsTokenFromClientCredentials } = require('@adobedjangir/commerce-admin-get-config/abdb')
  const log = logger && typeof logger.error === 'function' ? logger : { error: () => {} }
  const baseUrl = normalizeBaseUrl(creds.baseUrl)
  const apiKey = creds.imsApiKey ||
    params.OAUTH_CLIENT_ID || params.IMS_OAUTH_S2S_CLIENT_ID ||
    process.env.OAUTH_CLIENT_ID || process.env.IMS_OAUTH_S2S_CLIENT_ID || ''
  const apiVersion = 'V1'

  async function ensureToken () {
    const token = await fetchImsTokenFromClientCredentials(params)
    if (!token) {
      throw new Error('Could not obtain IMS token for ACCS — check OAUTH_* / IMS_OAUTH_S2S_* in .env and the commerce.accs scope on the workspace credential.')
    }
    return token
  }

  // ACCS REST endpoints live directly under the tenant base URL at /V1/<resource>.
  // There is no /rest/<storeCode>/ prefix as in PaaS Commerce — that legacy shape
  // returns 404 against ACCS hosts.
  function makeUrl (resource) {
    return baseUrl + apiVersion + '/' + resource.replace(/^\//, '')
  }

  async function call (method, resource, body, customHeaders = {}) {
    const token = await ensureToken()
    const headers = {
      Authorization: 'Bearer ' + token,
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...customHeaders
    }
    try {
      const opts = { method, headers, responseType: 'json' }
      if (body !== undefined && body !== null) opts.body = JSON.stringify(body)
      const res = await got(makeUrl(resource), opts).json()
      return res
    } catch (err) {
      log.error(err)
      throw err
    }
  }

  return {
    // Signatures intentionally accept (and ignore) the legacy storeCode arg
    // so the ACCS client is drop-in compatible with the PaaS oauth1a client.
    get:    (r, _t, h)    => call('GET', r, null, h),
    post:   (r, b, _t, h) => call('POST', r, b, h),
    put:    (r, b, _t, h) => call('PUT', r, b, h),
    delete: (r, _t, h)    => call('DELETE', r, null, h)
  }
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
      try {
        raw = decrypt(raw, params)
      } catch (e) {
        // AES-GCM auth-tag mismatch — almost always SYSTEM_CONFIG_CRYPT_KEY
        // rotated since the value was sealed. Treat the doc as unreadable
        // so MainPage shows the Commerce wizard instead of crashing the UI.
        // The operator can re-enter creds; the wizard will overwrite the
        // doc with a value encrypted under the current key.
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
  const type = creds.type === 'accs' ? 'accs' : 'oauth1a'
  const body = type === 'accs'
    ? {
        type,
        baseUrl: normalizeBaseUrl(creds.baseUrl),
        imsApiKey: String(creds.imsApiKey || '')
      }
    : {
        type,
        baseUrl: normalizeBaseUrl(creds.baseUrl),
        consumerKey: String(creds.consumerKey || ''),
        consumerSecret: String(creds.consumerSecret || ''),
        accessToken: String(creds.accessToken || ''),
        accessTokenSecret: String(creds.accessTokenSecret || '')
      }
  const payload = JSON.stringify(body)
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
  const type = creds.type === 'accs' ? 'accs' : 'oauth1a'

  try {
    let client
    if (type === 'accs') {
      // ACCS uses the workspace IMS S2S OAuth credential. The wizard
      // doesn't need to collect a separate key/secret — just the base URL.
      client = getCommerceAccsClient(creds, params, errLogger)
    } else {
      const shape = toClientShape(creds)
      if (!shape.consumerKey || !shape.consumerSecret || !shape.accessToken || !shape.accessTokenSecret) {
        return { ok: false, message: 'All OAuth1a fields are required' }
      }
      client = getCommerceOauthClient({ ...shape }, errLogger)
    }
    const stores = await client.get('store/storeConfigs')
    const count = Array.isArray(stores) ? stores.length : 0
    return { ok: true, storeCount: count, message: `Connected via ${type} — ${count} store config(s) returned` }
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
 * Convenience: returns a ready-to-use Commerce REST client built from stored
 * creds, dispatching by `type`:
 *   - oauth1a (default): HMAC-SHA256 signed requests via oauth-1.0a
 *   - accs:              IMS S2S bearer-token requests for cloud-service stores
 *
 * Kept under the historical name `getStoredCommerceOauthClient` for
 * backwards compat with consumers that pre-date ACCS. Prefer
 * `getStoredCommerceClient` going forward.
 */
async function getStoredCommerceClient (params, logger) {
  const creds = await getCommerceCreds(params, logger)
  const safeLogger = logger || { error: () => {} }
  if (creds && creds.type === 'accs') {
    return getCommerceAccsClient(creds, params, safeLogger)
  }
  return getCommerceOauthClient(toClientShape(creds), safeLogger)
}
const getStoredCommerceOauthClient = getStoredCommerceClient

module.exports = {
  COMMERCE_CONNECTION_PATH: PATH,
  COMMERCE_CONNECTION_DOC_ID: DOC_ID,
  readCommerceCreds,
  writeCommerceCreds,
  testCommerceConnection,
  getCommerceCreds,
  getStoredCommerceClient,
  getStoredCommerceOauthClient,
  getCommerceAccsClient,
  toClientShape,
  maskCreds,
  clearCommerceCredsCache
}
