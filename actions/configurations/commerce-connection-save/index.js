/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs } = require('../../utils')
const {
  testCommerceConnection,
  writeCommerceCreds,
  maskCreds,
  CONNECTION_TYPE_PAAS,
  CONNECTION_TYPE_SAAS,
  CONNECTION_TYPES
} = require('../../commerce-creds')

/**
 * Accept either PaaS (OAuth1a 5-tuple) or SaaS (baseUrl + bearerToken).
 * The caller passes `connectionType: 'paas' | 'saas'`. Older callers that
 * don't pass `connectionType` are treated as PaaS for backward compat.
 */
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
  const logger = Core.Logger('commerce-connection-save', { level: params.LOG_LEVEL || 'info' })
  try {
    // SaaS only needs baseUrl — apiKey is optional, bearer is minted at
    // runtime from workspace OAUTH_* env vars.
    const requiredByType = params.connectionType === CONNECTION_TYPE_SAAS
      ? ['baseUrl']
      : ['baseUrl', 'consumerKey', 'consumerSecret', 'accessToken', 'accessTokenSecret']
    const missing = checkMissingRequestInputs(params, requiredByType)
    if (missing) return errorResponse(400, missing, logger)

    const creds = buildCredsFromParams(params)

    const skipTest = params.skipTest === true || params.skipTest === 'true'
    if (!skipTest) {
      // Pass params through so SaaS can mint a bearer from OAUTH_*.
      const test = await testCommerceConnection(creds, logger, params)
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
