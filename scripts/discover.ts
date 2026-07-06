#!/usr/bin/env node
/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Discovery-based add-on registration.
//
// Rather than each add-on's postinstall append itself into addons.js (which
// only fires on fresh extraction and is order-sensitive), we DERIVE the
// registrations from what's actually installed: scan the host's declared
// dependencies for packages that carry a `commerceAdmin.register` marker in
// their package.json, then regenerate addons.js's managed regions to exactly
// that set.
//
// Idempotent + order-independent + reinstall-proof: whoever's postinstall
// runs last (core's or any add-on's) produces the correct final file.
// Removing an add-on (npm uninstall) drops it on the next install too.

const fs = require('fs')
const path = require('path')

const IMPORTS_START = '// --- COMMERCE-ADMIN ADDON IMPORTS (auto-managed) ---'
const IMPORTS_END   = '// --- COMMERCE-ADMIN ADDON IMPORTS END ---'
const CALLS_START   = '// --- COMMERCE-ADMIN ADDON CALLS (auto-managed) ---'
const CALLS_END     = '// --- COMMERCE-ADMIN ADDON CALLS END ---'

function findProjectRoot (startDir) {
  let dir = startDir
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'app.config.yaml'))) return dir
    dir = path.dirname(dir)
  }
  return null
}

function readJson (p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return null }
}

/**
 * Scan the host's dependency list for installed packages that declare a
 * `commerceAdmin.register` entry, returning [{ name, register }] sorted by
 * name for stable output.
 */
function discoverAddons (root) {
  const hostPkg = readJson(path.join(root, 'package.json')) || {}
  const deps = { ...(hostPkg.dependencies || {}), ...(hostPkg.devDependencies || {}) }
  const found = []
  for (const name of Object.keys(deps)) {
    const pkg = readJson(path.join(root, 'node_modules', name, 'package.json'))
    const reg = pkg && pkg.commerceAdmin && pkg.commerceAdmin.register
    if (reg && typeof reg === 'string') found.push({ name, register: reg })
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

function replaceRegion (content, startMarker, endMarker, body) {
  const startIdx = content.indexOf(startMarker)
  const endIdx = content.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return content
  const before = content.slice(0, startIdx + startMarker.length)
  const after = content.slice(endIdx)
  return before + '\n' + body + after
}

/**
 * Regenerate addons.js's managed regions from the discovered add-on set.
 * Returns { changed, count }.
 */
function regenerate (root) {
  // Prefer the TypeScript addons file; fall back to the legacy .js for hosts
  // not yet migrated to the TS shell.
  const webSrcDir = path.join(root, 'web-src', 'src')
  const addonsPath = [
    path.join(webSrcDir, 'addons.tsx'),
    path.join(webSrcDir, 'addons.js')
  ].find((p) => fs.existsSync(p))
  if (!addonsPath) return { changed: false, count: 0, reason: 'no-addons-file' }

  const addons = discoverAddons(root)
  const before = fs.readFileSync(addonsPath, 'utf8')

  const importsBody = addons.map((a) => `import ${a.register} from '${a.name}/web'`).join('\n') +
    (addons.length ? '\n' : '')
  const callsBody = addons.map((a) => `  ${a.register}()`).join('\n') +
    (addons.length ? '\n' : '')

  let next = replaceRegion(before, IMPORTS_START, IMPORTS_END, importsBody)
  next = replaceRegion(next, CALLS_START, CALLS_END, callsBody)

  if (next !== before) {
    fs.writeFileSync(addonsPath, next, 'utf8')
    return { changed: true, count: addons.length }
  }
  return { changed: false, count: addons.length }
}

// Read a single uncommented KEY=value from the project .env (no dotenv dep).
function readEnvValue (root, key) {
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return undefined
  try {
    for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim()
    }
  } catch (_) { /* ignore */ }
  return undefined
}

// Keep the generated SaaS Admin UI SDK registration action's menu titles in
// sync with .env on every build. The lib bakes these statically at
// `aio-commerce-lib-app init` time and nothing regenerates them afterward, so
// editing APP_TITLE / APP_SECTION_TITLE in .env otherwise required re-running
// the setup CLI. This runs as a pre-app-build hook. No-op when the generated
// file is absent (PaaS, or a host that overrides backend-ui differently).
function syncGeneratedRegistration (root) {
  const file = path.join(root, 'src', 'commerce-backend-ui-1', '.generated', 'actions', 'registration', 'index.js')
  if (!fs.existsSync(file)) return { changed: false, reason: 'no-generated-registration' }
  const title = readEnvValue(root, 'APP_TITLE')
  const section = readEnvValue(root, 'APP_SECTION_TITLE')
  let src
  try { src = fs.readFileSync(file, 'utf8') } catch (_) { return { changed: false, reason: 'unreadable' } }
  const before = src
  // Replace the `title:` that follows each menu item's id (keys are emitted
  // alphabetically, so title always comes after id within the object).
  const setTitleFor = (idSuffix, value) => {
    if (value == null || value === '') return
    const re = new RegExp('(id:\\s*["\']CommerceAdminManagement::' + idSuffix + '["\'][\\s\\S]*?title:\\s*)"(?:[^"\\\\]|\\\\.)*"')
    src = src.replace(re, (_m, prefix) => prefix + JSON.stringify(value))
  }
  setTitleFor('configuration_management', title)
  setTitleFor('apps', section)
  if (src !== before) { fs.writeFileSync(file, src, 'utf8'); return { changed: true } }
  return { changed: false, reason: 'up-to-date' }
}

function run () {
  const root = (process.env.INIT_CWD && findProjectRoot(process.env.INIT_CWD)) ||
               findProjectRoot(process.cwd())
  if (!root) return { changed: false, count: 0, reason: 'no-project-root', registration: { changed: false } }
  const addons = regenerate(root)
  const registration = syncGeneratedRegistration(root)
  return { ...addons, registration }
}

if (require.main === module) {
  try {
    const r = run()
    if (r.changed) console.log(`[@adobedjangir/commerce-admin-management] addons: registered ${r.count} add-on(s)`)
    if (r.registration && r.registration.changed) console.log('[@adobedjangir/commerce-admin-management] synced SaaS registration titles from .env')
  } catch (err) {
    console.error('[@adobedjangir/commerce-admin-management] discover error (install continues):', err.message)
  }
}

module.exports = { run, discoverAddons, regenerate, syncGeneratedRegistration, readEnvValue }
