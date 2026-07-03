/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

// SaaS / App Management registration action.
//
// The lib-generated registration action (from app.commerce.config →
// adminUiSdk.registration) bakes the titles statically at build time and the
// registration schema has no `page` field. This hand-written variant uses the
// same `registrationRuntimeAction` entry point but builds the registration
// object per-request FROM ACTION INPUTS — so titles come from .env at runtime
// (APP_TITLE / APP_SECTION_TITLE / APP_PAGE_TITLE) and it includes `page.title`,
// exactly like the PaaS registration action (actions/configurations/registration).
import { registrationRuntimeAction } from '@adobe/aio-commerce-lib-app/actions/registration'

const extensionId = 'CommerceAdminManagement'

// Treat empty OR an unsubstituted "$VAR" (when the .env key is absent) as unset.
const clean = (v, fallback) => {
  const s = v == null ? '' : String(v).trim()
  return (!s || s.startsWith('$')) ? fallback : s
}

export const main = (params = {}) => {
  const title = clean(params.APP_TITLE, 'Configuration Management')
  const sectionTitle = clean(params.APP_SECTION_TITLE, 'Apps')
  const pageTitle = clean(params.APP_PAGE_TITLE, title)

  const registration = {
    menuItems: [
      {
        id: `${extensionId}::apps`,
        title: sectionTitle,
        isSection: true,
        sortOrder: 1
      },
      {
        id: `${extensionId}::configuration_management`,
        title,
        parent: `${extensionId}::apps`,
        sortOrder: 10
      }
    ],
    page: {
      title: pageTitle
    }
  }

  return registrationRuntimeAction({ registration })(params)
}
