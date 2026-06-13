/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import { callAction } from '../utils'
import { getActionKey } from '../settings'
import { flattenFields, isFieldVisibleAtScope } from '../schema/systemConfigSchema'
import { buildStoreMappingsFromCommercePayload } from '../utils/storeMappingsFromCommerceRest'

const SENSITIVE_PLACEHOLDER = '__SENSITIVE_UNCHANGED__'
const USE_DEFAULT_SENTINEL = '__USE_DEFAULT__'
const DEFAULT_SCOPE = { scope: 'default', scopeId: '0' }
const STORE_MAPPINGS_PATH = 'general/settings/store_mappings'

/**
 * @param {object} props
 * @param {object} schema – the dynamic schema fetched from abdb via useSystemConfigSchema
 */
export function useSystemConfig (props, schema) {
  const fields = useMemo(() => flattenFields(schema), [schema])
  const allPaths = useMemo(() => fields.map((f) => f.path), [fields])
  const sensitivePaths = useMemo(
    () => fields.filter((f) => f.sensitive).map((f) => f.path),
    [fields]
  )

  const [scopeTree, setScopeTree] = useState({ websites: [], storeGroups: [], stores: [], loading: true, error: null })
  const [scope, setScope] = useState(DEFAULT_SCOPE)

  const [serverItems, setServerItems] = useState({})
  const [localValues, setLocalValues] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  const parentWebsiteId = useMemo(() => {
    if (scope.scope !== 'stores') return undefined
    const store = scopeTree.stores.find((s) => String(s.id) === String(scope.scopeId))
    return store?.website_id
  }, [scope, scopeTree.stores])

  const fetchScopeTree = useCallback(async () => {
    setScopeTree((prev) => ({ ...prev, loading: true, error: null }))
    try {
      // commerce-rest-get appends `rest/<store>/V1/` itself, so operation
      // must be the resource path without the rest/V1 prefix.
      const [websitesRes, groupsRes, storesRes, configsRes] = await Promise.all([
        callAction(props, getActionKey('commerceRestGet'), 'store/websites'),
        callAction(props, getActionKey('commerceRestGet'), 'store/storeGroups'),
        callAction(props, getActionKey('commerceRestGet'), 'store/storeViews'),
        callAction(props, getActionKey('commerceRestGet'), 'store/storeConfigs').catch(() => null)
      ])
      const websitesRaw = websitesRes?.body || websitesRes
      const groupsRaw = groupsRes?.body || groupsRes
      const storesRaw = storesRes?.body || storesRes
      const configsRaw = configsRes?.body || configsRes
      const websites = Array.isArray(websitesRaw) ? websitesRaw.filter((w) => w.id !== 0 && w.code !== 'admin') : []
      const storeGroups = Array.isArray(groupsRaw) ? groupsRaw.filter((g) => g.id !== 0) : []
      const stores = Array.isArray(storesRaw) ? storesRaw.filter((s) => s.id !== 0 && s.code !== 'admin') : []
      setScopeTree({ websites, storeGroups, stores, loading: false, error: null })

      const storeMappings = buildStoreMappingsFromCommercePayload(websitesRaw, storesRaw, configsRaw)
      if (Object.keys(storeMappings).length > 0) {
        try {
          await callAction(props, getActionKey('systemConfigSave'), '', {
            values: { [STORE_MAPPINGS_PATH]: JSON.stringify(storeMappings, null, 2) },
            sensitivePaths: [],
            scope: 'default',
            scopeId: '0'
          })
        } catch (err) {
          console.error('Failed to persist store_mappings to ABDB after loading Commerce stores', err)
        }
      }
    } catch (e) {
      console.error('Failed to load stores from Commerce', e)
      setScopeTree({ websites: [], storeGroups: [], stores: [], loading: false, error: e.message || 'Failed to fetch stores' })
    }
  }, [props])

  useEffect(() => {
    fetchScopeTree()
  }, [fetchScopeTree])

  const fetchAtScope = useCallback(async () => {
    if (allPaths.length === 0) {
      setServerItems({})
      setLocalValues({})
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await callAction(
        props,
        getActionKey('systemConfigList'),
        '',
        {
          paths: allPaths,
          sensitivePaths,
          scope: scope.scope,
          scopeId: scope.scopeId,
          parentWebsiteId
        }
      )
      const items = response?.items || response?.body?.items || {}
      setServerItems(items)
      setLocalValues({})
    } catch (e) {
      console.error('Failed to load system config', e)
      setError(e.message || 'Failed to load system config')
    } finally {
      setLoading(false)
    }
  }, [props, allPaths, sensitivePaths, scope, parentWebsiteId])

  useEffect(() => {
    fetchAtScope()
  }, [fetchAtScope])

  const getDisplayValue = useCallback((path, fallback) => {
    if (Object.prototype.hasOwnProperty.call(localValues, path)) {
      return localValues[path]
    }
    const item = serverItems[path]
    if (item && item.value !== undefined) return item.value
    return fallback
  }, [localValues, serverItems])

  const getOrigin = useCallback((path) => {
    const item = serverItems[path]
    return item?.origin || null
  }, [serverItems])

  const isInheritedAtScope = useCallback((path) => {
    if (scope.scope === 'default') return false
    if (Object.prototype.hasOwnProperty.call(localValues, path)) {
      return localValues[path] === USE_DEFAULT_SENTINEL
    }
    const origin = getOrigin(path)
    if (!origin) return true
    return !(origin.scope === scope.scope && String(origin.scopeId) === String(scope.scopeId))
  }, [scope, localValues, getOrigin])

  const setFieldValue = useCallback((path, value) => {
    setLocalValues((prev) => ({ ...prev, [path]: value }))
  }, [])

  const setUseDefault = useCallback((path, useDefault) => {
    setLocalValues((prev) => {
      const next = { ...prev }
      if (useDefault) {
        next[path] = USE_DEFAULT_SENTINEL
      } else {
        const current = serverItems[path]?.value
        next[path] = current !== undefined ? current : ''
      }
      return next
    })
  }, [serverItems])

  const dirtyCount = useMemo(() => Object.keys(localValues).length, [localValues])

  const save = useCallback(async () => {
    if (dirtyCount === 0) return true
    setSaving(true)
    setError(null)
    try {
      const visibleFieldsByPath = new Map(
        fields
          .filter((f) => isFieldVisibleAtScope(f.field, scope.scope))
          .map((f) => [f.path, f])
      )
      const payload = {}
      for (const [path, value] of Object.entries(localValues)) {
        if (!visibleFieldsByPath.has(path)) continue
        payload[path] = value
      }
      if (Object.keys(payload).length === 0) {
        setSaving(false)
        return true
      }
      await callAction(
        props,
        getActionKey('systemConfigSave'),
        '',
        {
          values: payload,
          sensitivePaths,
          scope: scope.scope,
          scopeId: scope.scopeId
        }
      )
      setSavedAt(Date.now())
      await fetchAtScope()
      return true
    } catch (e) {
      console.error('Failed to save system config', e)
      setError(e.message || 'Failed to save system config')
      return false
    } finally {
      setSaving(false)
    }
  }, [props, dirtyCount, localValues, sensitivePaths, scope, fields, fetchAtScope])

  const reset = useCallback(() => {
    setLocalValues({})
  }, [])

  return {
    fields,
    scope,
    setScope,
    scopeTree,
    refreshScopeTree: fetchScopeTree,
    getDisplayValue,
    getOrigin,
    isInheritedAtScope,
    setFieldValue,
    setUseDefault,
    dirtyCount,
    loading,
    saving,
    error,
    savedAt,
    save,
    reset,
    refresh: fetchAtScope,
    SENSITIVE_PLACEHOLDER,
    USE_DEFAULT_SENTINEL
  }
}
