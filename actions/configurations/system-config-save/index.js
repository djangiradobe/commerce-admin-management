/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs, logDetails } = require('../../utils')
const { getClient } = require('@adobedjangir/commerce-admin-management/abdb')
const {
  SENSITIVE_PLACEHOLDER,
  USE_DEFAULT_SENTINEL,
  isValidPath,
  toStateKey,
  normalizeScope,
  normalizeScopeId
} = require('@adobedjangir/commerce-admin-management/shared')
const { encrypt } = require('@adobedjangir/commerce-admin-management/crypto')

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
 * ABDB's `findOne` throws "Document not found" on a miss in this driver
 * version. `find().limit(1).toArray()` always returns an array, so use that
 * to mean "fetch one or null". Belt-and-braces try/catch in case `find`
 * itself starts throwing in a future version.
 */
async function tryFindOne (collection, query) {
  try {
    const arr = await collection.find(query).limit(1).toArray()
    return arr && arr.length ? arr[0] : null
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err)
    if (/not found/i.test(msg)) return null
    throw err
  }
}

/**
 * Upsert/delete values in the ABDB `system_config_data` collection.
 *
 * Per-value behavior (unchanged):
 *   - value === SENSITIVE_PLACEHOLDER → no-op (UI sent back a masked value)
 *   - value === USE_DEFAULT_SENTINEL  → delete the scope override (inherit)
 *   - sensitive=true                  → encrypt with AES-256-GCM before writing
 *
 * Document shape (mirrors core_config_data):
 *   { _id, scope, scope_id, path, value, createdAt, updatedAt }
 */
async function main (params) {
  const logger = Core.Logger('system-config-save', { level: params.LOG_LEVEL || 'info' })

  const errorMessage = checkMissingRequestInputs(params, ['values'], [])
  if (errorMessage) return errorResponse(400, errorMessage, logger)

  const { values, sensitivePaths = [], scope: rawScope = 'default', scopeId: rawScopeId = '0' } = params
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return errorResponse(400, 'values must be an object of { "section/group/field": value }', logger)
  }

  let scope, scopeId
  try {
    scope = normalizeScope(rawScope)
    scopeId = normalizeScopeId(scope, rawScopeId)
  } catch (e) {
    return errorResponse(400, e.message, logger)
  }

  const sensitiveSet = new Set(sensitivePaths)

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
    const now = new Date().toISOString()
    const saved = []
    const deleted = []
    const skipped = []

    for (const [path, value] of Object.entries(values)) {
      if (!isValidPath(path)) {
        skipped.push({ path, reason: 'invalid path format' })
        continue
      }
      const id = toStateKey(scope, scopeId, path)

      if (value === USE_DEFAULT_SENTINEL) {
        await collection.deleteOne({ _id: id })
        deleted.push(path)
        continue
      }
      if (sensitiveSet.has(path) && value === SENSITIVE_PLACEHOLDER) {
        skipped.push({ path, reason: 'masked placeholder, kept existing' })
        continue
      }

      let stored = value
      if (sensitiveSet.has(path) && stored !== '' && stored != null) {
        stored = encrypt(String(stored), params)
      }

      const existing = await tryFindOne(collection, { _id: id })
      if (existing) {
        await collection.updateOne(
          { _id: id },
          { $set: { value: stored, updatedAt: now } }
        )
      } else {
        await collection.insertOne({
          _id: id,
          scope,
          scope_id: scopeId,
          path,
          value: stored,
          createdAt: now,
          updatedAt: now
        })
      }
      saved.push(path)
    }

    const redactedForLog = Object.fromEntries(
      Object.entries(values).map(([p, v]) => [p, sensitiveSet.has(p) ? '[REDACTED]' : v])
    )
    logDetails(
      'system-config-save',
      `scope=${scope}:${scopeId} payload=${JSON.stringify(redactedForLog)}`
    )

    return {
      statusCode: 200,
      body: { message: 'System config saved', scope, scopeId, saved, deleted, skipped }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'Failed to save system config', logger)
  } finally {
    try { await close() } catch (_) {}
  }
}

exports.main = main
