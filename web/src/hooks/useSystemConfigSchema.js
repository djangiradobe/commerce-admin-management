/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { useCallback, useEffect, useState } from 'react'
import { callAction, callActionGet } from '../utils'
import { getActionKey } from '../settings'
import { emptySchema } from '../schema/systemConfigSchema'

export function useSystemConfigSchema (props) {
  const [schema, setSchema] = useState(emptySchema())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchSchema = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // GET (not POST) so the action's Cache-Control is honored by the gateway
      // — repeat schema loads across the app can be served from cache. Falls
      // back to POST if a GET path ever isn't available.
      let response
      try {
        response = await callActionGet(props, getActionKey('systemConfigSchema'), { operation: 'get' })
      } catch (_) {
        response = await callAction(props, getActionKey('systemConfigSchema'), 'get')
      }
      const fetched = response?.schema || response?.body?.schema || emptySchema()
      setSchema(fetched)
    } catch (e) {
      console.error('Failed to load schema', e)
      setError(e.message || 'Failed to load schema')
      setSchema(emptySchema())
    } finally {
      setLoading(false)
    }
  }, [props])

  useEffect(() => {
    fetchSchema()
  }, [fetchSchema])

  /**
   * Save a schema.
   *
   * If removing fields/groups/sections would orphan stored values, the action
   * returns 409 with a `removedPaths` list. The caller can re-invoke with
   * `confirmCascade: true` to acknowledge the cascade-delete. The hook keeps
   * the UI in charge of asking the user.
   */
  const saveSchema = useCallback(async (nextSchema, { confirmCascade = false } = {}) => {
    setSaving(true)
    setError(null)
    try {
      let response
      try {
        response = await callAction(
          props,
          getActionKey('systemConfigSchema'),
          'save',
          {
            schema: nextSchema,
            // Caller role for the server-side admin gate. Server is
            // authoritative — this is just a hint so the rejection is
            // explicit rather than a generic 500.
            role: props.userRole || undefined,
            ...(confirmCascade ? { confirmCascade: true } : {})
          }
        )
      } catch (err) {
        // 409 = cascade confirmation required. callAction throws on non-2xx
        // so we have to inspect err.response (set by utils.callAction).
        const removed = err?.response?.removedPaths || err?.response?.body?.removedPaths
        if (err?.status === 409 && Array.isArray(removed)) {
          return { needsConfirmation: true, removedPaths: removed }
        }
        throw err
      }
      const saved = response?.schema || response?.body?.schema
      if (!saved) {
        await fetchSchema()
        setError('Schema save did not return the saved schema. See server logs.')
        return { ok: false }
      }
      setSchema(saved)
      return {
        ok: true,
        removedPaths: response?.removedPaths || response?.body?.removedPaths || [],
        deletedCount: response?.deletedCount ?? response?.body?.deletedCount ?? 0
      }
    } catch (e) {
      console.error('Failed to save schema', e)
      setError(e.message || 'Failed to save schema')
      return { ok: false }
    } finally {
      setSaving(false)
    }
  }, [props, fetchSchema])

  return {
    schema,
    setSchema,
    saveSchema,
    refresh: fetchSchema,
    loading,
    saving,
    error
  }
}
