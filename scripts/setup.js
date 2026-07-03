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
import registerAddons from './addons'

configureWeb({
  actionUrls: actions,
  extraNav: Array.isArray(navConfig && navConfig.items) ? navConfig.items : [],
  extraPages
})

// Register optional add-on packages (Audit Log, Snapshots, IMS Access…).
// addons.js is host-owned — core creates it once and never overwrites it;
// each add-on's postinstall appends its registration there. This file
// (index.js) is regenerated on every core install, so add-on wiring must
// NOT live here.
registerAddons()

window.React = React

// Mount strategy:
//   - If we're inside the Experience Cloud Shell iframe, init(...) installs a
//     ready-listener that the shell pings within ~100ms. bootstrapInExcShell
//     renders with the IMS context.
//   - If we're on the raw CDN URL (no shell), init(...) still completes but
//     the ready event never arrives. We race a 2-second timer and fall back
//     to bootstrapRaw so React still mounts.
let booted = false
function boot (fn) {
  if (booted) return
  booted = true
  fn()
}

try {
  require('./exc-runtime')
  init(bootstrapInExcShell)
} catch (e) {
  console.log('application not running in Adobe Experience Cloud Shell')
  boot(bootstrapRaw)
}
// Safety net: shell never sent 'ready' → mount raw so the page isn't blank.
setTimeout(() => boot(bootstrapRaw), 2000)

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
    boot(() => renderApp(runtime, {
      profile: imsProfile,
      org: imsOrg,
      token: imsToken
    }))
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

function addonsContents () {
  return `/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Add-on registry — HOST-OWNED, created once by
// @adobedjangir/commerce-admin-management and NEVER overwritten afterward.
//
// Each optional add-on package (audit-log, snapshots, ims-access) appends
// its registration inside the auto-managed block below when you
// \`npm install\` it. The bootstrap (index.js) imports registerAddons and
// calls it after configureWeb — index.js is regenerated on every core
// install, which is exactly why add-on wiring lives HERE instead.
//
// You can hand-edit this file (reorder, remove, add your own register
// calls); the add-on installers only touch the marked region.

// --- COMMERCE-ADMIN ADDON IMPORTS (auto-managed) ---
// --- COMMERCE-ADMIN ADDON IMPORTS END ---

export default function registerAddons () {
  // --- COMMERCE-ADMIN ADDON CALLS (auto-managed) ---
  // --- COMMERCE-ADMIN ADDON CALLS END ---
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
    // addons.js is host-owned (created once, never overwritten) so add-on
    // registrations survive core re-installs that rewrite index.js.
    addons:     writeIfMissing(path.join(webSrcDir, 'addons.js'),          addonsContents()),
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

/**
 * Bump the host's package.json so the React 18 / Spectrum 4 stack we
 * depend on is satisfied without the consumer running a long
 * `npm install --save react@^18 …` chant. We declare these as peers (to
 * avoid shipping duplicate React copies) but a fresh `aio app init` host
 * still pins React 16 — so we patch the host's declared versions here.
 *
 * Strategy:
 *   - Only touch entries that are MISSING or pin a version below our floor.
 *   - Leave entries already satisfying the floor alone (don't downgrade).
 *   - We mutate package.json only; the next `npm install` actually applies
 *     the upgrade. We don't re-shell-out to npm from a postinstall — that
 *     causes recursive installs and is fragile in workspaces / monorepos.
 */
const REQUIRED_HOST_DEPS = {
  // React + DOM — package code uses createRoot/react-dom/client (React 18+).
  'react':                       '^18.3.1',
  'react-dom':                   '^18.3.1',
  // React-error-boundary v4 dropped the default export the older versions
  // shipped; we use named imports so v4 is the floor.
  'react-error-boundary':        '^4.0.0',
  'react-router-dom':            '^6.26.2',
  // Adobe Spectrum trio — must be React-18 compatible.
  '@adobe/react-spectrum':       '^3.47.0',
  '@spectrum-icons/workflow':    '^4.2.4',
  '@spectrum-icons/ui':          '^3.7.1',
  // Adobe app runtime + helpers used by the bootstrap and actions.
  '@adobe/exc-app':              '^1.6.0',
  '@adobe/uix-guest':            '^0.8.3',
  '@adobe/aio-sdk':              '^6.0.0'
}

// Parse a semver-ish version specifier ("^18.3.1", ">=3.0.0", "16.14.0",
// "16.14.0 || >=18") and return the lowest concrete major.minor.patch it
// could resolve to. Returns null for non-numeric specs we can't reason
// about (workspace:*, file:..., git URLs) — those we leave alone.
function lowestVersion (spec) {
  if (!spec || typeof spec !== 'string') return null
  const s = spec.split('||')[0].trim() // take the first range in an OR list
  const m = s.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3] }
}

function compareVersions (a, b) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function satisfiesFloor (currentSpec, floorSpec) {
  const cur = lowestVersion(currentSpec)
  const min = lowestVersion(floorSpec)
  if (!cur || !min) return false
  return compareVersions(cur, min) >= 0
}

/**
 * Re-run `npm install` after bumping host package.json so the upgraded
 * versions actually land in node_modules. Without this, the consumer
 * would have to run `npm install` manually after our postinstall.
 *
 * Recursion is prevented by setting COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP=1
 * in the child npm's env — main() bails immediately when it sees that
 * flag, so the inner install doesn't loop back through this code.
 *
 * Failures here don't throw — we print a fallback hint and let the
 * outer install report success. The consumer can re-run `npm install`
 * manually if our auto-invocation can't reach the network.
 */
function autoRunNpmInstall (projectRoot) {
  const { execSync } = require('child_process')
  console.log('[@adobedjangir/commerce-admin-management] running `npm install` to apply the bumped versions…')
  try {
    execSync('npm install --no-audit --no-fund --silent --legacy-peer-deps', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP: '1' }
    })
    console.log('[@adobedjangir/commerce-admin-management] dependency upgrade complete ✓')
  } catch (e) {
    console.warn('[@adobedjangir/commerce-admin-management] auto-install failed. Run `npm install` manually.')
    console.warn(`  reason: ${e.message}`)
  }
}

function ensureHostDeps (projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return { changed: false, reason: 'no-package-json' }
  }
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch (_) {
    return { changed: false, reason: 'unreadable-package-json' }
  }

  // Decide which deps need bumping by reading the current package.json.
  const bumped = []
  for (const [name, floor] of Object.entries(REQUIRED_HOST_DEPS)) {
    const declared = (pkg.dependencies && pkg.dependencies[name]) ||
                     (pkg.devDependencies && pkg.devDependencies[name])
    if (declared && satisfiesFloor(declared, floor)) continue
    bumped.push({ name, was: declared || '(missing)', now: floor })
  }

  if (bumped.length === 0) return { changed: false, reason: 'already-satisfies' }

  // Persist via `npm pkg set` rather than fs.writeFileSync. The outer
  // `npm install <pkg>` keeps a buffered copy of package.json that it
  // writes at the very end of the install (to add the package itself
  // as a dependency) — that write clobbers anything we'd done via
  // fs.writeFileSync. `npm pkg set` goes through npm's own metadata
  // layer and persists across that final write.
  const { execSync } = require('child_process')
  const args = bumped
    .map((b) => `dependencies.${b.name}=${b.now}`)
    // Some keys contain "@" which `npm pkg set` accepts unquoted; we
    // shell-quote the whole assignment to be safe.
    .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
    .join(' ')
  try {
    execSync(`npm pkg set ${args}`, {
      cwd: projectRoot,
      stdio: 'pipe',
      env: { ...process.env, COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP: '1' }
    })
  } catch (e) {
    return { changed: false, reason: `npm-pkg-set-failed: ${e.message}` }
  }

  // Also remove from devDependencies so the bumped value in dependencies
  // is the only spec npm will see on the next resolution.
  const inDev = bumped.filter((b) => pkg.devDependencies && pkg.devDependencies[b.name])
  if (inDev.length) {
    const delArgs = inDev.map((b) => `'devDependencies.${b.name}'`).join(' ')
    try {
      execSync(`npm pkg delete ${delArgs}`, {
        cwd: projectRoot,
        stdio: 'pipe',
        env: { ...process.env, COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP: '1' }
      })
    } catch (_) { /* non-fatal */ }
  }

  return { changed: true, bumped }
}

/**
 * Seed the host's .env with the two values our actions can't run without:
 *   - AIO_DB_REGION   defaults to "emea" (override after install if needed)
 *   - SYSTEM_CONFIG_CRYPT_KEY   freshly generated AES-256 key, base64-encoded
 *
 * Never overwrites an existing value. The crypt key in particular must
 * remain stable for the life of the workspace — rotating it makes every
 * encrypted value already in ABDB undecryptable. So we only write it
 * when the key is missing or empty.
 *
 * Returns { changed, set: [{key, source}], file }.
 */
/**
 * Mirror IMS_OAUTH_S2S_* → OAUTH_* in the host's .env. Newer Adobe Developer
 * Console templates use the IMS_OAUTH_S2S_ prefix; our actions still read
 * the legacy OAUTH_ names. We append aliases so both work — only when
 * IMS_OAUTH_S2S_* is set and OAUTH_* isn't. Idempotent: re-running won't
 * duplicate the block (we identify our own mirror block by its comment).
 */
function mirrorImsOauthAliases (projectRoot) {
  const envPath = path.join(projectRoot, '.env')
  if (!fs.existsSync(envPath)) return { changed: false, reason: 'no-env' }
  let env = ''
  try { env = fs.readFileSync(envPath, 'utf8') } catch (_) { return { changed: false, reason: 'unreadable' } }

  const grab = (k) => {
    const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
    return m ? m[1] : ''
  }
  const id  = grab('IMS_OAUTH_S2S_CLIENT_ID')
  const sec = grab('IMS_OAUTH_S2S_CLIENT_SECRET')
  const org = grab('IMS_OAUTH_S2S_ORG_ID')
  let scopes = grab('IMS_OAUTH_S2S_SCOPES')

  if (!id || !sec || !org) return { changed: false, reason: 'ims-vars-missing' }

  // SCOPES is often a JSON array; the action expects a comma-separated string.
  if (scopes.trim().startsWith('[')) {
    try { scopes = JSON.parse(scopes).join(', ') } catch (_) { /* leave as-is */ }
  }

  // If OAUTH_* already non-empty, leave the user's values alone.
  const existing = {
    OAUTH_CLIENT_ID:     grab('OAUTH_CLIENT_ID'),
    OAUTH_CLIENT_SECRET: grab('OAUTH_CLIENT_SECRET'),
    OAUTH_ORG_ID:        grab('OAUTH_ORG_ID'),
    OAUTH_SCOPES:        grab('OAUTH_SCOPES')
  }
  const anyMissing = Object.values(existing).some((v) => !v)
  if (!anyMissing) return { changed: false, reason: 'already-aliased' }

  // Strip any previously-mirrored block so re-runs don't accumulate.
  env = env.replace(/\n# Aliases mirrored from IMS_OAUTH_S2S_\*[\s\S]*?(?=\n[A-Z_]+=|\n*$)/g, '')

  const block = [
    '',
    '# Aliases mirrored from IMS_OAUTH_S2S_* — required by the commerce-admin-management actions.',
    `OAUTH_CLIENT_ID=${id}`,
    `OAUTH_CLIENT_SECRET=${sec}`,
    `OAUTH_ORG_ID=${org}`,
    `OAUTH_SCOPES=${scopes}`,
    ''
  ].join('\n')

  fs.writeFileSync(envPath, env + block, 'utf8')
  return { changed: true }
}

function ensureEnvDefaults (projectRoot) {
  const envPath = path.join(projectRoot, '.env')
  let lines = []
  let existed = false
  if (fs.existsSync(envPath)) {
    existed = true
    try {
      lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    } catch (_) {
      return { changed: false, set: [], file: envPath, reason: 'unreadable' }
    }
  }

  // Read current values (ignore comments + blanks). Treat KEY=  (empty)
  // as missing so a half-stubbed .env still gets populated.
  const current = new Map()
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim()
    if (k) current.set(k, v)
  }

  const set = []
  const defaults = [
    { key: 'AIO_DB_REGION',           value: 'emea',
      comment: '# App Builder Database region — one of: amer | emea | apac | aus' },
    // Which Commerce flavor this app targets. PaaS uses the classic
    // "Manual Extensions Selection" registration (default, unchanged). SaaS
    // (ACCS) additionally surfaces the app via Commerce App Management — see
    // the README "SaaS / App Management" section for the one-time init step.
    { key: 'COMMERCE_PLATFORM',       value: 'paas',
      comment: '# Target Commerce platform: paas | saas. saas enables App Management wiring.' },
    { key: 'SYSTEM_CONFIG_CRYPT_KEY', value: () => require('crypto').randomBytes(32).toString('base64'),
      comment: '# AES-256 master key for at-rest encryption.\n# DO NOT rotate — values already in ABDB become undecryptable if you do.\n# Auto-generated on install; back this up like a database password.' },
    // App titles shown in the Commerce admin — change these per project.
    { key: 'APP_TITLE',               value: 'Configuration Management',
      comment: '# Title shown as the Commerce admin menu item (rename per project).' },
    { key: 'APP_SECTION_TITLE',       value: 'Apps',
      comment: '# Parent section label the menu item sits under.' },
    { key: 'APP_PAGE_TITLE',          value: 'Configuration Management - Adobe Commerce → Third-party APIs',
      comment: '# In-app page/tab title (defaults to APP_TITLE if left blank).' }
  ]

  // Build additions for keys that are missing OR empty.
  const additions = []
  for (const def of defaults) {
    const cur = current.get(def.key)
    if (cur && cur !== '' && cur !== '""' && cur !== "''") continue
    const v = typeof def.value === 'function' ? def.value() : def.value
    additions.push({ key: def.key, value: v, comment: def.comment })
    set.push({ key: def.key, source: cur === undefined ? 'added' : 'filled-empty' })
  }

  if (additions.length === 0) return { changed: false, set: [], file: envPath }

  // If the file existed, we either replace empty assignments in place
  // (preserves user comments / ordering) or append at the bottom.
  let next = existed ? lines.slice() : []
  for (const add of additions) {
    const cur = current.get(add.key)
    if (cur === '' || cur === '""' || cur === "''") {
      // Replace the empty line in place.
      for (let i = 0; i < next.length; i++) {
        const trimmed = next[i].trim()
        if (trimmed.startsWith(add.key + '=') || trimmed.startsWith(add.key + ' =')) {
          next[i] = `${add.key}=${add.value}`
          break
        }
      }
    } else {
      // Append.
      if (next.length && next[next.length - 1].trim() !== '') next.push('')
      next.push(add.comment)
      next.push(`${add.key}=${add.value}`)
    }
  }

  fs.writeFileSync(envPath, next.join('\n') + (next[next.length - 1] === '' ? '' : '\n'), 'utf8')
  return { changed: true, set, file: envPath, existed }
}

// The pre-app-build hook that regenerates addons.js from installed add-ons
// on every `aio app build`/`deploy`. This is the RELIABLE trigger — npm
// postinstall doesn't re-run for already-installed versions, but the build
// hook fires every time, so add-on registration is always current.
const BUILD_HOOK_CMD = 'node node_modules/@adobedjangir/commerce-admin-management/scripts/discover.js'

/**
 * Ensure the commerce/backend-ui/1 extension has a `hooks.pre-app-build`
 * that runs discovery. Inserts it as a sibling of the extension's
 * `$include:` line. Idempotent.
 */
function patchBuildHook (content) {
  if (content.includes('scripts/discover.js') && content.includes('pre-app-build')) {
    return { content, changed: false }
  }
  // Find the extension's $include line and match its indentation.
  const m = content.match(/^([ \t]*)\$include:[ \t]*node_modules\/@adobedjangir\/commerce-admin-management\/actions\/configurations\/ext\.config\.yaml[^\n]*\n/m)
  if (!m) return { content, changed: false }
  const indent = m[1]
  const insertion =
    `${indent}hooks:\n` +
    `${indent}  pre-app-build: ${BUILD_HOOK_CMD}\n`
  const next = content.replace(m[0], m[0] + insertion)
  return { content: next, changed: next !== content }
}

function setupAppConfig (projectRoot) {
  const appConfigPath = path.join(projectRoot, 'app.config.yaml')
  if (!fs.existsSync(appConfigPath)) {
    return { changed: false, reason: 'no-app-config' }
  }

  // We auto-patch two things here:
  //   1. the extension $include line (core's actions), and
  //   2. a pre-app-build hook that runs addon discovery on every build.
  // ABDB provisioning defaults ship inside the package's ext.config.yaml.
  const original = fs.readFileSync(appConfigPath, 'utf8')
  const inc = patchAppConfig(original)
  const hook = patchBuildHook(inc.content)
  if (!inc.changed && !hook.changed) {
    return { changed: false, reason: inc.reason }
  }
  fs.writeFileSync(appConfigPath, hook.content, 'utf8')
  const reasons = [inc.changed ? inc.reason : null, hook.changed ? 'build-hook' : null].filter(Boolean)
  return { changed: true, reason: reasons.join('+'), detail: INCLUDE_REL }
}

// Read a single .env value (uncommented) without pulling in dotenv.
function readEnvValue (projectRoot, key) {
  const envPath = path.join(projectRoot, '.env')
  if (!fs.existsSync(envPath)) return process.env[key]
  try {
    for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      if (line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim()
    }
  } catch (_) { /* fall through */ }
  return process.env[key]
}

/**
 * When COMMERCE_PLATFORM=saas, the app should also be discoverable through
 * Commerce App Management (the SaaS replacement for Manual Extensions
 * Selection). App Management scaffolding is owned by Adobe's official
 * generator (`npx @adobe/aio-commerce-lib-app init`), which emits
 * version-correct artifacts we deliberately do NOT hand-replicate. Here we
 * only DETECT whether it's already wired and, if not, print the one-time
 * enablement steps. PaaS (default) is a no-op — nothing changes.
 */
function saasGuidance (projectRoot) {
  const platform = String(readEnvValue(projectRoot, 'COMMERCE_PLATFORM') || 'paas').toLowerCase()
  if (platform !== 'saas') return { platform, wired: null }

  const hasConfig = ['app.commerce.config.ts', 'app.commerce.config.js', 'app.commerce.config.mjs']
    .some((f) => fs.existsSync(path.join(projectRoot, f)))
  let hasExtPoint = false
  const appCfg = path.join(projectRoot, 'app.config.yaml')
  if (fs.existsSync(appCfg)) {
    try { hasExtPoint = /commerce\/extensibility\/1/.test(fs.readFileSync(appCfg, 'utf8')) } catch (_) {}
  }
  const wired = hasConfig && hasExtPoint
  return { platform, wired, hasConfig, hasExtPoint }
}

// Set (or replace) a single KEY=value in .env. Unlike ensureEnvDefaults this
// OVERWRITES an existing value — used when the operator explicitly chooses a
// platform. Appends if absent. Preserves surrounding lines/comments.
function setEnvVar (projectRoot, key, value) {
  const envPath = path.join(projectRoot, '.env')
  let lines = []
  if (fs.existsSync(envPath)) {
    try { lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/) } catch (_) { return false }
  }
  let found = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq !== -1 && t.slice(0, eq).trim() === key) { lines[i] = `${key}=${value}`; found = true; break }
  }
  if (!found) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('')
    lines.push(`${key}=${value}`)
  }
  fs.writeFileSync(envPath, lines.join('\n') + (lines[lines.length - 1] === '' ? '' : '\n'), 'utf8')
  return true
}

// Resolve the target platform, in priority order: CLI flag (--saas/--paas/
// --platform=…) → COMMERCE_PLATFORM env → existing .env value → null (caller
// decides whether to prompt / default).
function resolvePlatformChoice (projectRoot) {
  for (const a of process.argv.slice(2)) {
    const m = /^--platform(?:=(.+))?$/.exec(a)
    if (m && m[1]) return m[1].toLowerCase()
    if (a === '--saas') return 'saas'
    if (a === '--paas') return 'paas'
  }
  if (process.env.COMMERCE_PLATFORM) return String(process.env.COMMERCE_PLATFORM).toLowerCase()
  const fromEnv = readEnvValue(projectRoot, 'COMMERCE_PLATFORM')
  return fromEnv ? String(fromEnv).toLowerCase() : null
}

// Interactive paas/saas prompt (only on a real TTY). Resolves to 'paas'|'saas'.
function promptPlatform () {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve('paas')
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })
    const ask = () => rl.question(
      'Which Adobe Commerce platform is this app for? [paas/saas] (default: paas): ',
      (ans) => {
        const v = String(ans || '').trim().toLowerCase()
        if (v === '' || v === 'paas' || v === 'p') { rl.close(); return resolve('paas') }
        if (v === 'saas' || v === 's') { rl.close(); return resolve('saas') }
        console.log('  Please type "paas" or "saas".')
        ask()
      }
    )
    ask()
  })
}

// The app.commerce.config.ts template. Titles track APP_TITLE / APP_SECTION_TITLE
// so the App Management card and the generated Admin UI SDK menu match the admin
// UI. The seeded .env values are baked as fallbacks AND process.env is honored,
// so re-generating after an env change still picks up the new titles.
// `adminUiSdk.registration` is what makes the lib generate the
// `commerce/backend-ui/1` registration action for SaaS (mirrors our hand-written
// registration action's menuItems 1:1 — same ids, so nothing else changes).
function commerceAppConfigContents (appTitle, sectionTitle) {
  const title = appTitle || 'Configuration Management'
  const section = sectionTitle || 'Apps'
  const id = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'commerce-admin-management'
  const EXT = 'CommerceAdminManagement'
  return 'import { defineConfig } from "@adobe/aio-commerce-lib-app/config";\n\n' +
    '// Titles are configurable per project via .env; baked values are the\n' +
    '// fallback captured at setup time.\n' +
    `const APP_TITLE = process.env.APP_TITLE || ${JSON.stringify(title)};\n` +
    `const APP_SECTION_TITLE = process.env.APP_SECTION_TITLE || ${JSON.stringify(section)};\n\n` +
    'export default defineConfig({\n' +
    '  metadata: {\n' +
    `    id: ${JSON.stringify(id)},\n` +
    '    displayName: APP_TITLE,\n' +
    '    version: "1.0.0",\n' +
    '    description:\n' +
    '      "Manage Adobe Commerce system configuration (view, edit, snapshot, " +\n' +
    '      "audit, and revert) from a single admin app, with role-based access.",\n' +
    '  },\n' +
    '  // Drives the generated commerce/backend-ui/1 registration action (the\n' +
    '  // SaaS/App Management way of registering the admin menu). Mirrors the\n' +
    '  // hand-written registration action used on PaaS.\n' +
    '  adminUiSdk: {\n' +
    '    registration: {\n' +
    '      menuItems: [\n' +
    `        { id: "${EXT}::apps", title: APP_SECTION_TITLE, isSection: true, sortOrder: 1 },\n` +
    `        { id: "${EXT}::configuration_management", title: APP_TITLE, parent: "${EXT}::apps", sortOrder: 10 },\n` +
    '      ],\n' +
    '    },\n' +
    '  },\n' +
    '  // No custom installation steps — a missing `installation` block is a\n' +
    '  // valid no-op for App Management.\n' +
    '});\n'
}

// Seed app.commerce.config.ts (if absent) so `aio-commerce-lib-app init` runs
// fully non-interactively: with a valid config already present it skips the
// feature prompts and just wires deps + ext.config + install.yaml + postinstall.
function writeCommerceAppConfig (projectRoot) {
  const existing = ['app.commerce.config.ts', 'app.commerce.config.js', 'app.commerce.config.mjs', 'app.commerce.config.cjs', 'app.commerce.config.mts', 'app.commerce.config.cts']
    .find((f) => fs.existsSync(path.join(projectRoot, f)))
  if (existing) {
    // Don't overwrite a user-owned config. But a config left over from an
    // OLDER init (metadata only) won't register the admin menu — the lib only
    // generates the registration action when `adminUiSdk.registration` is
    // present. Detect that and flag it (we can't safely rewrite arbitrary TS).
    let hasAdminUiSdk = false
    try { hasAdminUiSdk = /adminUiSdk\s*:/.test(fs.readFileSync(path.join(projectRoot, existing), 'utf8')) } catch (_) {}
    return { changed: false, file: existing, hasAdminUiSdk }
  }
  const file = 'app.commerce.config.ts'
  fs.writeFileSync(
    path.join(projectRoot, file),
    commerceAppConfigContents(readEnvValue(projectRoot, 'APP_TITLE'), readEnvValue(projectRoot, 'APP_SECTION_TITLE')),
    'utf8'
  )
  return { changed: true, file, hasAdminUiSdk: true }
}

// Run Adobe's official scaffolder. Because a valid app.commerce.config.* is
// already in place, this is non-interactive: it installs the App Management
// deps and wires everything. Never hard-fails the setup.
function runCommerceInit (projectRoot) {
  const { execSync } = require('child_process')
  console.log('[@adobedjangir/commerce-admin-management] running `npx @adobe/aio-commerce-lib-app init` (installs App Management deps + wiring)…')
  try {
    execSync('npx --yes @adobe/aio-commerce-lib-app init', {
      cwd: projectRoot,
      stdio: 'inherit',
      // Guard: init runs `npm install`, which retriggers our postinstall —
      // this makes that nested run a no-op instead of recursing.
      env: { ...process.env, COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP: '1' }
    })
    return { ok: true }
  } catch (e) {
    console.warn('[@adobedjangir/commerce-admin-management] init failed — run it manually from the project root:')
    console.warn('  npx @adobe/aio-commerce-lib-app init')
    console.warn(`  reason: ${e.message}`)
    return { ok: false, error: e.message }
  }
}

// Re-wire app.config.yaml for the SaaS/App Management extension model, AFTER
// `init` has generated src/commerce-backend-ui-1/. We use the `yaml` document
// API (present once init installed the lib) for structural edits — far safer
// than regex over the multi-line $include/hooks blocks. Idempotent.
//
// Transforms (PaaS layout → SaaS layout):
//   • commerce/backend-ui/1  $include → our SaaS fragment (backend-ui.saas.yaml):
//     env-driven registration action (registration-saas, with page.title) + web
//   • the addon-discovery pre-app-build hook moves off backend-ui/1 onto
//     application.hooks.pre-app-build
//   • our 11 core actions move under application.runtimeManifest.packages
//     .CommerceAdminManagement via $include of the SAME shared fragment
//   • database provisioning moves under application.runtimeManifest
const CORE_PKG_INCLUDE = 'node_modules/@adobedjangir/commerce-admin-management/actions/configurations/core-package.yaml'
// We serve backend-ui/1 from OUR fragment (env-driven registration action with
// page.title) rather than the lib-generated src/commerce-backend-ui-1/ (which
// bakes static titles and can't carry a page). app.commerce.config still keeps
// adminUiSdk.registration as App Management install metadata.
const SAAS_BACKEND_UI_INCLUDE = 'node_modules/@adobedjangir/commerce-admin-management/actions/configurations/backend-ui.saas.yaml'
const DISCOVER_CMD = 'node node_modules/@adobedjangir/commerce-admin-management/scripts/discover.js'

function wireSaasAppConfig (projectRoot) {
  const p = path.join(projectRoot, 'app.config.yaml')
  if (!fs.existsSync(p)) return { changed: false, reason: 'no-app-config' }

  let YAML
  try { YAML = require(require.resolve('yaml', { paths: [projectRoot] })) } catch (_) {
    return { changed: false, reason: 'yaml-unavailable' }
  }

  const doc = YAML.parseDocument(fs.readFileSync(p, 'utf8'))
  if (doc.errors && doc.errors.length) {
    return { changed: false, reason: 'parse-error', detail: doc.errors[0].message }
  }
  const changes = []
  const BE = ['extensions', 'commerce/backend-ui/1']

  // 1. Point backend-ui/1 at the generated ext.config + drop our hand-written
  //    include and the discover hook that lived under it.
  if (doc.hasIn(BE)) {
    const cur = doc.getIn([...BE, '$include'])
    if (cur !== SAAS_BACKEND_UI_INCLUDE) {
      doc.setIn([...BE, '$include'], SAAS_BACKEND_UI_INCLUDE)
      changes.push('backend-ui→saas-fragment')
    }
    if (doc.hasIn([...BE, 'hooks'])) {
      doc.deleteIn([...BE, 'hooks'])
      changes.push('drop-backend-ui-hook')
    }
  }

  // 2. Addon-discovery hook → application.hooks.pre-app-build.
  if (doc.getIn(['application', 'hooks', 'pre-app-build']) !== DISCOVER_CMD) {
    doc.setIn(['application', 'hooks', 'pre-app-build'], DISCOVER_CMD)
    changes.push('application-discover-hook')
  }

  // 3. Database provisioning under application.runtimeManifest.
  if (!doc.hasIn(['application', 'runtimeManifest', 'database'])) {
    const region = (readEnvValue(projectRoot, 'AIO_DB_REGION') || 'emea').trim() || 'emea'
    doc.setIn(['application', 'runtimeManifest', 'database', 'auto-provision'], true)
    doc.setIn(['application', 'runtimeManifest', 'database', 'region'], region)
    changes.push('application-database')
  }

  // 4. Core actions package under application.runtimeManifest.packages,
  //    $include-ing the SAME shared fragment PaaS uses.
  const CAM = ['application', 'runtimeManifest', 'packages', 'CommerceAdminManagement']
  if (!doc.hasIn(CAM)) {
    doc.setIn([...CAM, '$include'], CORE_PKG_INCLUDE)
    changes.push('application-core-package')
  }

  if (changes.length === 0) return { changed: false, reason: 'already-wired' }
  fs.writeFileSync(p, doc.toString(), 'utf8')
  return { changed: true, changes }
}

// One-shot SaaS enablement: seed config → run init → rewire app.config → done.
function enableSaas (projectRoot) {
  console.log('\n[@adobedjangir/commerce-admin-management] Enabling SaaS / Commerce App Management…')
  const cfg = writeCommerceAppConfig(projectRoot)
  console.log(cfg.changed
    ? `  • created ${cfg.file} (metadata + adminUiSdk.registration from APP_TITLE)`
    : `  • ${cfg.file} already present — leaving it as-is`)
  if (!cfg.changed && !cfg.hasAdminUiSdk) {
    console.warn(`  ⚠ ${cfg.file} has no \`adminUiSdk.registration\` block — the admin menu`)
    console.warn('    will NOT be registered on SaaS. Add it (see README "SaaS / App')
    console.warn('    Management"), or delete the file and re-run to regenerate it.')
  }
  const init = runCommerceInit(projectRoot)
  if (!init.ok) return init

  // init generated src/commerce-backend-ui-1/; now flip app.config.yaml to the
  // SaaS extension model (generated registration owns backend-ui/1; our core
  // actions + db + discovery hook move under `application`).
  const wire = wireSaasAppConfig(projectRoot)
  if (wire.changed) {
    console.log(`  • rewired app.config.yaml for App Management: ${wire.changes.join(', ')}`)
  } else if (wire.reason === 'already-wired') {
    console.log('  • app.config.yaml already in the SaaS extension layout')
  } else if (wire.reason === 'yaml-unavailable' || wire.reason === 'parse-error') {
    console.warn('[@adobedjangir/commerce-admin-management] could not auto-rewire app.config.yaml ' +
      `(${wire.reason}). Apply these manually — see the README "SaaS / App Management" section:`)
    console.warn(`    extensions.commerce/backend-ui/1.$include → ${SAAS_BACKEND_UI_INCLUDE}`)
    console.warn(`    application.hooks.pre-app-build → ${DISCOVER_CMD}`)
    console.warn('    application.runtimeManifest.database.{auto-provision:true,region:<region>}')
    console.warn(`    application.runtimeManifest.packages.CommerceAdminManagement.$include → ${CORE_PKG_INCLUDE}`)
  }

  console.log('[@adobedjangir/commerce-admin-management] SaaS App Management wired ✓')
  console.log('  Final step — deploy:')
  console.log('    aio app build --force-build && aio app deploy --force-deploy --no-build')
  return { ok: true, wire }
}

function main () {
  // Two opt-outs:
  //   - CONFIGURATION_MANAGEMENT_SKIP_SETUP: legacy name kept for compat.
  //   - COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP: set by autoRunNpmInstall to
  //     prevent the recursive postinstall from re-running this code.
  if (process.env.CONFIGURATION_MANAGEMENT_SKIP_SETUP === '1') return
  if (process.env.COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP === '1') return

  const projectRoot = resolveProjectRoot()
  if (!projectRoot) {
    console.log(
      '[@adobedjangir/commerce-admin-management] No App Builder project found — skip setup. ' +
        'Run `npx commerce-admin-management-setup` from your project root after `aio app init`.'
    )
    return
  }

  // Strip the leftover aio dx/excshell/1 source scaffold before anything
  // else — its stale React-16 code conflicts with our React-18 bundle.
  const excshell = stripExcshellSourceDir(projectRoot)
  if (excshell.changed) {
    console.log('[@adobedjangir/commerce-admin-management] removed src/dx-excshell-1/ (replaced by commerce/backend-ui/1)')
  }

  // Seed .env with AIO_DB_REGION + SYSTEM_CONFIG_CRYPT_KEY so the consumer
  // doesn't have to. Never overwrites an existing crypt key — see
  // ensureEnvDefaults for why.
  const env = ensureEnvDefaults(projectRoot)
  if (env.changed) {
    for (const s of env.set) {
      console.log(`[@adobedjangir/commerce-admin-management] .env ${s.source}: ${s.key}`)
    }
  }
  // Newer Adobe Developer Console templates use IMS_OAUTH_S2S_* prefix in
  // .env. Our actions still read OAUTH_*. Mirror automatically so both work.
  const mirror = mirrorImsOauthAliases(projectRoot)
  if (mirror.changed) {
    console.log('[@adobedjangir/commerce-admin-management] .env mirrored IMS_OAUTH_S2S_* → OAUTH_*')
  }

  // Bump host package.json so React-18 + Spectrum-4 peers are satisfied
  // without the consumer running a long `npm install --save react@^18 ...`
  // chant. If anything was bumped, automatically re-run npm install so the
  // new versions actually land in node_modules. A guard env var prevents
  // the recursive postinstall from re-running this step.
  const deps = ensureHostDeps(projectRoot)
  if (deps.changed) {
    console.log('[@adobedjangir/commerce-admin-management] bumped host package.json:')
    for (const b of deps.bumped) {
      console.log(`  • ${b.name}: ${b.was} → ${b.now}`)
    }
    if (process.env.COMMERCE_ADMIN_MANAGEMENT_NO_AUTO_INSTALL === '1') {
      console.log('[@adobedjangir/commerce-admin-management] auto-install disabled; run `npm install` to apply.')
    } else {
      autoRunNpmInstall(projectRoot)
    }
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

  // SaaS (ACCS): remind the consumer to enable App Management if they've
  // opted in via COMMERCE_PLATFORM=saas but haven't run the init tool yet.
  // The classic commerce/backend-ui/1 registration keeps serving the admin
  // UI on both platforms — App Management is additive, so there's nothing to
  // undo for PaaS and no double-registration to guard against.
  const saas = saasGuidance(projectRoot)
  if (saas.platform === 'saas' && saas.wired === false) {
    console.log(
      '\n[@adobedjangir/commerce-admin-management] COMMERCE_PLATFORM=saas but App Management is not wired yet.\n' +
      '  Run the official one-time scaffolder from your project root:\n' +
      '    npx @adobe/aio-commerce-lib-app init   (select "Custom Installation Steps" only)\n' +
      '  Then customize app.commerce.config.* metadata (displayName → your APP_TITLE)\n' +
      '  and deploy with:  aio app build --force-build && aio app deploy --force-deploy --no-build\n' +
      '  PaaS installs can ignore this — leave COMMERCE_PLATFORM=paas.\n'
    )
  } else if (saas.platform === 'saas' && saas.wired === true) {
    console.log('[@adobedjangir/commerce-admin-management] SaaS App Management is wired (commerce/extensibility/1 + app.commerce.config).')
  }
}

// Orchestrator for the entry point. Chooses the platform (flag/env/prompt),
// runs the standard idempotent scaffold, persists COMMERCE_PLATFORM, and — for
// an EXPLICIT CLI run only (never a silent `npm install` postinstall) — fully
// wires SaaS App Management when saas is chosen. End result: the operator runs
// one command, answers paas/saas, and only has `aio app deploy` left to do.
async function runCli () {
  // Mirror main()'s opt-outs here too, so the nested install that init
  // triggers (init → npm install → our postinstall) neither prompts nor
  // recurses into a second enablement pass.
  if (process.env.CONFIGURATION_MANAGEMENT_SKIP_SETUP === '1') return
  if (process.env.COMMERCE_ADMIN_MANAGEMENT_SKIP_SETUP === '1') return

  const isPostinstall = process.env.npm_lifecycle_event === 'postinstall'
  const interactive = !isPostinstall
  const projectRoot = resolveProjectRoot()

  // Platform precedence: CLI flag / env / existing .env → else prompt (CLI) →
  // else 'paas'. Postinstall never prompts.
  let platform = resolvePlatformChoice(projectRoot || process.cwd())
  if (!platform && interactive) platform = await promptPlatform()

  // Standard scaffold (idempotent; seeds .env incl. COMMERCE_PLATFORM=paas).
  main()

  if (!projectRoot) return

  // Persist the operator's explicit choice (overwrites the paas default).
  if (platform) setEnvVar(projectRoot, 'COMMERCE_PLATFORM', platform)

  // One-command SaaS enablement — explicit CLI only.
  if (platform === 'saas' && interactive) enableSaas(projectRoot)
}

if (require.main === module) {
  runCli().catch((err) => {
    // Never fail the npm install on a scaffold problem — the package itself is
    // fine, and the consumer can always re-run
    // `npx commerce-admin-management-setup` later.
    console.error(
      '[@adobedjangir/commerce-admin-management] setup encountered an error ' +
      '(install will continue):', err.message
    )
  })
}

module.exports = {
  patchAppConfig,
  patchAppConfigDatabase,
  setupAppConfig,
  setupWebSrc,
  saasGuidance,
  readEnvValue,
  setEnvVar,
  resolvePlatformChoice,
  writeCommerceAppConfig,
  commerceAppConfigContents,
  wireSaasAppConfig,
  enableSaas,
  INCLUDE_REL,
  EXTENSION_POINT
}
