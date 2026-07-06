/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

require('dotenv').config()
const { Core } = require('@adobe/aio-sdk')

function getMissingKeys (obj, required) {
  return required.filter((r) => {
    const splits = r.split('.')
    const last = splits[splits.length - 1]
    const traverse = splits.slice(0, -1).reduce((tObj, split) => (tObj[split] || {}), obj)
    return traverse[last] === undefined || traverse[last] === ''
  })
}

/**
 * Validate that required params (and optionally headers) are present on the
 * OpenWhisk action input. Returns null when complete, or an error string the
 * caller can hand straight to `errorResponse`.
 */
function checkMissingRequestInputs (params, requiredParams = [], requiredHeaders = []) {
  let errorMessage = null
  const safeParams = params ?? {}
  requiredHeaders = requiredHeaders.map((h) => h.toLowerCase())

  const missingHeaders = getMissingKeys(safeParams.__ow_headers || {}, requiredHeaders)
  if (missingHeaders.length > 0) {
    errorMessage = `missing header(s) '${missingHeaders}'`
  }
  const missingParams = getMissingKeys(safeParams, requiredParams)
  if (missingParams.length > 0) {
    errorMessage = errorMessage ? `${errorMessage} and ` : ''
    errorMessage += `missing parameter(s) '${missingParams}'`
  }
  return errorMessage
}

/**
 * Standard OpenWhisk-friendly error envelope.
 */
function errorResponse (statusCode, message, logger) {
  if (logger && typeof logger.info === 'function') {
    logger.info(`${statusCode}: ${message}`)
  }
  return {
    error: {
      statusCode,
      body: { error: message }
    }
  }
}

/**
 * Lightweight logger wrapper used by action handlers that need to emit a
 * log line under a different module name without holding a Core.Logger
 * reference.
 */
function logDetails (logName, message, type = 'info') {
  const logger = Core.Logger(logName, { level: type || 'info' })
  if (type === 'debug') logger.debug(message)
  else if (type === 'error') logger.error(message)
  else logger.info(message)
}

// ── Shared authorization gate ──────────────────────────────────────────────
// One consistent entry point every action uses, so the RBAC pattern can't
// drift per-action. Soft-depends on the ims-access hook (literal require so
// esbuild bundles it; see system-config-save for the rationale). When the
// RBAC add-on isn't installed there's no role system → the app is open
// (single-tenant), so these return "allowed".
let _rbacHook = null
try { _rbacHook = require('@adobedjangir/commerce-admin-ims-access/hook') } catch (_) { _rbacHook = null }

/**
 * Require a minimum role. Returns an error RESPONSE ({statusCode:403,...}) to
 * return directly, or null when allowed.
 * @param {object} opts { failClosed } — deny on resolution error (use for
 *        credential export/write actions).
 */
async function requireRole (params, minRole, opts: any = {}) {
  if (!_rbacHook || !_rbacHook.assertMinRole) return null // no RBAC add-on → open
  try {
    const err = await _rbacHook.assertMinRole(params, minRole, opts)
    return err ? { statusCode: 403, body: { error: err } } : null
  } catch (e) {
    return opts.failClosed
      ? { statusCode: 403, body: { error: 'Access check failed — denying (fail-closed).' } }
      : null
  }
}

/**
 * Require a VALID Adobe IMS token (authentication, independent of role).
 * Returns an error RESPONSE or null. Use for actions that proxy privileged
 * server-held credentials and must never run unauthenticated.
 */
async function requireValidToken (params) {
  if (!_rbacHook || !_rbacHook.assertValidCaller) return null // no RBAC add-on → open
  try {
    const err = await _rbacHook.assertValidCaller(params)
    return err ? { statusCode: 401, body: { error: err } } : null
  } catch (_) {
    return { statusCode: 401, body: { error: 'Could not validate token.' } }
  }
}

/** Resolve the caller's role server-side ('admin'|'editor'|'viewer'|null). */
async function resolveCallerRole (params) {
  if (!_rbacHook || !_rbacHook.resolveCallerRole) return null
  try { return await _rbacHook.resolveCallerRole(params) } catch (_) { return null }
}

module.exports = {
  errorResponse,
  checkMissingRequestInputs,
  logDetails,
  requireRole,
  requireValidToken,
  resolveCallerRole
}
