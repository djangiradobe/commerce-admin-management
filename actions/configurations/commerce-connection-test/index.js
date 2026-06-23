/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs } = require('../../utils')
const { testCommerceConnection, readCommerceCreds } = require('../../commerce-creds')

async function main (params) {
  const logger = Core.Logger('commerce-connection-test', { level: params.LOG_LEVEL || 'info' })
  try {
    // Allow testing either the form values being entered OR the currently saved creds.
    const type = params.type === 'accs' ? 'accs' : 'oauth1a'
    let creds = type === 'accs'
      ? { type: 'accs', baseUrl: params.baseUrl, imsApiKey: params.imsApiKey }
      : {
          type: 'oauth1a',
          baseUrl: params.baseUrl,
          consumerKey: params.consumerKey,
          consumerSecret: params.consumerSecret,
          accessToken: params.accessToken,
          accessTokenSecret: params.accessTokenSecret
        }
    const allBlank = !creds.baseUrl && !creds.consumerKey && !creds.consumerSecret &&
      !creds.accessToken && !creds.accessTokenSecret && !creds.imsApiKey
    if (allBlank) {
      const saved = await readCommerceCreds(params, { fresh: true })
      if (!saved) {
        return errorResponse(412, 'No creds supplied and none saved', logger)
      }
      creds = saved
    } else {
      const required = type === 'accs'
        ? ['baseUrl']
        : ['baseUrl', 'consumerKey', 'consumerSecret', 'accessToken', 'accessTokenSecret']
      const missing = checkMissingRequestInputs(params, required)
      if (missing) return errorResponse(400, missing, logger)
    }

    const result = await testCommerceConnection(creds, logger, params)
    return {
      statusCode: result.ok ? 200 : 200, // surface failures in body, not HTTP
      body: result
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'test failed', logger)
  }
}

exports.main = main
