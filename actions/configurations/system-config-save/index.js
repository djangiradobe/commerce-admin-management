/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License");
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
const { validateFieldValue, indexSchemaByPath } = require('../../schema-validation')
const { publishConfigEvent } = require('../../io-events')

const COLLECTION = 'system_config_data'
const SCHEMA_COLLECTION = 'system_config_schema'
const SCHEMA_DOC_ID = 'v1'

// Soft-dependency hooks. When the add-on packages are installed, these
// resolve to the real implementation; when they're not, every call
// silently no-ops. Each add-on's hook is a small, well-defined surface:
//   audit-log/hook  → recordAuditEntries(client, entries, logger)
//   ims-access/hook → checkFieldRole(callerRole, field) → null | error msg
//
// IMPORTANT: these MUST be literal require() strings, not require(variable).
// The action is bundled by esbuild at deploy time; esbuild can only follow —
// and therefore bundle — a require() whose argument is a string literal. A
// require(variable) is left as a runtime require, which then fails inside the
// OpenWhisk sandbox (no node_modules there), silently disabling the hook.
// A literal require() inside try/catch is bundled when the add-on is present
// and degrades gracefully (build warning, runtime null) when it is not.
let auditHook = null
try { auditHook = require('@adobedjangir/commerce-admin-audit-log/hook') } catch (_) { auditHook = null }
let rbacHook = null
try { rbacHook = require('@adobedjangir/commerce-admin-ims-access/hook') } catch (_) { rbacHook = null }

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
    const msg = (err && err.message) ? String(err.message) : String(err)
    if (/not found/i.test(msg)) return null
    throw err
  }
}

async function loadSchema (client) {
  try {
    const col = await client.collection(SCHEMA_COLLECTION)
    const doc = await tryFindOne(col, { _id: SCHEMA_DOC_ID })
    return doc && doc.schema ? doc.schema : null
  } catch (_) {
    return null
  }
}

/**
 * Identify the actor making the change. Prefers an explicit `actor` value
 * from the caller (lets the UI pass an IMS email), otherwise falls back to
 * the x-gw-ims-org-id header so multi-tenant ops at least see the org. If
 * neither is set we record `system`.
 */
function resolveActor (params) {
  if (params.actor && typeof params.actor === 'string') return params.actor
  const headers = params.__ow_headers || {}
  return headers['x-gw-ims-org-id'] || headers['x-ims-org-id'] || 'system'
}

function summarizeForAudit (path, value, sensitive) {
  if (value == null) return null
  if (sensitive) return '[ENCRYPTED]'
  if (typeof value === 'string') {
    // Cap to keep audit docs small.
    return value.length > 500 ? value.slice(0, 500) + '…' : value
  }
  return value
}

// Audit storage moved to @adobedjangir/commerce-admin-audit-log/hook — when
// installed, recordAuditEntries() handles the write. When not, audit
// entries are computed but discarded (write is a soft-no-op).

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
  const actor = resolveActor(params)

  // RBAC gate: writing config requires editor or admin. Viewers are read-only.
  // Enforced server-side via the ims-access hook (resolves the caller's role
  // from their token). Fail-open only when the add-on/role can't be resolved.
  if (rbacHook && rbacHook.assertMinRole) {
    try {
      const roleErr = await rbacHook.assertMinRole(params, 'editor')
      if (roleErr) return { statusCode: 403, body: { error: roleErr } }
    } catch (_) { /* resolution failure → don't block (UI still gates) */ }
  }

  let dbHandle
  try {
    dbHandle = await getClient(params)
  } catch (e) {
    logger.error(`ABDB connect failed: ${e.message}`)
    return errorResponse(500, `ABDB connect failed: ${e.message}`, logger)
  }
  const { client, close } = dbHandle

  try {
    await ensureCollection(client, COLLECTION)
    const collection = await client.collection(COLLECTION)

    // ── Schema validation gate ──
    // Bad values are rejected wholesale: either the whole payload is valid
    // or none of it is written. This prevents partial writes that the UI
    // can't easily recover from.
    const schema = await loadSchema(client)
    if (schema) {
      const fieldByPath = indexSchemaByPath(schema)
      const fieldErrors = {}
      // Caller-supplied role (resolved by the UI via ims-user-profile).
      // RBAC enforcement is delegated to the ims-access add-on's hook —
      // when the add-on isn't installed, requiredRole tags become advisory
      // (UI still hides + disables, but the server can't independently
      // verify, so it doesn't block).
      const callerRole = typeof params.role === 'string' ? params.role : null
      for (const [path, value] of Object.entries(values)) {
        // Skip sentinels — they're not user data.
        if (value === USE_DEFAULT_SENTINEL) continue
        if (sensitiveSet.has(path) && value === SENSITIVE_PLACEHOLDER) continue
        const field = fieldByPath.get(path)
        if (!field) continue // path not in schema — silently allowed (legacy/extension paths)
        const err = validateFieldValue(field, value)
        if (err) fieldErrors[path] = err
        if (rbacHook && rbacHook.checkFieldRole) {
          const roleErr = rbacHook.checkFieldRole(callerRole, field)
          if (roleErr) fieldErrors[path] = roleErr
        }
      }
      if (Object.keys(fieldErrors).length) {
        return {
          statusCode: 400,
          body: { error: 'Validation failed', fieldErrors }
        }
      }
    }

    const now = new Date().toISOString()
    const saved = []
    const deleted = []
    const skipped = []
    const auditEntries = []

    for (const [path, value] of Object.entries(values)) {
      if (!isValidPath(path)) {
        skipped.push({ path, reason: 'invalid path format' })
        continue
      }
      const id = toStateKey(scope, scopeId, path)
      const existing = await tryFindOne(collection, { _id: id })
      const sensitive = sensitiveSet.has(path)

      if (value === USE_DEFAULT_SENTINEL) {
        await collection.deleteOne({ _id: id })
        deleted.push(path)
        if (existing) {
          auditEntries.push({
            scope,
            scope_id: scopeId,
            path,
            action: 'delete',
            oldValue: summarizeForAudit(path, existing.value, sensitive),
            newValue: null,
            changedBy: actor,
            changedAt: now
          })
        }
        continue
      }
      if (sensitive && value === SENSITIVE_PLACEHOLDER) {
        skipped.push({ path, reason: 'masked placeholder, kept existing' })
        continue
      }

      let stored = value
      if (sensitive && stored !== '' && stored != null) {
        stored = encrypt(String(stored), params)
      }

      if (existing) {
        if (existing.value !== stored) {
          await collection.updateOne(
            { _id: id },
            { $set: { value: stored, updatedAt: now } }
          )
          auditEntries.push({
            scope,
            scope_id: scopeId,
            path,
            action: 'update',
            oldValue: summarizeForAudit(path, existing.value, sensitive),
            newValue: summarizeForAudit(path, value, sensitive),
            changedBy: actor,
            changedAt: now
          })
        }
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
        auditEntries.push({
          scope,
          scope_id: scopeId,
          path,
          action: 'create',
          oldValue: null,
          newValue: summarizeForAudit(path, value, sensitive),
          changedBy: actor,
          changedAt: now
        })
      }
      saved.push(path)
    }

    // Audit write — delegated to the audit-log add-on if installed.
    // Failure to log must never fail the save (the add-on's hook is also
    // best-effort internally, this is belt-and-braces).
    if (auditHook && auditHook.recordAuditEntries) {
      try {
        await auditHook.recordAuditEntries(client, auditEntries, logger)
      } catch (e) {
        logger.warn(`audit hook write failed: ${e.message}`)
      }
    }

    // Best-effort I/O Events publish — skipped when not configured.
    if (auditEntries.length) {
      try {
        await publishConfigEvent(params, {
          scope,
          scopeId,
          actor,
          changes: auditEntries.map((e) => ({
            path: e.path,
            action: e.action,
            // Don't put values in events to avoid leaking sensitive data.
            sensitive: sensitiveSet.has(e.path)
          })),
          totalChanges: auditEntries.length
        }, logger)
      } catch (e) {
        logger.warn(`I/O Events publish failed: ${e.message}`)
      }
    }

    const redactedForLog = Object.fromEntries(
      Object.entries(values).map(([p, v]) => [p, sensitiveSet.has(p) ? '[REDACTED]' : v])
    )
    logDetails(
      'system-config-save',
      `scope=${scope}:${scopeId} actor=${actor} payload=${JSON.stringify(redactedForLog)}`
    )

    return {
      statusCode: 200,
      body: { message: 'System config saved', scope, scopeId, saved, deleted, skipped, auditCount: auditEntries.length }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'Failed to save system config', logger)
  } finally {
    try { await close() } catch (_) {}
  }
}

exports.main = main
