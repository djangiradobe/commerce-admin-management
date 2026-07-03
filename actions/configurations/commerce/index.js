/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, checkMissingRequestInputs, requireValidToken } = require('../../utils')
const { getStoredCommerceOauthClient } = require('../../commerce-creds')

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    const requiredParams = ['operation']
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    // SECURITY: this proxies arbitrary Commerce REST calls using SERVER-HELD
    // credentials. "Authorization header present" is not enough — validate the
    // token against IMS so an arbitrary/invalid Authorization value can't use
    // our credentials. (No-op when the RBAC add-on isn't installed.)
    const authGate = await requireValidToken(params)
    if (authGate) return authGate

    let oauth
    try {
      oauth = await getStoredCommerceOauthClient(params, logger)
    } catch (e) {
      if (e.code === 'COMMERCE_NOT_CONFIGURED') {
        return errorResponse(412, e.message, logger)
      }
      throw e
    }

    const content = await oauth.get(params.operation)
    return { statusCode: 200, body: content }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error, logger)
  }
}

exports.main = main
