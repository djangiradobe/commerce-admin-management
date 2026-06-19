/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import builtinNav from './nav.json'
import { BUILT_IN_PAGES } from './pages'

/** Default OpenWhisk action keys (must match keys in deploy-time config.json). */
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
  commerceConnectionSave: 'CommerceAdminManagement/commerce-connection-save'
}

let extensionId = 'CommerceAdminManagement'
let actionUrls = {}
let actionKeys = { ...DEFAULT_ACTION_KEYS }

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
  return actionUrls[actionKey]
}

/**
 * Resolved nav list = built-in followed by host extras. Duplicate `id`s
 * (host overriding built-in) keep the host's entry but the built-in slot.
 */
export function getNavItems () {
  const byId = new Map()
  for (const it of builtinNavItems) byId.set(it.id, it)
  for (const it of extraNavItems) byId.set(it.id, { ...byId.get(it.id), ...it })
  return Array.from(byId.values())
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
  extraPages: nextExtraPages
} = {}) {
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
    extraNavItems = nextExtraNav.filter((it) => it && it.id && it.path)
  }
  if (nextExtraPages && typeof nextExtraPages === 'object') {
    extraPages = { ...nextExtraPages }
  }
}
