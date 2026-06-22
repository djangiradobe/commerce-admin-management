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
    { key: 'SYSTEM_CONFIG_CRYPT_KEY', value: () => require('crypto').randomBytes(32).toString('base64'),
      comment: '# AES-256 master key for at-rest encryption.\n# DO NOT rotate — values already in ABDB become undecryptable if you do.\n# Auto-generated on install; back this up like a database password.' }
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

  // Seed .env with AIO_DB_REGION + SYSTEM_CONFIG_CRYPT_KEY so the consumer
  // doesn't have to. Never overwrites an existing crypt key — see
  // ensureEnvDefaults for why.
  const env = ensureEnvDefaults(projectRoot)
  if (env.changed) {
    for (const s of env.set) {
      console.log(`[@adobedjangir/commerce-admin-management] .env ${s.source}: ${s.key}`)
    }
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
