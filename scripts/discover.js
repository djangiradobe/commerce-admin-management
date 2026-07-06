#!/usr/bin/env node
"use strict";
/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/
Object.defineProperty(exports, "__esModule", { value: true });
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
const fs = require('fs');
const path = require('path');
const IMPORTS_START = '// --- COMMERCE-ADMIN ADDON IMPORTS (auto-managed) ---';
const IMPORTS_END = '// --- COMMERCE-ADMIN ADDON IMPORTS END ---';
const CALLS_START = '// --- COMMERCE-ADMIN ADDON CALLS (auto-managed) ---';
const CALLS_END = '// --- COMMERCE-ADMIN ADDON CALLS END ---';
function findProjectRoot(startDir) {
    let dir = startDir;
    while (dir && dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'app.config.yaml')))
            return dir;
        dir = path.dirname(dir);
    }
    return null;
}
function readJson(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch (_) {
        return null;
    }
}
/**
 * Scan the host's dependency list for installed packages that declare a
 * `commerceAdmin.register` entry, returning [{ name, register }] sorted by
 * name for stable output.
 */
function discoverAddons(root) {
    const hostPkg = readJson(path.join(root, 'package.json')) || {};
    const deps = { ...(hostPkg.dependencies || {}), ...(hostPkg.devDependencies || {}) };
    const found = [];
    for (const name of Object.keys(deps)) {
        const pkg = readJson(path.join(root, 'node_modules', name, 'package.json'));
        const reg = pkg && pkg.commerceAdmin && pkg.commerceAdmin.register;
        if (reg && typeof reg === 'string')
            found.push({ name, register: reg });
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
}
function replaceRegion(content, startMarker, endMarker, body) {
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx)
        return content;
    const before = content.slice(0, startIdx + startMarker.length);
    const after = content.slice(endIdx);
    return before + '\n' + body + after;
}
/**
 * Regenerate addons.js's managed regions from the discovered add-on set.
 * Returns { changed, count }.
 */
function regenerate(root) {
    const addonsPath = path.join(root, 'web-src', 'src', 'addons.js');
    if (!fs.existsSync(addonsPath))
        return { changed: false, count: 0, reason: 'no-addons-file' };
    const addons = discoverAddons(root);
    const before = fs.readFileSync(addonsPath, 'utf8');
    const importsBody = addons.map((a) => `import ${a.register} from '${a.name}/web'`).join('\n') +
        (addons.length ? '\n' : '');
    const callsBody = addons.map((a) => `  ${a.register}()`).join('\n') +
        (addons.length ? '\n' : '');
    let next = replaceRegion(before, IMPORTS_START, IMPORTS_END, importsBody);
    next = replaceRegion(next, CALLS_START, CALLS_END, callsBody);
    if (next !== before) {
        fs.writeFileSync(addonsPath, next, 'utf8');
        return { changed: true, count: addons.length };
    }
    return { changed: false, count: addons.length };
}
function run() {
    const root = (process.env.INIT_CWD && findProjectRoot(process.env.INIT_CWD)) ||
        findProjectRoot(process.cwd());
    if (!root)
        return { changed: false, count: 0, reason: 'no-project-root' };
    return regenerate(root);
}
if (require.main === module) {
    try {
        const r = run();
        if (r.changed)
            console.log(`[@adobedjangir/commerce-admin-management] addons.js: registered ${r.count} add-on(s)`);
    }
    catch (err) {
        console.error('[@adobedjangir/commerce-admin-management] discover error (install continues):', err.message);
    }
}
module.exports = { run, discoverAddons, regenerate };
