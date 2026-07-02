/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import './styles/index.css'

import App from './components/App'
import { MainPage } from './components/MainPage'
import ExtensionRegistration from './components/ExtensionRegistration'
import SystemConfig from './components/SystemConfig'
import SystemConfigSchemaEditor from './components/SystemConfigSchemaEditor'
import AppSectionNav from './components/AppSectionNav'

export { useSystemConfig } from './hooks/useSystemConfig'
export { useSystemConfigSchema } from './hooks/useSystemConfigSchema'
export { useConfirm } from './hooks/useConfirm'

export * from './schema/systemConfigSchema'
export { buildStoreMappingsFromCommercePayload } from './utils/storeMappingsFromCommerceRest'
export { callAction, resolveActor } from './utils'
export {
  configureWeb,
  getExtensionId,
  getActionKey,
  getNavItems,
  getPageComponent,
  getUserRoleProvider,
  DEFAULT_ACTION_KEYS
} from './settings'
export { NAV_ICONS, getNavIcon } from './nav-icons'
export { BUILT_IN_PAGES } from './pages'
export { THEME, PALETTE, RADIUS, SHADOW, SPACE, FONT } from './theme'

export {
  App,
  MainPage,
  ExtensionRegistration,
  SystemConfig,
  SystemConfigSchemaEditor,
  AppSectionNav
}

/** Full Commerce Admin extension shell (router + Spectrum provider). */
export { default as CommerceAdminManagementApp } from './components/App'
