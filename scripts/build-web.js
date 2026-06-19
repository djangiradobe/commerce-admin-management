#!/usr/bin/env node
/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

const fs = require('fs')
const path = require('path')

async function main () {
  let esbuild
  try {
    esbuild = require('esbuild')
  } catch {
    console.error('[@adobedjangir/commerce-admin-management] esbuild is required to build the web UI. Run npm install in the package directory.')
    process.exit(1)
  }

  const pkgRoot = path.join(__dirname, '..')
  const entry = path.join(pkgRoot, 'web/src/index.js')
  const outdir = path.join(pkgRoot, 'web/dist')
  const outfile = path.join(outdir, 'index.js')
  const stylesSrc = path.join(pkgRoot, 'web/src/styles/index.css')
  const stylesFlat = path.join(pkgRoot, 'web/styles.css')

  fs.mkdirSync(outdir, { recursive: true })

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    packages: 'external',
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.css': 'css' },
    target: ['chrome79', 'firefox85', 'safari13'],
    logLevel: 'info'
  })

  // Parcel does not resolve nested @import inside node_modules — ship a flat file.
  fs.copyFileSync(stylesSrc, stylesFlat)

  console.log('[@adobedjangir/commerce-admin-management] built web/dist/index.js')
  if (fs.existsSync(path.join(outdir, 'index.css'))) {
    console.log('[@adobedjangir/commerce-admin-management] built web/dist/index.css')
  }
  console.log('[@adobedjangir/commerce-admin-management] copied web/styles.css')
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[@adobedjangir/commerce-admin-management] build-web failed:', err.message)
    process.exit(1)
  })
}

module.exports = { main }
