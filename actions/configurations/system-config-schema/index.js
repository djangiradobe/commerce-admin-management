/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs } = require('../../utils')
const { getClient } = require('@adobedjangir/commerce-admin-management/abdb')

// Soft RBAC hook (see system-config-save for the literal-require rationale).
let rbacHook = null
try { rbacHook = require('@adobedjangir/commerce-admin-ims-access/hook') } catch (_) { rbacHook = null }

const COLLECTION = 'system_config_schema'
const DOC_ID = 'v1'
const FIELD_TYPES = new Set(['text', 'textarea', 'password', 'number', 'select', 'boolean'])
const SCOPES = ['default', 'websites', 'stores']
const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/

function emptySchema () {
  return { sections: [] }
}

function isString (v) {
  return typeof v === 'string'
}

function validateField (field, ctx) {
  if (!field || typeof field !== 'object') throw new Error(`${ctx}: field must be an object`)
  if (!isString(field.id) || !ID_RE.test(field.id)) {
    throw new Error(`${ctx}: invalid field id "${field.id}"`)
  }
  if (!isString(field.label) || !field.label.trim()) {
    throw new Error(`${ctx}.${field.id}: label is required`)
  }
  if (!FIELD_TYPES.has(field.type)) {
    throw new Error(`${ctx}.${field.id}: unknown field type "${field.type}"`)
  }
  if (!Array.isArray(field.showIn) || field.showIn.length === 0) {
    throw new Error(`${ctx}.${field.id}: showIn must be a non-empty array`)
  }
  for (const s of field.showIn) {
    if (!SCOPES.includes(s)) {
      throw new Error(`${ctx}.${field.id}: invalid scope "${s}" in showIn`)
    }
  }
  if (field.type === 'select') {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      throw new Error(`${ctx}.${field.id}: select field requires options[]`)
    }
    for (const opt of field.options) {
      if (!opt || !isString(opt.value) || !isString(opt.label)) {
        throw new Error(`${ctx}.${field.id}: each option needs string value & label`)
      }
    }
  }
}

function validateSchema (schema) {
  if (!schema || typeof schema !== 'object') throw new Error('schema must be an object')
  if (!Array.isArray(schema.sections)) throw new Error('schema.sections must be an array')
  const seenSection = new Set()
  for (const section of schema.sections) {
    if (!isString(section.id) || !ID_RE.test(section.id)) {
      throw new Error(`section id "${section.id}" is invalid`)
    }
    if (seenSection.has(section.id)) throw new Error(`duplicate section id "${section.id}"`)
    seenSection.add(section.id)
    if (!isString(section.label) || !section.label.trim()) {
      throw new Error(`section "${section.id}": label required`)
    }
    if (!Array.isArray(section.groups)) throw new Error(`section "${section.id}": groups must be array`)
    const seenGroup = new Set()
    for (const group of section.groups) {
      if (!isString(group.id) || !ID_RE.test(group.id)) {
        throw new Error(`section ${section.id}: group id "${group.id}" is invalid`)
      }
      if (seenGroup.has(group.id)) {
        throw new Error(`section ${section.id}: duplicate group id "${group.id}"`)
      }
      seenGroup.add(group.id)
      if (!isString(group.label) || !group.label.trim()) {
        throw new Error(`${section.id}.${group.id}: label required`)
      }
      if (!Array.isArray(group.fields)) {
        throw new Error(`${section.id}.${group.id}: fields must be array`)
      }
      const seenField = new Set()
      for (const field of group.fields) {
        validateField(field, `${section.id}.${group.id}`)
        if (seenField.has(field.id)) {
          throw new Error(`${section.id}.${group.id}: duplicate field id "${field.id}"`)
        }
        seenField.add(field.id)
      }
    }
  }
}

/**
 * Ensure the system_config_schema collection exists. ABDB will throw if
 * createCollection is called for an existing collection; the helper swallows
 * the duplicate error like ensureImportCollectionsExist does.
 */
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
 * Flatten a schema to the set of fully-qualified field paths it defines.
 */
function pathsInSchema (schema) {
  const out = new Set()
  if (!schema || !Array.isArray(schema.sections)) return out
  for (const section of schema.sections) {
    if (!section || !Array.isArray(section.groups)) continue
    for (const group of section.groups) {
      if (!group || !Array.isArray(group.fields)) continue
      for (const field of group.fields) {
        if (field && field.id) {
          out.add(`${section.id}/${group.id}/${field.id}`)
        }
      }
    }
  }
  return out
}

/**
 * Delete every system_config_data document whose `path` is in the given set,
 * across all scopes. Uses deleteMany when available, falls back to per-doc
 * deletes if the driver doesn't support $in or deleteMany.
 */
async function cascadeDeleteData (client, removedPaths, logger) {
  if (!removedPaths || removedPaths.size === 0) {
    return { deletedCount: 0, deletedPaths: [] }
  }
  const dataCollection = await client.collection('system_config_data')
  const paths = [...removedPaths]
  let deletedCount = 0
  try {
    const res = await dataCollection.deleteMany({ path: { $in: paths } })
    deletedCount = (res && (res.deletedCount ?? res.deleted ?? 0)) || 0
  } catch (e) {
    logger.warn(`deleteMany unsupported (${e.message}); falling back to find+deleteOne`)
    for (const path of paths) {
      try {
        const docs = await dataCollection.find({ path }).toArray()
        for (const doc of docs) {
          await dataCollection.deleteOne({ _id: doc._id })
          deletedCount++
        }
      } catch (innerErr) {
        logger.warn(`Failed to delete docs for path ${path}: ${innerErr.message}`)
      }
    }
  }
  logger.info(`Cascade-deleted ${deletedCount} document(s) for paths: ${paths.join(', ')}`)
  return { deletedCount, deletedPaths: paths }
}

async function main (params) {
  const logger = Core.Logger('system-config-schema', { level: params.LOG_LEVEL || 'info' })

  const errorMessage = checkMissingRequestInputs(params, ['operation'], [])
  if (errorMessage) return errorResponse(400, errorMessage, logger)

  let dbHandle
  try {
    dbHandle = await getClient(params)
  } catch (e) {
    logger.error(`ABDB connect failed: ${e.message}`)
    return errorResponse(500, `ABDB connect failed: ${e.message}`, logger)
  }
  const { client, close } = dbHandle

  try {
    const op = params.operation
    await ensureCollection(client)
    const collection = await client.collection(COLLECTION)

    if (op === 'get') {
      const doc = await tryFindOne(collection, { _id: DOC_ID })
      const schema = (doc && doc.schema) || emptySchema()
      return {
        statusCode: 200,
        body: { message: 'Schema fetched', schema }
      }
    }

    // Mutations beyond 'get' require admin role — resolved SERVER-SIDE from
    // the caller's token via the ims-access hook (authoritative). Falls back
    // to the client-supplied params.role only when the hook isn't installed.
    if (op === 'save' || op === 'reset' || op === 'import') {
      if (rbacHook && rbacHook.assertMinRole) {
        let roleErr = null
        try { roleErr = await rbacHook.assertMinRole(params, 'admin') } catch (_) { roleErr = null }
        if (roleErr) return errorResponse(403, roleErr, logger)
      } else {
        const callerRole = typeof params.role === 'string' ? params.role : null
        if (callerRole && callerRole !== 'admin') {
          return errorResponse(403, `Schema editing requires 'admin' role (caller has '${callerRole}')`, logger)
        }
      }
    }

    if (op === 'save') {
      if (!params.schema) {
        return errorResponse(400, 'schema is required', logger)
      }
      try {
        validateSchema(params.schema)
      } catch (e) {
        return errorResponse(400, `Invalid schema: ${e.message}`, logger)
      }
      const now = new Date().toISOString()
      const existing = await tryFindOne(collection, { _id: DOC_ID })

      // Detect removed paths against the previously stored schema so we can
      // cascade-delete their values from system_config_data after the save.
      const prevPaths = pathsInSchema(existing && existing.schema)
      const nextPaths = pathsInSchema(params.schema)
      const removedPaths = new Set(
        [...prevPaths].filter((p) => !nextPaths.has(p))
      )

      // Caller must explicitly opt into the cascade by passing
      // `confirmCascade: true` (or the equivalent string). Without it we
      // refuse to save when removals are detected so the UI can confirm
      // with the user first.
      const cascadeConfirmed =
        params.confirmCascade === true || params.confirmCascade === 'true'
      if (removedPaths.size > 0 && !cascadeConfirmed) {
        return {
          statusCode: 409,
          body: {
            error: 'Schema removes paths — confirmation required',
            removedPaths: [...removedPaths]
          }
        }
      }

      let writeResult
      if (existing) {
        writeResult = await collection.updateOne(
          { _id: DOC_ID },
          { $set: { schema: params.schema, updatedAt: now } }
        )
      } else {
        writeResult = await collection.insertOne({
          _id: DOC_ID,
          schema: params.schema,
          createdAt: now,
          updatedAt: now
        })
      }
      logger.info(
        `Schema saved (existing=${!!existing}, removed=${removedPaths.size}, result=${JSON.stringify(writeResult)})`
      )

      // Round-trip verify so silent no-op writes surface immediately.
      const verify = await tryFindOne(collection, { _id: DOC_ID })
      if (!verify || !verify.schema) {
        return errorResponse(
          500,
          'Schema write completed but document is missing — check ABDB region/permissions',
          logger
        )
      }

      // Cascade delete only AFTER the schema upsert verifies — we don't
      // want to lose data if the schema write fails.
      let cascade = { deletedCount: 0, deletedPaths: [] }
      if (removedPaths.size > 0) {
        cascade = await cascadeDeleteData(client, removedPaths, logger)
      }

      return {
        statusCode: 200,
        body: {
          message: 'Schema saved',
          schema: verify.schema,
          removedPaths: [...removedPaths],
          deletedCount: cascade.deletedCount
        }
      }
    }

    if (op === 'reset') {
      // Reset wipes the schema doc; cascade-delete every stored value so the
      // store doesn't keep orphan rows pointing at nothing.
      const existing = await tryFindOne(collection, { _id: DOC_ID })
      const prevPaths = pathsInSchema(existing && existing.schema)
      await collection.deleteOne({ _id: DOC_ID })
      let cascade = { deletedCount: 0, deletedPaths: [] }
      if (prevPaths.size > 0) {
        cascade = await cascadeDeleteData(client, prevPaths, logger)
      }
      return {
        statusCode: 200,
        body: {
          message: 'Schema reset',
          schema: emptySchema(),
          removedPaths: [...prevPaths],
          deletedCount: cascade.deletedCount
        }
      }
    }

    return errorResponse(400, `Unknown operation "${op}". Expected get|save|reset`, logger)
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'Schema action failed', logger)
  } finally {
    try {
      await close()
    } catch (_) {
      // ignore
    }
  }
}

exports.main = main
