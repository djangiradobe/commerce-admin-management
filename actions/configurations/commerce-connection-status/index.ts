/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, requireRole } = require('../../utils')
const { probeCommerceCreds } = require('../../commerce-creds')

async function main (params) {
  const logger = Core.Logger('commerce-connection-status', { level: params.LOG_LEVEL || 'info' })
  const gate = await requireRole(params, 'viewer')
  if (gate) return gate
  try {
    const probe = await probeCommerceCreds(params)
    if (probe.decryptFailed) {
      // Record exists in ABDB but can't be decrypted with the current
      // SYSTEM_CONFIG_CRYPT_KEY. Don't 500 — return a 200 with the flag
      // so the UI shows the reconfigure wizard with a clear message.
      logger.warn('Stored Commerce creds present but undecryptable — key mismatch')
    }
    return {
      statusCode: 200,
      body: {
        configured: probe.configured,
        decryptFailed: probe.decryptFailed,
        hasRecord: probe.hasRecord,
        creds: probe.creds
      }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'status failed', logger)
  }
}

exports.main = main
