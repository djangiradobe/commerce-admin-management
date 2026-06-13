/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

// Rebuild the legacy `store_mappings` blob from Commerce REST and upsert it
// into system_config_data at  general/settings/store_mappings  (default scope).
//
// Output shape (matches the original middleware-config.json):
//   {
//     "0": { "code": "admin",   "language_code": "en", "website_code": "admin", "website_id": "0" },
//     "1": { "code": "default", "language_code": "en", "website_code": "base",  "website_id": "1" },
//     "2": { "code": "en_ch",   "language_code": "en", "website_code": "ch",    "website_id": "2" },
//     ...
//   }
//
// Inputs (action params):
//   dryRun         — true → preview only, no write
//   includeAdmin   — true → include website id=0 ("admin"). Default false.
//
// Trigger from `POST .../sync-store-mappings-from-commerce` or wire to a UI
// button. Stored as a JSON string in a textarea field, so existing
// `getConfig('general/settings/store_mappings', params)` callers get the
// parsed object back unchanged.

const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { getClient } = require('configuration-management/abdb')
const { getCommerceOauthClient } = require('configuration-management/oauth1a')
const { toStateKey } = require('configuration-management/shared')

const DATA_COLLECTION = 'system_config_data'
const PATH = 'general/settings/store_mappings'
const SCOPE = 'default'
const SCOPE_ID = '0'

/**
 * Derive language_code from a store-view code following the conventional
 * `<lang>_<region>` pattern (e.g. en_ch → 'en', fr_ch → 'fr'). Codes without
 * an underscore fall back to 'en' to match the legacy middleware shape.
 */
function deriveLanguageCode (code) {
  const m = String(code || '').toLowerCase().match(/^([a-z]{2})_/)
  return m ? m[1] : 'en'
}

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

async function fetchCommerceData (params, logger) {
  if (!params.COMMERCE_BASE_URL) {
    throw new Error('COMMERCE_BASE_URL is not configured')
  }
  const oauth = getCommerceOauthClient(
    {
      url: params.COMMERCE_BASE_URL,
      consumerKey: params.COMMERCE_CONSUMER_KEY,
      consumerSecret: params.COMMERCE_CONSUMER_SECRET,
      accessToken: params.COMMERCE_ACCESS_TOKEN,
      accessTokenSecret: params.COMMERCE_ACCESS_TOKEN_SECRET
    },
    logger
  )
  const [storeViews, websites] = await Promise.all([
    oauth.get('store/storeViews'),
    oauth.get('store/websites')
  ])
  return {
    storeViews: Array.isArray(storeViews) ? storeViews : [],
    websites: Array.isArray(websites) ? websites : []
  }
}

function buildStoreMappings (storeViews, websites, { includeAdmin }) {
  const websiteById = new Map()
  for (const w of websites) {
    if (w && w.id != null) websiteById.set(String(w.id), w)
  }

  const mapping = {}
  for (const sv of storeViews) {
    if (!sv || sv.id == null) continue
    const storeId = String(sv.id)
    if (!includeAdmin && (storeId === '0' || sv.code === 'admin')) continue
    const websiteId = sv.website_id != null ? String(sv.website_id) : ''
    const website = websiteById.get(websiteId)
    mapping[storeId] = {
      code: String(sv.code || ''),
      language_code: deriveLanguageCode(sv.code),
      website_code: website ? String(website.code || '') : '',
      website_id: websiteId
    }
  }
  return mapping
}

async function main (params) {
  const logger = Core.Logger('sync-store-mappings', { level: params.LOG_LEVEL || 'info' })
  const dryRun = params.dryRun === true || params.dryRun === 'true'
  const includeAdmin = params.includeAdmin === true || params.includeAdmin === 'true'

  // 1. Fetch from Commerce.
  let commerce
  try {
    commerce = await fetchCommerceData(params, logger)
  } catch (e) {
    logger.error(`Commerce REST failed: ${e.message}`)
    return errorResponse(500, `Commerce REST failed: ${e.message}`, logger)
  }

  // 2. Build the mapping.
  const mapping = buildStoreMappings(commerce.storeViews, commerce.websites, { includeAdmin })
  const count = Object.keys(mapping).length
  if (count === 0) {
    return errorResponse(500, 'No store views returned by Commerce — refusing to overwrite with empty mapping', logger)
  }

  if (dryRun) {
    return {
      statusCode: 200,
      body: { ok: true, dryRun: true, count, mapping }
    }
  }

  // 3. Upsert into ABDB at general/settings/store_mappings (default scope).
  let dbHandle
  try {
    dbHandle = await getClient(params)
  } catch (e) {
    logger.error(`ABDB connect failed: ${e.message}`)
    return errorResponse(500, `ABDB connect failed: ${e.message}`, logger)
  }
  const { client, close } = dbHandle

  try {
    await ensureCollection(client, DATA_COLLECTION)
    const collection = await client.collection(DATA_COLLECTION)
    const _id = toStateKey(SCOPE, SCOPE_ID, PATH)
    const now = new Date().toISOString()
    // Stored as a JSON STRING (textarea field) so getConfig's maybeParseJson
    // returns the object on read.
    const value = JSON.stringify(mapping, null, 2)

    try {
      await collection.updateOne(
        { _id },
        {
          $set: { value, updatedAt: now, scope: SCOPE, scope_id: SCOPE_ID, path: PATH },
          $setOnInsert: { _id, createdAt: now }
        },
        { upsert: true }
      )
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : String(err)
      if (!/upsert|unsupported|not implemented/i.test(msg)) throw err
      // Fallback: find-then-write.
      const existing = await tryFindOne(collection, { _id })
      if (existing) {
        await collection.updateOne({ _id }, { $set: { value, updatedAt: now } })
      } else {
        await collection.insertOne({
          _id, scope: SCOPE, scope_id: SCOPE_ID, path: PATH, value, createdAt: now, updatedAt: now
        })
      }
    }

    logger.info(`store_mappings synced: ${count} entries → ${PATH}`)
    return {
      statusCode: 200,
      body: { ok: true, count, mapping, path: PATH, scope: SCOPE, scope_id: SCOPE_ID }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'sync failed', logger)
  } finally {
    try { await close() } catch (_) {}
  }
}

exports.main = main
