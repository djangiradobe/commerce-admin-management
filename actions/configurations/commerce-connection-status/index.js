/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { readCommerceCreds, maskCreds } = require('../../commerce-creds')

async function main (params) {
  const logger = Core.Logger('commerce-connection-status', { level: params.LOG_LEVEL || 'info' })
  try {
    const creds = await readCommerceCreds(params, { fresh: params.fresh === true || params.fresh === 'true' })
    return {
      statusCode: 200,
      body: {
        configured: !!(creds && creds.baseUrl),
        creds: creds ? maskCreds(creds) : null
      }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'status failed', logger)
  }
}

exports.main = main
