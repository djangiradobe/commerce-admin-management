/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs } = require('../../utils')
const { getClient } = require('@adobedjangir/commerce-admin-management/abdb')
const {
  SENSITIVE_PLACEHOLDER,
  toStateKey,
  normalizeScope,
  normalizeScopeId,
  buildInheritanceChain
} = require('@adobedjangir/commerce-admin-management/shared')
const { decrypt, isEncrypted } = require('@adobedjangir/commerce-admin-management/crypto')

const COLLECTION = 'system_config_data'

async function ensureCollection (client) {
  try {
    await client.createCollection(COLLECTION)
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err)
    if (!/exist|already|duplicate/i.test(msg)) throw err
  }
}

/**
 * Returns values for the requested paths from the ABDB system_config_data
 * collection, applying Magento-style scope inheritance.
 *
 * Document shape (mirrors core_config_data):
 *   { _id, scope, scope_id, path, value, updatedAt }
 *
 * Response:
 *   { scope, scopeId, items: { "<path>": { value, origin, sensitive } } }
 */
async function main (params) {
  const logger = Core.Logger('system-config-list', { level: params.LOG_LEVEL || 'info' })

  const errorMessage = checkMissingRequestInputs(params, ['paths'], [])
  if (errorMessage) return errorResponse(400, errorMessage, logger)

  const { paths, sensitivePaths = [], scope: rawScope = 'default', scopeId: rawScopeId = '0', parentWebsiteId } = params
  if (!Array.isArray(paths)) {
    return errorResponse(400, 'paths must be an array of "section/group/field" strings', logger)
  }

  let scope, scopeId
  try {
    scope = normalizeScope(rawScope)
    scopeId = normalizeScopeId(scope, rawScopeId)
  } catch (e) {
    return errorResponse(400, e.message, logger)
  }

  const sensitiveSet = new Set(sensitivePaths)
  const chain = buildInheritanceChain(scope, scopeId, parentWebsiteId)

  let dbHandle
  try {
    dbHandle = await getClient(params)
  } catch (e) {
    logger.error(`ABDB connect failed: ${e.message}`)
    return errorResponse(500, `ABDB connect failed: ${e.message}`, logger)
  }
  const { client, close } = dbHandle

  try {
    await ensureCollection(client)
    const collection = await client.collection(COLLECTION)

    // Batch fetch every (scope, path) combination we might need in one go.
    const ids = []
    for (const path of paths) {
      for (const link of chain) {
        ids.push(toStateKey(link.scope, link.scopeId, path))
      }
    }
    const docs = ids.length
      ? await collection.find({ _id: { $in: ids } }).toArray()
      : []
    const byId = new Map(docs.map((d) => [d._id, d]))

    const items = {}
    for (const path of paths) {
      let resolved = null
      for (const link of chain) {
        const id = toStateKey(link.scope, link.scopeId, path)
        const doc = byId.get(id)
        if (!doc || doc.value === undefined) continue

        let value = doc.value
        if (isEncrypted(value)) {
          try {
            value = decrypt(value, params)
          } catch (e) {
            logger.error(`Failed to decrypt ${path} @ ${link.scope}:${link.scopeId}: ${e.message}`)
            value = ''
          }
        }
        if (sensitiveSet.has(path) && value !== '' && value != null) {
          value = SENSITIVE_PLACEHOLDER
        }
        resolved = { value, origin: { scope: link.scope, scopeId: link.scopeId } }
        break
      }
      items[path] = resolved || { value: undefined, origin: null }
      items[path].sensitive = sensitiveSet.has(path)
    }

    return {
      statusCode: 200,
      body: { message: 'System config fetched', scope, scopeId, items }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'Failed to read system config', logger)
  } finally {
    try { await close() } catch (_) {}
  }
}

exports.main = main
