/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

/** Default OpenWhisk action keys (must match keys in deploy-time config.json). */
export const DEFAULT_ACTION_KEYS = {
  commerceRestGet: 'ConfigurationManagement/commerce-rest-get',
  systemConfigList: 'ConfigurationManagement/system-config-list',
  systemConfigSave: 'ConfigurationManagement/system-config-save',
  systemConfigSchema: 'ConfigurationManagement/system-config-schema',
  exportConfig: 'ConfigurationManagement/export-config',
  importConfig: 'ConfigurationManagement/import-config',
  syncStoreMappings: 'ConfigurationManagement/sync-store-mappings-from-commerce'
}

let extensionId = 'ConfigurationManagement'
let actionUrls = {}
let actionKeys = { ...DEFAULT_ACTION_KEYS }

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
 * Configure the web UI before rendering.
 *
 * @param {object} [options]
 * @param {string} [options.extensionId] - UIX guest extension id
 * @param {Record<string, string>} [options.actionUrls] - map of action key → deployed URL (from config.json)
 * @param {Partial<typeof DEFAULT_ACTION_KEYS>} [options.actionKeys] - override default action key names
 */
export function configureWeb ({
  extensionId: nextExtensionId,
  actionUrls: nextActionUrls,
  actionKeys: nextActionKeys
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
}
