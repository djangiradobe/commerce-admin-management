/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import builtinNav from './nav.json'
import { BUILT_IN_PAGES } from './pages'

/**
 * Default OpenWhisk action keys for the CORE package only.
 *
 * Add-on packages (`@adobedjangir/commerce-admin-audit-log`,
 * `commerce-admin-snapshots`, `commerce-admin-ims-access`) ship their own
 * action keys and register them at runtime via
 *   configureWeb({ actionKeys: { ... } })
 * so this map stays focused on what core actually deploys.
 */
export const DEFAULT_ACTION_KEYS = {
  commerceRestGet: 'CommerceAdminManagement/commerce-rest-get',
  systemConfigList: 'CommerceAdminManagement/system-config-list',
  systemConfigSave: 'CommerceAdminManagement/system-config-save',
  systemConfigSchema: 'CommerceAdminManagement/system-config-schema',
  exportConfig: 'CommerceAdminManagement/export-config',
  importConfig: 'CommerceAdminManagement/import-config',
  syncStoreMappings: 'CommerceAdminManagement/sync-store-mappings-from-commerce',
  commerceConnectionStatus: 'CommerceAdminManagement/commerce-connection-status',
  commerceConnectionTest: 'CommerceAdminManagement/commerce-connection-test',
  commerceConnectionSave: 'CommerceAdminManagement/commerce-connection-save',
  systemConfigBulkSave: 'CommerceAdminManagement/system-config-bulk-save'
}

let extensionId = 'CommerceAdminManagement'
let actionUrls = {}
let actionKeys = { ...DEFAULT_ACTION_KEYS }
// Pluggable bits add-ons can register. `userRoleProvider` is the
// useUserRole hook from ims-access; `roleBadge` is the badge component
// for the top nav. When unset, core falls back to no-op stubs (caller
// treated as admin, no badge rendered).
let userRoleProvider = null
let roleBadgeComponent = null
export function getUserRoleProvider () {
  return userRoleProvider || (() => ({ role: 'admin', loading: false, groups: [], profile: null }))
}
export function getRoleBadgeComponent () {
  return roleBadgeComponent
}

// Nav + page registries. Built-ins from this package merge with whatever the
// host app passes via configureWeb({ extraNav, extraPages }). Host entries win
// on id collisions so consumers can override built-in pages.
const builtinNavItems = Array.isArray(builtinNav && builtinNav.items) ? builtinNav.items : []
let extraNavItems = []
let extraPages = {}

export function getExtensionId () {
  return extensionId
}

export function getActionKey (name) {
  return actionKeys[name] || name
}

export function getActionUrl (actionKey) {
  if (actionUrls[actionKey]) return actionUrls[actionKey]
  // Add-on actions (AuditLog/…, Snapshots/…, ImsAccess/…) deploy under the
  // `application` build target, so they're absent from the EXTENSION's
  // generated config.json (which only carries commerce/backend-ui/1
  // actions). They still deploy to the same namespace, so derive their URL
  // from the shared base of any known action URL:
  //   https://<ns>.adobeio-static.net/api/v1/web/  +  <Package>/<action>
  const known = Object.values(actionUrls).find((u) => typeof u === 'string' && /\/api\/v1\/web\//.test(u))
  if (known) {
    const m = String(known).match(/^(https?:\/\/[^/]+\/api\/v1\/web\/)/)
    if (m) return m[1] + actionKey
  }
  return undefined
}

/**
 * Resolved nav list = built-in followed by host extras. Duplicate `id`s
 * (host overriding built-in) keep the host's entry but the built-in slot.
 *
 * Each item is either a leaf (`{ id, path, label, icon }`) or a parent with
 * a `children` array of leaves. The router walks children when resolving
 * the active page (see flattenNavItems below).
 */
export function getNavItems () {
  // Merge built-in + host/add-on extras by id (later wins). Deep-clone
  // each entry (incl. its children) so we never mutate the module-level
  // source arrays across calls.
  const byId = new Map()
  const clone = (it) => ({ ...it, children: Array.isArray(it.children) ? it.children.map((c) => ({ ...c })) : undefined })
  for (const it of builtinNavItems) byId.set(it.id, clone(it))
  for (const it of extraNavItems) byId.set(it.id, { ...byId.get(it.id), ...clone(it) })

  // Nest entries that declare `parentId` under the matching parent's
  // `children` array (add-ons register this way to appear inside a
  // dropdown group instead of as a flat top-level tab). Entries whose
  // parent isn't registered stay top-level so they never silently vanish.
  const all = Array.from(byId.values())
  const topLevel = []
  for (const it of all) {
    if (it.parentId && byId.has(it.parentId)) {
      const parent = byId.get(it.parentId)
      parent.children = Array.isArray(parent.children) ? parent.children : []
      if (!parent.children.some((c) => c.id === it.id)) {
        const { parentId, ...leaf } = it
        parent.children.push(leaf)
      }
    } else {
      topLevel.push(it)
    }
  }
  return topLevel
}

/**
 * Walk nav items and emit one entry per leaf (item OR child). Used by
 * MainPage to map `location.pathname` → page component.
 */
export function flattenNavItems (items = getNavItems()) {
  const out = []
  for (const it of items || []) {
    if (Array.isArray(it.children) && it.children.length) {
      for (const c of it.children) {
        if (c && c.id && c.path) out.push({ ...c, parentId: it.id })
      }
    } else if (it && it.id && it.path) {
      out.push(it)
    }
  }
  return out
}

/**
 * Resolve a nav id to its React component. Host extras override built-ins.
 */
export function getPageComponent (id) {
  if (extraPages && extraPages[id]) return extraPages[id]
  return BUILT_IN_PAGES[id] || null
}

/**
 * Configure the web UI before rendering.
 *
 * @param {object} [options]
 * @param {string} [options.extensionId]
 * @param {Record<string, string>} [options.actionUrls]
 * @param {Partial<typeof DEFAULT_ACTION_KEYS>} [options.actionKeys]
 * @param {Array<{ id: string, path: string, label: string, icon?: string }>} [options.extraNav]
 *        Additional nav entries appended after the package's built-ins.
 * @param {Record<string, import('react').ComponentType<any>>} [options.extraPages]
 *        Map of nav `id` → React component, registered from the host app.
 */
export function configureWeb ({
  extensionId: nextExtensionId,
  actionUrls: nextActionUrls,
  actionKeys: nextActionKeys,
  extraNav: nextExtraNav,
  extraPages: nextExtraPages,
  userRoleProvider: nextUserRoleProvider,
  roleBadge: nextRoleBadge
} = {}) {
  if (typeof nextUserRoleProvider === 'function') userRoleProvider = nextUserRoleProvider
  if (nextRoleBadge != null) roleBadgeComponent = nextRoleBadge
  if (nextExtensionId != null) {
    extensionId = String(nextExtensionId)
  }
  if (nextActionUrls) {
    actionUrls = { ...nextActionUrls }
  }
  if (nextActionKeys) {
    actionKeys = { ...actionKeys, ...nextActionKeys }
  }
  if (Array.isArray(nextExtraNav)) {
    // APPEND-and-dedup-by-id. Each add-on calls configureWeb({extraNav})
    // with its own single entry; we accumulate them across calls. New
    // entries with an existing id overwrite the prior one (host can
    // override an add-on's nav this way).
    const byId = new Map(extraNavItems.map((it) => [it.id, it]))
    for (const it of nextExtraNav) {
      if (it && it.id && (it.path || (Array.isArray(it.children) && it.children.length))) {
        byId.set(it.id, it)
      }
    }
    extraNavItems = Array.from(byId.values())
  }
  if (nextExtraPages && typeof nextExtraPages === 'object') {
    // APPEND merge — same rationale.
    extraPages = { ...extraPages, ...nextExtraPages }
  }
}

/**
 * Reset all configureWeb state — useful in tests, never called from the
 * shipped UI. Not exported through web/index.js.
 */
export function __resetConfigureWeb () {
  extraNavItems = []
  extraPages = {}
  actionKeys = { ...DEFAULT_ACTION_KEYS }
  actionUrls = {}
  extensionId = 'CommerceAdminManagement'
}
