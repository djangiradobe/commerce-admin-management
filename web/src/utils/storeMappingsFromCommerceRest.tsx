/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

/** @param {string} locale e.g. en_US → en */
function localeToLanguageCode (locale) {
  if (locale == null || locale === '') return null
  const s = String(locale).trim()
  const head = s.split(/[-_]/u)[0]
  if (head && /^[a-zA-Z]{2,8}$/.test(head)) return head.toLowerCase()
  return null
}

/** e.g. en_ch → en, de_ch → de */
function inferLanguageFromStoreCode (code) {
  if (typeof code !== 'string') return null
  const m = /^([a-z]{2})[-_]/i.exec(code)
  return m ? m[1].toLowerCase() : null
}

/**
 * Build `general/settings/store_mappings` shape from Commerce REST payloads
 * (same shape as server middleware expects: keyed by store view id string).
 *
 * @param {object[]|null|undefined} websitesRaw from `store/websites`
 * @param {object[]|null|undefined} storeViewsRaw from `store/storeViews`
 * @param {object[]|null|undefined} storeConfigsRaw from `store/storeConfigs` (optional)
 * @returns {Record<string, { code: string, language_code: string, website_code: string, website_id: string }>}
 */
export function buildStoreMappingsFromCommercePayload (websitesRaw, storeViewsRaw, storeConfigsRaw) {
  const websiteIdToCode = new Map()
  if (Array.isArray(websitesRaw)) {
    for (const w of websitesRaw) {
      if (w && w.id != null && w.code != null) {
        websiteIdToCode.set(String(w.id), String(w.code))
      }
    }
  }

  const storeCodeToLocale = new Map()
  if (Array.isArray(storeConfigsRaw)) {
    for (const cfg of storeConfigsRaw) {
      if (cfg && cfg.code != null && cfg.locale != null) {
        storeCodeToLocale.set(String(cfg.code), String(cfg.locale))
      }
    }
  }

  const mappings = {}
  if (!Array.isArray(storeViewsRaw)) return mappings

  for (const s of storeViewsRaw) {
    if (!s || s.id == null || s.code == null) continue
    const id = String(s.id)
    const code = String(s.code)
    const websiteId = s.website_id != null ? String(s.website_id) : ''
    const websiteCode = websiteIdToCode.get(websiteId) || ''
    const languageCode =
      localeToLanguageCode(storeCodeToLocale.get(code)) ||
      inferLanguageFromStoreCode(code) ||
      'en'
    mappings[id] = {
      code,
      language_code: languageCode,
      website_code: websiteCode,
      website_id: websiteId
    }
  }
  return mappings
}
