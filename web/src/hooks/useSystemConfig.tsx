/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import { callAction, resolveActor } from '../utils'
import { getActionKey } from '../settings'
import { flattenFields, isFieldVisibleAtScope, validateFieldValue } from '../schema/systemConfigSchema'
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
            scopeId: '0',
            // Flag automatic store-mappings refreshes distinctly so the audit
            // log doesn't blame the operator for system-driven syncs.
            actor: 'system:store-mappings-sync'
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

  // Server-side validation errors returned by the last save attempt.
  // Cleared whenever the user touches any field.
  const [serverFieldErrors, setServerFieldErrors] = useState({})
  useEffect(() => {
    if (Object.keys(serverFieldErrors).length === 0) return
    setServerFieldErrors({})
    // intentionally only re-run when localValues change shape:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(localValues).join('|')])

  // Live client-side validation. We only validate fields the user has
  // actually edited (`localValues`) — pristine fields stay quiet to avoid
  // shouting red on a freshly-loaded form.
  const fieldErrors = useMemo(() => {
    const errs = {}
    const byPath = new Map(fields.map((f) => [f.path, f.field]))
    for (const [path, value] of Object.entries(localValues)) {
      const f = byPath.get(path)
      if (!f) continue
      // Sentinels aren't user values — don't validate them.
      if (value === USE_DEFAULT_SENTINEL) continue
      if (value === SENSITIVE_PLACEHOLDER) continue
      const err = validateFieldValue(f, value)
      if (err) errs[path] = err
    }
    return errs
  }, [fields, localValues])

  // Combined errors map (live + last-server). Server errors stay sticky
  // until the user edits the offending field, which usually points at the
  // actual problem.
  const combinedErrors = useMemo(
    () => ({ ...serverFieldErrors, ...fieldErrors }),
    [serverFieldErrors, fieldErrors]
  )
  const hasErrors = Object.keys(combinedErrors).length > 0

  /**
   * Materialise the exact diff that will be sent to the server. Returns
   * `[{ path, label, sectionLabel, groupLabel, oldValue, newValue, action, sensitive }]`.
   * Used by the diff-preview modal to show the operator what's about to land.
   */
  const computeDiff = useCallback(() => {
    const byPath = new Map(fields.map((f) => [f.path, f]))
    const rows = []
    const visibleFieldsByPath = new Map(
      fields
        .filter((f) => isFieldVisibleAtScope(f.field, scope.scope))
        .map((f) => [f.path, f])
    )
    for (const [path, value] of Object.entries(localValues)) {
      if (!visibleFieldsByPath.has(path)) continue
      const meta = byPath.get(path)
      const oldServer = serverItems[path]
      let action
      if (value === USE_DEFAULT_SENTINEL) action = 'inherit'
      else if (value === SENSITIVE_PLACEHOLDER) continue // no-op
      else if (oldServer && oldServer.value !== undefined) action = 'update'
      else action = 'create'
      rows.push({
        path,
        label: meta?.field?.label || meta?.field?.id || path,
        sectionLabel: meta?.section?.label || meta?.section?.id,
        groupLabel: meta?.group?.label || meta?.group?.id,
        oldValue: meta?.sensitive ? '[encrypted]' : (oldServer?.value ?? null),
        newValue: meta?.sensitive ? '[encrypted]' : value,
        action,
        sensitive: !!meta?.sensitive
      })
    }
    return rows
  }, [fields, localValues, serverItems, scope])

  const save = useCallback(async () => {
    if (dirtyCount === 0) return true
    if (hasErrors) {
      setError('Fix validation errors before saving')
      return false
    }
    setSaving(true)
    setError(null)
    setServerFieldErrors({})
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
      const res = await callAction(
        props,
        getActionKey('systemConfigSave'),
        '',
        {
          values: payload,
          sensitivePaths,
          scope: scope.scope,
          scopeId: scope.scopeId,
          // Per-user audit attribution — resolved from the IMS profile so
          // audit rows show the operator instead of the org id.
          actor: resolveActor(props.ims),
          // Caller-side role hint for RBAC. Server still enforces.
          role: props.userRole || undefined
        }
      )
      // The action returns `{ statusCode, body }` shape via callAction.
      const body = res?.body || res
      if (body && body.fieldErrors) {
        setServerFieldErrors(body.fieldErrors)
        setError(body.error || 'Server rejected the save')
        return false
      }
      setSavedAt(Date.now())
      await fetchAtScope()
      return true
    } catch (e) {
      // callAction throws non-2xx as Error with .response set.
      const resp = e && e.response
      if (resp && resp.fieldErrors) setServerFieldErrors(resp.fieldErrors)
      else if (resp && resp.body && resp.body.fieldErrors) setServerFieldErrors(resp.body.fieldErrors)
      console.error('Failed to save system config', e)
      setError(e.message || 'Failed to save system config')
      return false
    } finally {
      setSaving(false)
    }
  }, [props, dirtyCount, hasErrors, localValues, sensitivePaths, scope, fields, fetchAtScope])

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
    fieldErrors: combinedErrors,
    hasErrors,
    computeDiff,
    SENSITIVE_PLACEHOLDER,
    USE_DEFAULT_SENTINEL
  }
}
