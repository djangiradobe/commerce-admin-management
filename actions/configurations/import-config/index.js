/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

// Import a previously-exported system_config dump into ABDB.
//
// Inputs (POST body):
//   dump            : the JSON object produced by export-config, OR
//   schema / values : provide them inline instead of nesting under `dump`
//
//   schemaOnly      : true → ignore `values`
//   valuesOnly      : true → ignore `schema`
//   overwrite       : false (default) → only insert rows that don't exist;
//                     true  → upsert every row (existing values get replaced)
//
// Sensitive fields are imported AS-IS (ciphertext). They will only decrypt
// against the same SYSTEM_CONFIG_CRYPT_KEY that produced them.
//
// website_id / store_id remap
// ───────────────────────────
// The source env's website_id numbers don't necessarily match the target's.
// To keep config aligned, we translate scope_id by matching website_code
// (scope='websites') and store code (scope='stores') between the source's
// store_mappings (carried in the dump) and the TARGET env's store_mappings.
// The target side is resolved live from Commerce REST
// (store/storeViews + store/websites) on every import, with a fallback to
// the previously-synced blob in ABDB at general/settings/store_mappings if
// Commerce credentials aren't configured. Rows with no code match are
// skipped unless `allowUnmapped: true` is passed.

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, requireRole } = require('../../utils')
const { getClient } = require('@adobedjangir/commerce-admin-management/abdb')
const { isValidPath, toStateKey, normalizeScope, normalizeScopeId } = require('@adobedjangir/commerce-admin-management/shared')
const { getCommerceOauthClient } = require('@adobedjangir/commerce-admin-management/oauth1a')
const { isEncrypted, decrypt, encrypt } = require('@adobedjangir/commerce-admin-management/crypto')
const { readCommerceCreds, toClientShape } = require('../../commerce-creds')

const SCHEMA_COLLECTION = 'system_config_schema'
const SCHEMA_DOC_ID = 'v1'
const DATA_COLLECTION = 'system_config_data'
const STORE_MAPPINGS_PATH = 'general/settings/store_mappings'

async function ensureCollection (client, name) {
  try {
    await client.createCollection(name)
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

function parseMaybeJson (v) {
  if (v == null) return null
  if (typeof v === 'object') return v
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  try { return JSON.parse(t) } catch (_) { return null }
}

/**
 * Pull a store_mappings blob ({ storeId: { code, website_code, website_id, … } })
 * out of an array of value rows. Returns null if not present.
 */
function extractStoreMappings (rows) {
  if (!Array.isArray(rows)) return null
  const row = rows.find(r => r && r.path === STORE_MAPPINGS_PATH && r.scope === 'default')
  if (!row) return null
  const obj = parseMaybeJson(row.value)
  return obj && typeof obj === 'object' ? obj : null
}

async function readTargetStoreMappingsFromAbdb (client) {
  try {
    const dataCol = await client.collection(DATA_COLLECTION)
    const arr = await dataCol.find({
      _id: toStateKey('default', '0', STORE_MAPPINGS_PATH)
    }).limit(1).toArray()
    if (!arr || !arr.length) return null
    return parseMaybeJson(arr[0].value)
  } catch (_) {
    return null
  }
}

function deriveLanguageCode (code) {
  const m = String(code || '').toLowerCase().match(/^([a-z]{2})_/)
  return m ? m[1] : 'en'
}

/**
 * Fetch storeViews + websites from Commerce REST and build a store_mappings
 * blob in the same shape used everywhere else:
 *   { storeId: { code, language_code, website_code, website_id } }
 * Returns null if Commerce credentials are missing or the call fails.
 */
async function fetchTargetStoreMappingsFromCommerce (params, logger) {
  const creds = await readCommerceCreds(params).catch(() => null)
  const shape = toClientShape(creds)
  if (!shape || !shape.url || !shape.consumerKey) return null
  try {
    const oauth = getCommerceOauthClient(shape, logger)
    const [storeViews, websites] = await Promise.all([
      oauth.get('store/storeViews'),
      oauth.get('store/websites')
    ])
    const websiteById = new Map()
    for (const w of websites || []) {
      if (w && w.id != null) websiteById.set(String(w.id), w)
    }
    const mapping = {}
    for (const sv of storeViews || []) {
      if (!sv || sv.id == null) continue
      const storeId = String(sv.id)
      if (storeId === '0' || sv.code === 'admin') continue
      const websiteId = sv.website_id != null ? String(sv.website_id) : ''
      const website = websiteById.get(websiteId)
      mapping[storeId] = {
        code: String(sv.code || ''),
        language_code: deriveLanguageCode(sv.code),
        website_code: website ? String(website.code || '') : '',
        website_id: websiteId
      }
    }
    return Object.keys(mapping).length ? mapping : null
  } catch (err) {
    if (logger) logger.warn(`Commerce REST lookup failed during import remap: ${err.message}`)
    return null
  }
}

/**
 * Resolve the target env's store_mappings, preferring live Commerce REST
 * (always current) and falling back to whatever is in ABDB at
 * general/settings/store_mappings (handy for offline imports). Returns
 * { mapping, source } where source ∈ 'commerce' | 'abdb' | null.
 */
async function resolveTargetMappings (params, client, logger) {
  const fromCommerce = await fetchTargetStoreMappingsFromCommerce(params, logger)
  if (fromCommerce) return { mapping: fromCommerce, source: 'commerce' }
  const fromAbdb = await readTargetStoreMappingsFromAbdb(client)
  if (fromAbdb) return { mapping: fromAbdb, source: 'abdb' }
  return { mapping: null, source: null }
}

/**
 * Build translation tables from source → target store_mappings.
 *   websites: source website_id (string) → target website_id (string), matched by website_code
 *   stores  : source store id    (string) → target store id    (string), matched by store code
 * Also returns inverse human-readable maps for diagnostics.
 */
function buildIdMap (source, target) {
  const websiteSrcByCode = new Map()
  const websiteTgtByCode = new Map()
  const storeSrcByCode = new Map()
  const storeTgtByCode = new Map()

  const indexSide = (mapping, websiteByCode, storeByCode) => {
    if (!mapping || typeof mapping !== 'object') return
    for (const [storeId, m] of Object.entries(mapping)) {
      if (!m || typeof m !== 'object') continue
      if (m.website_code && m.website_id != null) {
        // Only record the first occurrence so we keep a deterministic mapping.
        if (!websiteByCode.has(m.website_code)) websiteByCode.set(m.website_code, String(m.website_id))
      }
      if (m.code) storeByCode.set(m.code, String(storeId))
    }
  }
  indexSide(source, websiteSrcByCode, storeSrcByCode)
  indexSide(target, websiteTgtByCode, storeTgtByCode)

  const websites = {}        // sourceWebsiteId → targetWebsiteId
  const websiteCodes = {}    // sourceWebsiteId → website_code (for diagnostics)
  for (const [code, srcId] of websiteSrcByCode.entries()) {
    websiteCodes[srcId] = code
    if (websiteTgtByCode.has(code)) websites[srcId] = websiteTgtByCode.get(code)
  }
  const stores = {}          // sourceStoreId → targetStoreId
  const storeCodes = {}
  for (const [code, srcId] of storeSrcByCode.entries()) {
    storeCodes[srcId] = code
    if (storeTgtByCode.has(code)) stores[srcId] = storeTgtByCode.get(code)
  }
  return { websites, stores, websiteCodes, storeCodes }
}

async function upsertOne (collection, doc, { overwrite }) {
  // Single-roundtrip upsert (mirrors system-config-save).
  try {
    if (overwrite) {
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            scope: doc.scope,
            scope_id: doc.scope_id,
            path: doc.path,
            value: doc.value,
            updatedAt: doc.updatedAt
          },
          $setOnInsert: { _id: doc._id, createdAt: doc.createdAt }
        },
        { upsert: true }
      )
      return 'upserted'
    }
    // Insert-only: skip if exists.
    const existing = await tryFindOne(collection, { _id: doc._id })
    if (existing) return 'skipped'
    await collection.insertOne(doc)
    return 'inserted'
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err)
    if (!/upsert|unsupported|not implemented/i.test(msg)) throw err
    // Fallback: find-then-write.
    const existing = await tryFindOne(collection, { _id: doc._id })
    if (existing) {
      if (!overwrite) return 'skipped'
      await collection.updateOne({ _id: doc._id }, { $set: doc })
      return 'updated'
    }
    await collection.insertOne(doc)
    return 'inserted'
  }
}

async function main (params) {
  const logger = Core.Logger('import-config', { level: params.LOG_LEVEL || 'info' })

  // SECURITY: mass-write path — same gate as system-config-save (editor+).
  const gate = await requireRole(params, 'editor')
  if (gate) return gate

  // Accept `dump: {schema, values, storeMappings, …}` AND/OR top-level
  // schema/values. The client uses the side-channel `dump.storeMappings` to
  // carry the source store_mappings on every chunk for id remap, so we must
  // merge instead of letting `dump` override top-level fields.
  const dump = params.dump && typeof params.dump === 'object' ? params.dump : null
  const schemaIn = params.schema || (dump ? dump.schema : undefined)
  const valuesIn = params.values || (dump ? dump.values : undefined)

  if (!schemaIn && !valuesIn) {
    return errorResponse(400, 'Body must include `dump`, `schema`, or `values`', logger)
  }

  const schemaOnly = params.schemaOnly === true || params.schemaOnly === 'true'
  const valuesOnly = params.valuesOnly === true || params.valuesOnly === 'true'
  const overwrite = params.overwrite === true || params.overwrite === 'true'
  // When true, rows with no website_code/store_code match keep their original
  // numeric scope_id. Default false — they are skipped and reported.
  const allowUnmapped = params.allowUnmapped === true || params.allowUnmapped === 'true'
  // Optional: the source env's SYSTEM_CONFIG_CRYPT_KEY. When provided we
  // decrypt sensitive ciphertext with it and re-encrypt with the target env's
  // key, so values survive cross-env imports. When omitted (or equal to the
  // target's key) ciphertext is stored verbatim.
  const sourceCryptKey = typeof params.sourceCryptKey === 'string' && params.sourceCryptKey.length >= 8
    ? params.sourceCryptKey
    : null

  let dbHandle
  try {
    dbHandle = await getClient(params)
  } catch (e) {
    logger.error(`ABDB connect failed: ${e.message}`)
    return errorResponse(500, `ABDB connect failed: ${e.message}`, logger)
  }
  const { client, close } = dbHandle

  const summary = {
    schemaImported: false,
    schemaSkipped: false,
    valuesInserted: 0,
    valuesUpserted: 0,
    valuesSkipped: 0,
    unmappedSkipped: 0,
    invalid: [],
    unmapped: [],
    overwrite,
    idMap: null,
    sensitiveReencrypted: 0,
    sensitiveDecryptFailed: 0
  }

  try {
    // ── Schema ──
    if (!valuesOnly && schemaIn && typeof schemaIn === 'object' && Array.isArray(schemaIn.sections)) {
      await ensureCollection(client, SCHEMA_COLLECTION)
      const schemaCol = await client.collection(SCHEMA_COLLECTION)
      const existing = await tryFindOne(schemaCol, { _id: SCHEMA_DOC_ID })
      const now = new Date().toISOString()
      if (existing && !overwrite) {
        summary.schemaSkipped = true
        logger.info('Schema exists and overwrite=false — skipped')
      } else {
        try {
          await schemaCol.updateOne(
            { _id: SCHEMA_DOC_ID },
            {
              $set: { schema: schemaIn, updatedAt: now },
              $setOnInsert: { _id: SCHEMA_DOC_ID, createdAt: now }
            },
            { upsert: true }
          )
        } catch (e) {
          // Fallback for drivers without upsert support.
          if (existing) {
            await schemaCol.updateOne({ _id: SCHEMA_DOC_ID }, { $set: { schema: schemaIn, updatedAt: now } })
          } else {
            await schemaCol.insertOne({ _id: SCHEMA_DOC_ID, schema: schemaIn, createdAt: now, updatedAt: now })
          }
        }
        summary.schemaImported = true
      }
    }

    // ── Values ──
    if (!schemaOnly && Array.isArray(valuesIn)) {
      await ensureCollection(client, DATA_COLLECTION)
      const dataCol = await client.collection(DATA_COLLECTION)
      const now = new Date().toISOString()

      // Determine which paths the schema marks as sensitive. Preference:
      //   1. Dump's own `sensitivePaths` array (export-config v2+)
      //   2. Schema sections walk (either inline schema, or what's already in ABDB)
      let sensitivePathSet = null
      if (dump && Array.isArray(dump.sensitivePaths) && dump.sensitivePaths.length) {
        sensitivePathSet = new Set(dump.sensitivePaths)
      } else {
        let schemaForFlags = schemaIn && typeof schemaIn === 'object' ? schemaIn : null
        if (!schemaForFlags) {
          try {
            const schemaCol = await client.collection(SCHEMA_COLLECTION)
            const existingSchema = await tryFindOne(schemaCol, { _id: SCHEMA_DOC_ID })
            schemaForFlags = existingSchema && existingSchema.schema ? existingSchema.schema : null
          } catch (_) { /* ok */ }
        }
        sensitivePathSet = new Set()
        if (schemaForFlags && Array.isArray(schemaForFlags.sections)) {
          for (const s of schemaForFlags.sections) {
            for (const g of (s.groups || [])) {
              for (const f of (g.fields || [])) {
                if (f && f.sensitive) sensitivePathSet.add(`${s.id}/${g.id}/${f.id}`)
              }
            }
          }
        }
      }

      // Resolve the TARGET env's store_mappings live from Commerce (with an
      // ABDB fallback). No source mapping is fetched — each row carries its
      // own scope_code from export, which is matched against the target.
      const { mapping: targetMappings, source: targetSource } =
        await resolveTargetMappings(params, client, logger)
      // Build per-code → target id lookup tables once.
      const targetWebsiteIdByCode = new Map()
      const targetStoreIdByCode = new Map()
      if (targetMappings) {
        for (const [storeId, m] of Object.entries(targetMappings)) {
          if (!m) continue
          if (m.website_code && m.website_id != null && !targetWebsiteIdByCode.has(m.website_code)) {
            targetWebsiteIdByCode.set(String(m.website_code), String(m.website_id))
          }
          if (m.code) targetStoreIdByCode.set(String(m.code), String(storeId))
        }
      }
      summary.idMap = {
        targetSource,
        targetWebsiteCount: targetWebsiteIdByCode.size,
        targetStoreCount: targetStoreIdByCode.size,
        hasTarget: !!targetMappings,
        matchedByCode: 0,
        matchedById: 0
      }
      logger.info(
        `target Commerce (${targetSource}): ` +
        `websites=${targetWebsiteIdByCode.size}, stores=${targetStoreIdByCode.size}`
      )

      // translateScopeId(scope, scopeId, scopeCode)
      //   - prefers scope_code from the row (set by export-config v2+)
      //   - falls back to scope_id pass-through if the target already has
      //     that numeric id (handles same-env or legacy dumps)
      const translateScopeId = (scope, srcId, scopeCode) => {
        const s = String(srcId)
        if (scope === 'websites') {
          if (scopeCode) {
            const tgt = targetWebsiteIdByCode.get(String(scopeCode))
            if (tgt) {
              summary.idMap.matchedByCode++
              return { id: tgt, mapped: true, code: String(scopeCode) }
            }
            return { id: s, mapped: false, code: String(scopeCode) }
          }
          // No scope_code from export. Maybe scope_id is already the code
          // (legacy migrate-legacy-config path), try that.
          if (targetWebsiteIdByCode.has(s)) {
            summary.idMap.matchedByCode++
            return { id: targetWebsiteIdByCode.get(s), mapped: true, code: s }
          }
          // Or scope_id may already match a target website (same env).
          if (targetMappings && Object.values(targetMappings).some(m => m && String(m.website_id) === s)) {
            summary.idMap.matchedById++
            return { id: s, mapped: true }
          }
          return { id: s, mapped: false }
        }
        if (scope === 'stores') {
          if (scopeCode) {
            const tgt = targetStoreIdByCode.get(String(scopeCode))
            if (tgt) {
              summary.idMap.matchedByCode++
              return { id: tgt, mapped: true, code: String(scopeCode) }
            }
            return { id: s, mapped: false, code: String(scopeCode) }
          }
          if (targetStoreIdByCode.has(s)) {
            summary.idMap.matchedByCode++
            return { id: targetStoreIdByCode.get(s), mapped: true, code: s }
          }
          if (targetMappings && targetMappings[s]) {
            summary.idMap.matchedById++
            return { id: s, mapped: true }
          }
          return { id: s, mapped: false }
        }
        return { id: s, mapped: true }
      }

      for (const row of valuesIn) {
        if (!row || !row.path || row.scope == null) {
          summary.invalid.push({ row, reason: 'missing scope or path' })
          continue
        }
        if (!isValidPath(row.path)) {
          summary.invalid.push({ path: row.path, reason: 'invalid path' })
          continue
        }
        let scope, scopeId
        try {
          scope = normalizeScope(row.scope)
          scopeId = normalizeScopeId(scope, row.scope_id)
        } catch (e) {
          summary.invalid.push({ path: row.path, reason: e.message })
          continue
        }
        // Translate scope_id from source env → target env using the row's
        // scope_code (stamped at export) against the target's live Commerce.
        if (scope === 'websites' || scope === 'stores') {
          const t = translateScopeId(scope, scopeId, row.scope_code)
          if (!t.mapped) {
            if (!allowUnmapped) {
              summary.unmappedSkipped++
              summary.unmapped.push({
                scope,
                source_scope_id: scopeId,
                code: t.code || row.scope_code || null,
                path: row.path
              })
              continue
            }
          } else {
            scopeId = t.id
          }
        }
        // Encrypt sensitive values with the TARGET env's key.
        //
        // Three input shapes a sensitive value may arrive in:
        //   (a) plaintext  — produced by export-config v2+ (decrypted at
        //                     export). We just encrypt with local key.
        //   (b) enc:v1:... ciphertext from the SAME env — already protected
        //                     by the local key; pass through. (Fast path —
        //                     same workspace re-import.)
        //   (c) enc:v1:... ciphertext from a DIFFERENT env — needs the
        //                     sourceCryptKey to decode. Falls back to (b)
        //                     verbatim when no source key is provided.
        let writeValue = row.value
        const isSensitivePath = sensitivePathSet.has(row.path)
        if (isSensitivePath && typeof writeValue === 'string') {
          if (isEncrypted(writeValue)) {
            if (sourceCryptKey) {
              try {
                const plaintext = decrypt(writeValue, { SYSTEM_CONFIG_CRYPT_KEY: sourceCryptKey })
                writeValue = encrypt(plaintext, params)
                summary.sensitiveReencrypted++
              } catch (err) {
                summary.sensitiveDecryptFailed++
                logger.warn(`Re-encrypt with sourceCryptKey failed for ${row.path}: ${err.message}`)
              }
            }
            // else: leave ciphertext as-is; will only decrypt if target's
            // key happens to match source's.
          } else if (writeValue !== '' && writeValue != null) {
            // Plaintext sensitive value (v2 dump or fresh value) — encrypt
            // with the local key.
            try {
              writeValue = encrypt(String(writeValue), params)
              summary.sensitiveReencrypted++
            } catch (err) {
              summary.sensitiveDecryptFailed++
              logger.warn(`Encrypt failed for ${row.path}: ${err.message}`)
            }
          }
        }
        const doc = {
          _id: toStateKey(scope, scopeId, row.path),
          scope,
          scope_id: scopeId,
          path: row.path,
          value: writeValue,
          createdAt: now,
          updatedAt: now
        }
        const r = await upsertOne(dataCol, doc, { overwrite })
        if (r === 'inserted') summary.valuesInserted++
        else if (r === 'skipped') summary.valuesSkipped++
        else summary.valuesUpserted++
      }
    }

    logger.info(`Import done: ${JSON.stringify(summary)}`)
    return { statusCode: 200, body: { ok: true, summary } }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'Import failed', logger)
  } finally {
    try { await close() } catch (_) {}
  }
}

exports.main = main
