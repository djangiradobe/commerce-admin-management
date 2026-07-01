/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs } = require('../../utils')
const {
  testCommerceConnection,
  readCommerceCreds,
  CONNECTION_TYPE_PAAS,
  CONNECTION_TYPE_SAAS,
  CONNECTION_TYPES
} = require('../../commerce-creds')

function buildCredsFromParams (params) {
  const type = CONNECTION_TYPES.includes(params.connectionType)
    ? params.connectionType
    : CONNECTION_TYPE_PAAS
  if (type === CONNECTION_TYPE_SAAS) {
    return {
      connectionType: CONNECTION_TYPE_SAAS,
      baseUrl: params.baseUrl,
      apiKey: params.apiKey || '',
      testPath: params.testPath
    }
  }
  return {
    connectionType: CONNECTION_TYPE_PAAS,
    baseUrl: params.baseUrl,
    consumerKey: params.consumerKey,
    consumerSecret: params.consumerSecret,
    accessToken: params.accessToken,
    accessTokenSecret: params.accessTokenSecret
  }
}

async function main (params) {
  const logger = Core.Logger('commerce-connection-test', { level: params.LOG_LEVEL || 'info' })
  try {
    // Test either form-supplied values or fall back to the currently-saved creds.
    const anyFormValue = params.baseUrl || params.consumerKey || params.apiKey ||
      params.consumerSecret || params.accessToken || params.accessTokenSecret
    let creds
    if (!anyFormValue) {
      const saved = await readCommerceCreds(params, { fresh: true })
      if (!saved) return errorResponse(412, 'No creds supplied and none saved', logger)
      creds = saved
    } else {
      const requiredByType = params.connectionType === CONNECTION_TYPE_SAAS
        ? ['baseUrl']
        : ['baseUrl', 'consumerKey', 'consumerSecret', 'accessToken', 'accessTokenSecret']
      const missing = checkMissingRequestInputs(params, requiredByType)
      if (missing) return errorResponse(400, missing, logger)
      creds = buildCredsFromParams(params)
    }

    const result = await testCommerceConnection(creds, logger, params)
    return {
      statusCode: 200, // surface failures in body, not HTTP
      body: result
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'test failed', logger)
  }
}

exports.main = main
