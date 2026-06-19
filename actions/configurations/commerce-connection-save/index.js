/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs } = require('../../utils')
const {
  testCommerceConnection,
  writeCommerceCreds,
  maskCreds
} = require('../../commerce-creds')

async function main (params) {
  const logger = Core.Logger('commerce-connection-save', { level: params.LOG_LEVEL || 'info' })
  try {
    const missing = checkMissingRequestInputs(params, [
      'baseUrl', 'consumerKey', 'consumerSecret', 'accessToken', 'accessTokenSecret'
    ])
    if (missing) return errorResponse(400, missing, logger)

    const creds = {
      baseUrl: params.baseUrl,
      consumerKey: params.consumerKey,
      consumerSecret: params.consumerSecret,
      accessToken: params.accessToken,
      accessTokenSecret: params.accessTokenSecret
    }

    // Validate before persisting unless the caller explicitly opted out.
    const skipTest = params.skipTest === true || params.skipTest === 'true'
    if (!skipTest) {
      const test = await testCommerceConnection(creds, logger)
      if (!test.ok) {
        return {
          statusCode: 200,
          body: { ok: false, saved: false, message: test.message }
        }
      }
    }

    await writeCommerceCreds(params, creds)
    return {
      statusCode: 200,
      body: { ok: true, saved: true, creds: maskCreds(creds) }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'save failed', logger)
  }
}

exports.main = main
