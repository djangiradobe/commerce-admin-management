#!/usr/bin/env node
/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const fs = require('fs')
const path = require('path')

const EXTENSION_POINT = 'commerce/backend-ui/1'
const INCLUDE_REL = 'node_modules/configuration-management/actions/configurations/ext.config.yaml'
const MARKER = '# configuration-management (auto-linked on npm install)'

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
  return content.includes('configuration-management/actions/configurations/ext.config.yaml')
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

function patchAppConfig (content) {
  if (alreadyLinked(content)) {
    return { content, changed: false, reason: 'already-linked' }
  }

  if (hasExtensionPoint(content)) {
    const updated = updateExistingExtensionBlock(content)
    if (updated) {
      return { content: updated, changed: true, reason: 'updated-existing-extension' }
    }
    return { content, changed: false, reason: 'extension-exists-unmodified' }
  }

  if (/^extensions:[ \t]*\n/m.test(content)) {
    const injection = `  ${EXTENSION_POINT}:\n    $include: ${INCLUDE_REL}\n`
    const next = content.replace(/^extensions:[ \t]*\n/m, `extensions:\n${injection}`)
    if (next !== content) {
      return { content: next, changed: true, reason: 'added-under-extensions' }
    }
  }

  if (!/^extensions:/m.test(content)) {
    const trimmed = content.replace(/\s+$/, '')
    const separator = trimmed.length > 0 ? '\n\n' : ''
    return {
      content: `${trimmed}${separator}${buildExtensionBlock()}\n`,
      changed: true,
      reason: 'appended'
    }
  }

  return { content, changed: false, reason: 'no-change' }
}

function setupAppConfig (projectRoot) {
  const appConfigPath = path.join(projectRoot, 'app.config.yaml')
  if (!fs.existsSync(appConfigPath)) {
    return { changed: false, reason: 'no-app-config' }
  }

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
      '[configuration-management] No App Builder project found — skip setup. ' +
        'Run `npx configuration-management-setup` from your project root after `aio app init`.'
    )
    return
  }

  const app = setupAppConfig(projectRoot)
  if (app.changed) {
    console.log(
      `[configuration-management] Updated app.config.yaml (${app.reason}):\n` +
        `  $include: ${app.detail}`
    )
    return
  }

  console.log('[configuration-management] app.config.yaml already configured.')
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error('[configuration-management] setup failed:', err.message)
    process.exitCode = 1
  }
}

module.exports = {
  patchAppConfig,
  setupAppConfig,
  INCLUDE_REL,
  EXTENSION_POINT
}
