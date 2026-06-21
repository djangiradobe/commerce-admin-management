#!/usr/bin/env node
/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const fs = require('fs')
const path = require('path')

const EXTENSION_POINT = 'commerce/backend-ui/1'
const INCLUDE_REL = 'node_modules/@adobedjangir/commerce-admin-management/actions/configurations/ext.config.yaml'
const MARKER = '# @adobedjangir/commerce-admin-management (auto-linked on npm install)'

function escapeRe (str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findProjectRoot (startDir) {
  let dir = startDir
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'app.config.yaml'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return null
}

function resolveProjectRoot () {
  const initCwd = process.env.INIT_CWD
  if (initCwd) {
    const fromInit = findProjectRoot(initCwd)
    if (fromInit) return fromInit
  }
  return findProjectRoot(process.cwd())
}

function alreadyLinked (content) {
  return content.includes('@adobedjangir/commerce-admin-management/actions/configurations/ext.config.yaml')
}

function hasExtensionPoint (content) {
  return /^[ \t]*commerce\/backend-ui\/1:/m.test(content)
}

function buildExtensionBlock () {
  return [
    MARKER,
    'extensions:',
    `  ${EXTENSION_POINT}:`,
    `    $include: ${INCLUDE_REL}`
  ].join('\n')
}

function updateExistingExtensionBlock (content) {
  const match = content.match(/^([ \t]*)commerce\/backend-ui\/1:/m)
  if (!match) return null

  const indent = match[1]
  const includeIndent = `${indent}  `
  const blockRe = new RegExp(
    `^${escapeRe(indent)}commerce/backend-ui/1:[ \\t]*\\n` +
      `(?:${escapeRe(includeIndent)}\\$include:[^\\n]*\\n)?`,
    'm'
  )
  const replacement =
    `${indent}${EXTENSION_POINT}:\n${includeIndent}$include: ${INCLUDE_REL}\n`
  const next = content.replace(blockRe, replacement)
  return next !== content ? next : null
}

/**
 * Remove the boilerplate `dx/excshell/1` extension block that aio's default
 * `app init` ships with. The host can only run one extension point per
 * project for our purposes, and `commerce/backend-ui/1` is what this
 * package needs — leaving `dx/excshell/1` in place causes aio to try
 * building BOTH, which fails on the excshell side because we don't ship
 * any code for it.
 *
 * Matches a 2-space-indented `dx/excshell/1:` block followed by any
 * deeper-indented nested lines, terminating when we see a non-indented
 * line or a sibling extension. Safe to run repeatedly — no-op if absent.
 */
function stripExcshellBlock (content) {
  const re = /^[ \t]*dx\/excshell\/1:[ \t]*\n(?:[ \t]+[^\n]*\n)*/m
  if (!re.test(content)) return { content, changed: false }
  const next = content.replace(re, '')
  return { content: next, changed: true }
}

function patchAppConfig (content) {
  // First strip the boilerplate dx/excshell/1 block — see stripExcshellBlock.
  const excshell = stripExcshellBlock(content)
  let working = excshell.content

  if (alreadyLinked(working)) {
    return {
      content: working,
      changed: excshell.changed,
      reason: excshell.changed ? 'stripped-excshell' : 'already-linked'
    }
  }

  if (hasExtensionPoint(working)) {
    const updated = updateExistingExtensionBlock(working)
    if (updated) {
      return { content: updated, changed: true, reason: 'updated-existing-extension' }
    }
    return { content: working, changed: excshell.changed, reason: 'extension-exists-unmodified' }
  }

  if (/^extensions:[ \t]*\n/m.test(working)) {
    const injection = `  ${EXTENSION_POINT}:\n    $include: ${INCLUDE_REL}\n`
    const next = working.replace(/^extensions:[ \t]*\n/m, `extensions:\n${injection}`)
    if (next !== working) {
      return { content: next, changed: true, reason: 'added-under-extensions' }
    }
  }

  if (!/^extensions:/m.test(working)) {
    const trimmed = working.replace(/\s+$/, '')
    const separator = trimmed.length > 0 ? '\n\n' : ''
    return {
      content: `${trimmed}${separator}${buildExtensionBlock()}\n`,
      changed: true,
      reason: 'appended'
    }
  }

  return { content: working, changed: excshell.changed, reason: excshell.changed ? 'stripped-excshell' : 'no-change' }
}

// ────────────────────────────────────────────────────────────────────────────
// app.config.yaml: ABDB auto-provisioning default
//
// The package needs App Builder Database to be auto-provisioned on deploy.
// `database` is a top-level key under `application:` in app.config.yaml (it
// cannot live inside ext.config.yaml — Adobe's extension schema rejects it).
// We inject it once on install. Hosts that want to override either edit
// app.config.yaml (set auto-provision: false, change region, etc.) or override
// the region via AIO_DB_REGION in .env — that variable is read at runtime by
// aio-lib-db.init and takes precedence over any defaults.
// ────────────────────────────────────────────────────────────────────────────

const DB_MARKER = '# @adobedjangir/commerce-admin-management (auto-linked on npm install)'

function hasApplicationDatabase (content) {
  // Quick string sniff to avoid re-patching once the block is present.
  return /^application:[ \t]*\n(?:[ \t][^\n]*\n)*[ \t]+database:/m.test(content)
}

function buildDatabaseBlock () {
  return [
    DB_MARKER,
    'application:',
    '  database:',
    '    auto-provision: true',
    '    region: emea'
  ].join('\n')
}

function patchAppConfigDatabase (content) {
  if (hasApplicationDatabase(content)) {
    return { content, changed: false, reason: 'already-present' }
  }

  // Case 1: `application:` exists but has no nested `database:` — inject under it.
  if (/^application:[ \t]*\n/m.test(content)) {
    const next = content.replace(
      /^application:[ \t]*\n/m,
      `application:\n  ${DB_MARKER}\n  database:\n    auto-provision: true\n    region: emea\n`
    )
    if (next !== content) {
      return { content: next, changed: true, reason: 'added-under-application' }
    }
  }

  // Case 2: No `application:` block — append one at the bottom.
  const trimmed = content.replace(/\s+$/, '')
  const separator = trimmed.length > 0 ? '\n\n' : ''
  return {
    content: `${trimmed}${separator}${buildDatabaseBlock()}\n`,
    changed: true,
    reason: 'appended-application-database'
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Host web-src/ scaffolding
//
// Goal: after `npm install @adobedjangir/commerce-admin-management` the host app should pick
// up nav.json + pages/index.js automatically, with no manual edit of the
// bootstrap file required. We:
//   1. (re)write web-src/src/index.js — it carries a marker, so subsequent
//      installs keep it in sync with whatever wiring the package needs.
//   2. create web-src/src/nav.json only if missing (host's data — never
//      overwrite).
//   3. create web-src/src/pages/index.js only if missing (same reason).
// ────────────────────────────────────────────────────────────────────────────

const BOOTSTRAP_MARKER = '// @adobedjangir/commerce-admin-management: auto-generated bootstrap'

function bootstrapContents () {
  return `/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License");
*/
${BOOTSTRAP_MARKER} (updated on npm install)
// Edit nav.json or pages/index.js next to this file to add tabs.
// This file is overwritten on every \`npm install @adobedjangir/commerce-admin-management\`
// — delete the marker line above to opt out of auto-regeneration.

import 'core-js/stable'
import 'regenerator-runtime/runtime'

import React from 'react'
import { createRoot } from 'react-dom/client'

import Runtime, { init } from '@adobe/exc-app'
import { CommerceAdminManagementApp as App, configureWeb } from '@adobedjangir/commerce-admin-management/web'
import actions from './config.json'
import navConfig from './nav.json'
import extraPages from './pages'

configureWeb({
  actionUrls: actions,
  extraNav: Array.isArray(navConfig && navConfig.items) ? navConfig.items : [],
  extraPages
})

window.React = React

try {
  require('./exc-runtime')
  init(bootstrapInExcShell)
} catch (e) {
  console.log('application not running in Adobe Experience Cloud Shell')
  bootstrapRaw()
}

function renderApp (runtime, ims) {
  createRoot(document.getElementById('root')).render(
    React.createElement(App, { runtime, ims })
  )
}

function bootstrapRaw () {
  renderApp({ on: () => {} }, {})
}

function bootstrapInExcShell () {
  const runtime = Runtime()
  runtime.favicon = './favicon.svg'

  runtime.on('ready', ({ imsOrg, imsToken, imsProfile }) => {
    runtime.done()
    renderApp(runtime, {
      profile: imsProfile,
      org: imsOrg,
      token: imsToken
    })
  })

  runtime.solution = {
    icon: 'AdobeExperienceCloud',
    title: 'Commerce Admin Management',
    shortTitle: 'Commerce Admin Management'
  }
  runtime.title = 'Commerce Admin Management'
}
`
}

function navJsonContents () {
  // Ship a working starter entry so fresh installs render a host-side tab
  // immediately. Devs replace/extend by editing this file.
  return JSON.stringify({
    items: [
      {
        id: 'welcome',
        path: '/welcome',
        label: 'Welcome',
        icon: 'Folder'
      }
    ]
  }, null, 2) + '\n'
}

function pagesIndexContents () {
  return `/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Host-app page registry. To add a new tab to the running app:
//   1. Create a file in this folder, e.g. ./MyReports.js, exporting a React
//      component as default. It receives { runtime, ims } as props.
//   2. Import it here and add it to the map below, keyed by a stable id.
//   3. Add a matching entry to ../nav.json:
//        { "id": "my-reports", "path": "/reports", "label": "My Reports",
//          "icon": "Data" }
// On rebuild (or \`aio app run\`) the tab appears next to the package's
// built-in tabs — no other code changes needed.

import Welcome from './Welcome'

const pages = {
  welcome: Welcome
}

export default pages
`
}

function welcomePageContents () {
  return `/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Starter page scaffolded by @adobedjangir/commerce-admin-management's installer.
// Safe to rename, edit, or delete — just remember to update
// ./index.js (page registry) and ../nav.json (tab entry) accordingly.

import React from 'react'
import { View, Heading } from '@adobe/react-spectrum'

export default function Welcome ({ runtime, ims }) {
  return (
    <View padding="size-400">
      <Heading level={2}>Welcome</Heading>
      <p>
        This is a host-defined page registered via
        <code> web-src/src/pages/index.js</code>. Duplicate this file to add
        more tabs.
      </p>
    </View>
  )
}
`
}

function ensureDir (dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeIfMissing (filePath, contents) {
  if (fs.existsSync(filePath)) return { changed: false, reason: 'exists' }
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, contents, 'utf8')
  return { changed: true, reason: 'created' }
}

function writeBootstrap (filePath, contents) {
  ensureDir(path.dirname(filePath))
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8')
    const hasMarker = existing.includes(BOOTSTRAP_MARKER)
    // A bootstrap is considered "host-owned" only when it actively wires up
    // the package (imports from `@adobedjangir/commerce-admin-management/web`). Without
    // either the marker OR a real package import, we assume this is the
    // stock aio template (e.g. just-scaffolded `aio app init`) — safe to
    // overwrite so the install can connect the package's UI shell.
    const wiresPackage = new RegExp("from\\s+['\"]@adobedjangir/commerce-admin-management/web['\"]").test(existing) ||
      new RegExp("require\\(['\"]@adobedjangir/commerce-admin-management/web['\"]\\)").test(existing)
    if (!hasMarker && wiresPackage) {
      return { changed: false, reason: 'host-managed' }
    }
    if (hasMarker && existing === contents) {
      return { changed: false, reason: 'up-to-date' }
    }
  }
  fs.writeFileSync(filePath, contents, 'utf8')
  return { changed: true, reason: 'written' }
}

function indexHtmlContents () {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, shrink-to-fit=no" />
    <meta name="theme-color" content="#1473e6" />
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <link rel="apple-touch-icon" href="./favicon.svg" />
    <title>Commerce Admin Management</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script src="./src/index.js" async type="module"></script>
  </body>
</html>
`
}

function excRuntimeContents () {
  // exc-runtime.js's only job is to side-effect-import the Adobe Experience
  // Cloud Shell runtime so the bootstrap can call init(...) afterwards.
  // The bootstrap wraps `require('./exc-runtime')` in try/catch — if this
  // import fails (e.g. when running outside the shell) bootstrapRaw() takes
  // over. So this file is intentionally minimal.
  return `/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

import '@adobe/exc-app'
`
}

function faviconSvgContents () {
  // Inline SVG gear — small enough to inline, doesn't pull in a binary asset.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1473e6">
  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
</svg>
`
}

function setupWebSrc (projectRoot) {
  const webSrcRoot = path.join(projectRoot, 'web-src')
  const webSrcDir = path.join(webSrcRoot, 'src')
  // No longer bail when the directory is missing — create it. Fresh aio
  // app templates without a backend-ui extension don't ship a web-src/,
  // and our package depends on one.
  ensureDir(webSrcDir)

  const results = {
    html:       writeIfMissing(path.join(webSrcRoot, 'index.html'),        indexHtmlContents()),
    favicon:    writeIfMissing(path.join(webSrcRoot, 'favicon.svg'),       faviconSvgContents()),
    excRuntime: writeIfMissing(path.join(webSrcDir, 'exc-runtime.js'),     excRuntimeContents()),
    bootstrap:  writeBootstrap(path.join(webSrcDir, 'index.js'),           bootstrapContents()),
    nav:        writeIfMissing(path.join(webSrcDir, 'nav.json'),           navJsonContents()),
    pages:      writeIfMissing(path.join(webSrcDir, 'pages', 'index.js'),  pagesIndexContents()),
    // Default starter page — only created on first install, never overwritten,
    // and never auto-removed even if the dev deletes the registry entry.
    welcome:    writeIfMissing(path.join(webSrcDir, 'pages', 'Welcome.js'), welcomePageContents())
  }
  const changed = Object.values(results).some((r) => r.changed)
  return { changed, results }
}

/**
 * Remove the aio `app init` boilerplate source directory for the
 * dx/excshell/1 extension. We stripped its entry from app.config.yaml in
 * patchAppConfig, but the matching scaffolded source tree at
 * `src/dx-excshell-1/` is left behind. Delete it so its stale React-16
 * code (with `react-error-boundary` default-import) doesn't get picked up
 * by `aio app dev` or `npm install` peer-resolution.
 */
function stripExcshellSourceDir (projectRoot) {
  const dir = path.join(projectRoot, 'src', 'dx-excshell-1')
  const parent = path.join(projectRoot, 'src')
  let changed = false

  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      changed = true
    } catch (err) {
      return { changed: false, reason: `rm-failed: ${err.message}` }
    }
  }

  // If src/ is now empty (or was never anything but dx-excshell-1) drop it
  // too — leaving an empty src/ in the project root is just clutter. We
  // never remove it when it still contains other files (the host's own
  // code), so this is safe.
  if (fs.existsSync(parent)) {
    try {
      const remaining = fs.readdirSync(parent).filter((n) => n !== '.DS_Store')
      if (remaining.length === 0) {
        fs.rmSync(parent, { recursive: true, force: true })
        changed = true
      }
    } catch (_) { /* best effort */ }
  }

  return { changed, reason: changed ? 'removed' : 'absent' }
}

function setupAppConfig (projectRoot) {
  const appConfigPath = path.join(projectRoot, 'app.config.yaml')
  if (!fs.existsSync(appConfigPath)) {
    return { changed: false, reason: 'no-app-config' }
  }

  // We only auto-patch the $include line here. ABDB provisioning defaults
  // ship inside the package's ext.config.yaml — host devs override by adding
  // their own `application: database: ...` block to app.config.yaml or by
  // changing AIO_DB_REGION in .env. patchAppConfigDatabase is still exported
  // so callers can opt into materializing the default into app.config.yaml,
  // but it's not run by default to keep the host's app.config.yaml clean.
  const original = fs.readFileSync(appConfigPath, 'utf8')
  const { content, changed, reason } = patchAppConfig(original)
  if (!changed) {
    return { changed: false, reason }
  }

  fs.writeFileSync(appConfigPath, content, 'utf8')
  return { changed: true, reason, detail: INCLUDE_REL }
}

function main () {
  if (process.env.CONFIGURATION_MANAGEMENT_SKIP_SETUP === '1') {
    return
  }

  const projectRoot = resolveProjectRoot()
  if (!projectRoot) {
    console.log(
      '[@adobedjangir/commerce-admin-management] No App Builder project found — skip setup. ' +
        'Run `npx @adobedjangir/commerce-admin-management-setup` from your project root after `aio app init`.'
    )
    return
  }

  // Strip the leftover aio dx/excshell/1 source scaffold before anything
  // else — its stale React-16 code conflicts with our React-18 bundle.
  const excshell = stripExcshellSourceDir(projectRoot)
  if (excshell.changed) {
    console.log('[@adobedjangir/commerce-admin-management] removed src/dx-excshell-1/ (replaced by commerce/backend-ui/1)')
  }

  const app = setupAppConfig(projectRoot)
  if (app.changed) {
    console.log(
      `[@adobedjangir/commerce-admin-management] Updated app.config.yaml (${app.reason}):\n` +
        `  $include: ${app.detail}`
    )
  } else {
    console.log('[@adobedjangir/commerce-admin-management] app.config.yaml already configured.')
  }

  const web = setupWebSrc(projectRoot)
  if (web.reason === 'no-web-src') {
    return
  }
  for (const [name, r] of Object.entries(web.results)) {
    if (r.changed) {
      console.log(`[@adobedjangir/commerce-admin-management] web-src/${name}: ${r.reason}`)
    }
  }
  if (!web.changed) {
    console.log('[@adobedjangir/commerce-admin-management] web-src bootstrap, nav.json, pages/ already in place.')
  }
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error('[@adobedjangir/commerce-admin-management] setup failed:', err.message)
    process.exitCode = 1
  }
}

module.exports = {
  patchAppConfig,
  patchAppConfigDatabase,
  setupAppConfig,
  setupWebSrc,
  INCLUDE_REL,
  EXTENSION_POINT
}
