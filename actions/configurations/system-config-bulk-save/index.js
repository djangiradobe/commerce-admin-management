/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Fan-out write: apply { path -> value } to every (scope, scopeId) target
// the caller passes in. Wraps the per-call system-config-save logic so
// validation + audit + encryption all still run per target.

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs } = require('../../utils')
const { main: saveMain } = require('../system-config-save')

async function main (params) {
  const logger = Core.Logger('system-config-bulk-save', { level: params.LOG_LEVEL || 'info' })
  const missing = checkMissingRequestInputs(params, ['values', 'targets'], [])
  if (missing) return errorResponse(400, missing, logger)
  const { values, sensitivePaths = [], targets, actor } = params

  if (!Array.isArray(targets) || targets.length === 0) {
    return errorResponse(400, 'targets must be a non-empty array of { scope, scopeId }', logger)
  }

  const results = []
  for (const t of targets) {
    const scope = t && t.scope
    const scopeId = t && (t.scopeId ?? t.scope_id)
    if (!scope || scopeId == null) {
      results.push({ target: t, ok: false, error: 'missing scope or scopeId' })
      continue
    }
    try {
      const inner = await saveMain({
        ...params,
        values,
        sensitivePaths,
        scope,
        scopeId,
        actor: actor ? `${actor} (bulk)` : 'system:bulk'
      })
      const body = inner?.body || inner
      if (body && body.fieldErrors) {
        results.push({ target: { scope, scopeId }, ok: false, fieldErrors: body.fieldErrors })
      } else {
        results.push({ target: { scope, scopeId }, ok: true, saved: body?.saved || [], deleted: body?.deleted || [] })
      }
    } catch (e) {
      results.push({ target: { scope, scopeId }, ok: false, error: e.message || 'save failed' })
    }
  }

  const failed = results.filter((r) => !r.ok)
  return {
    statusCode: 200,
    body: {
      ok: failed.length === 0,
      total: results.length,
      succeeded: results.length - failed.length,
      failed: failed.length,
      results
    }
  }
}

exports.main = main
