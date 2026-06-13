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

module.exports = {
  errorResponse,
  checkMissingRequestInputs,
  logDetails
}
