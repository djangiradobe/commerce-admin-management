"use strict";
/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/
Object.defineProperty(exports, "__esModule", { value: true });
// Export the entire system_config (schema + values) to a portable JSON
// document. The result includes:
//   - schema  : the document stored under system_config_schema._id = 'v1'
//   - values  : every row in system_config_data, as { scope, scope_id, path, value }
//   - meta    : timestamp + counts so the operator can sanity-check the dump
//
// Sensitive fields are exported as their ENCRYPTED ciphertext so the dump is
// safe to share, but it can only be re-imported into a workspace whose
// SYSTEM_CONFIG_CRYPT_KEY matches the one used when these values were saved.
//
// Trigger from the UI's "Export → JSON" button, or invoke directly:
//   POST .../system-config-export
//   body: {}                         → full dump
//   body: { schemaOnly: true }       → omit values
//   body: { valuesOnly: true }       → omit schema
//   body: { scopes: ['default','websites'] } → filter by scope tuple
//
// Response: { ok, dump }, where `dump` is the JSON the caller saves as a file.
const { Core } = require('@adobe/aio-sdk');
const { errorResponse, requireRole } = require('../../utils');
const { getClient } = require('@adobedjangir/commerce-admin-management/abdb');
const { isEncrypted, decrypt } = require('@adobedjangir/commerce-admin-management/crypto');
const { readCommerceCreds, toClientShape } = require('../../commerce-creds');
const { getCommerceOauthClient } = require('@adobedjangir/commerce-admin-management/oauth1a');
const SCHEMA_COLLECTION = 'system_config_schema';
const SCHEMA_DOC_ID = 'v1';
const DATA_COLLECTION = 'system_config_data';
// Bumped to v2 when we started decrypting sensitive values into plaintext on
// export. Importers ≥ v2 know to re-encrypt with the target env's key.
const EXPORT_VERSION = 2;
/**
 * Walk a schema doc and return the set of "section/group/field" paths whose
 * field is marked `sensitive: true`. Used by both export (decide what to
 * decrypt) and import (decide what to re-encrypt against the target's key).
 */
function deriveLanguageCode(code) {
    const m = String(code || '').toLowerCase().match(/^([a-z]{2})_/);
    return m ? m[1] : 'en';
}
/**
 * Build a Commerce-style store_mappings blob from live REST data:
 *   { storeId: { code, language_code, website_code, website_id } }
 * Returns null if Commerce credentials aren't configured or the call fails.
 * Embedding this in every export lets cross-env imports translate
 * website_id / store_id by matching `website_code` / store `code` against the
 * target env's own Commerce, regardless of whether sync-store-mappings was
 * ever run on the source.
 */
async function fetchSourceStoreMappingsFromCommerce(params, logger) {
    const creds = await readCommerceCreds(params).catch(() => null);
    const shape = toClientShape(creds);
    if (!shape || !shape.url || !shape.consumerKey)
        return null;
    try {
        const oauth = getCommerceOauthClient(shape, logger);
        const [storeViews, websites] = await Promise.all([
            oauth.get('store/storeViews'),
            oauth.get('store/websites')
        ]);
        const websiteById = new Map();
        for (const w of websites || []) {
            if (w && w.id != null)
                websiteById.set(String(w.id), w);
        }
        const mapping = {};
        for (const sv of storeViews || []) {
            if (!sv || sv.id == null)
                continue;
            const storeId = String(sv.id);
            if (storeId === '0' || sv.code === 'admin')
                continue;
            const websiteId = sv.website_id != null ? String(sv.website_id) : '';
            const website = websiteById.get(websiteId);
            mapping[storeId] = {
                code: String(sv.code || ''),
                language_code: deriveLanguageCode(sv.code),
                website_code: website ? String(website.code || '') : '',
                website_id: websiteId
            };
        }
        return Object.keys(mapping).length ? mapping : null;
    }
    catch (err) {
        if (logger)
            logger.warn(`Export: Commerce store_mappings lookup failed: ${err.message}`);
        return null;
    }
}
function collectSensitivePaths(schema) {
    const out = new Set();
    if (!schema || !Array.isArray(schema.sections))
        return out;
    for (const s of schema.sections) {
        if (!s || !Array.isArray(s.groups))
            continue;
        for (const g of s.groups) {
            if (!g || !Array.isArray(g.fields))
                continue;
            for (const f of g.fields) {
                if (f && f.sensitive)
                    out.add(`${s.id}/${g.id}/${f.id}`);
            }
        }
    }
    return out;
}
async function tryFindOne(collection, query) {
    try {
        const arr = await collection.find(query).limit(1).toArray();
        return arr && arr.length ? arr[0] : null;
    }
    catch (err) {
        const msg = err && err.message ? String(err.message) : String(err);
        if (/not found/i.test(msg))
            return null;
        throw err;
    }
}
async function main(params) {
    const logger = Core.Logger('export-config', { level: params.LOG_LEVEL || 'info' });
    // SECURITY: export decrypts and returns plaintext config (incl. secrets).
    // Admin-only, and fail-CLOSED — if we can't verify the role, deny (never
    // hand out credentials on a resolution hiccup).
    const gate = await requireRole(params, 'admin', { failClosed: true });
    if (gate)
        return gate;
    const schemaOnly = params.schemaOnly === true || params.schemaOnly === 'true';
    const valuesOnly = params.valuesOnly === true || params.valuesOnly === 'true';
    const scopeFilter = Array.isArray(params.scopes) && params.scopes.length
        ? new Set(params.scopes.map(String))
        : null;
    let dbHandle;
    try {
        dbHandle = await getClient(params);
    }
    catch (e) {
        logger.error(`ABDB connect failed: ${e.message}`);
        return errorResponse(500, `ABDB connect failed: ${e.message}`, logger);
    }
    const { client, close } = dbHandle;
    try {
        let schema = null;
        if (!valuesOnly) {
            const schemaCol = await client.collection(SCHEMA_COLLECTION);
            const doc = await tryFindOne(schemaCol, { _id: SCHEMA_DOC_ID });
            schema = doc && doc.schema ? doc.schema : { sections: [] };
        }
        // We need the schema to know which paths are sensitive, even when the
        // caller asked for valuesOnly — load it locally without including it in
        // the dump.
        let schemaForFlags = schema;
        if (!schemaForFlags) {
            try {
                const schemaCol = await client.collection(SCHEMA_COLLECTION);
                const doc = await tryFindOne(schemaCol, { _id: SCHEMA_DOC_ID });
                schemaForFlags = doc && doc.schema ? doc.schema : null;
            }
            catch (_) { /* ok if missing */ }
        }
        const sensitivePaths = collectSensitivePaths(schemaForFlags);
        // Always pull the SOURCE env's Commerce mapping so we can stamp every
        // website/store-scoped row with its scope_code (website_code / store
        // view code). The importer then needs only the target's Commerce — no
        // separate storeMappings blob has to be carried between envs.
        const storeMappingsFromCommerce = await fetchSourceStoreMappingsFromCommerce(params, logger);
        // Build quick lookup tables: websiteId → website_code, storeId → store code.
        const websiteCodeById = new Map();
        const storeCodeById = new Map();
        if (storeMappingsFromCommerce) {
            for (const [storeId, m] of Object.entries(storeMappingsFromCommerce)) {
                if (!m)
                    continue;
                if (m.website_id != null && m.website_code) {
                    websiteCodeById.set(String(m.website_id), String(m.website_code));
                }
                if (m.code)
                    storeCodeById.set(String(storeId), String(m.code));
            }
        }
        let values = [];
        let decryptedCount = 0;
        let decryptFailedCount = 0;
        if (!schemaOnly) {
            const dataCol = await client.collection(DATA_COLLECTION);
            const docs = await dataCol.find({}).toArray().catch(() => []);
            for (const d of docs) {
                if (!d || typeof d.path !== 'string')
                    continue;
                if (scopeFilter && !scopeFilter.has(d.scope))
                    continue;
                let value = d.value;
                // Decrypt sensitive ciphertext using THIS env's key so the dump is
                // portable to any other workspace. The recipient will re-encrypt
                // with its own key based on schema.sensitive flags. This means the
                // exported JSON file contains plaintext secrets — treat it as
                // sensitive.
                if (isEncrypted(value)) {
                    try {
                        value = decrypt(value, params);
                        decryptedCount++;
                    }
                    catch (e) {
                        // Couldn't decrypt — keep the ciphertext envelope so a target
                        // workspace with the matching key can still pick it up via the
                        // legacy sourceCryptKey path.
                        decryptFailedCount++;
                        logger.warn(`Export: failed to decrypt ${d.path} @ ${d.scope}:${d.scope_id}: ${e.message}`);
                    }
                }
                // Tag the row with the source env's code (website_code or store
                // view code). At import time the recipient looks up its own Commerce
                // and resolves scope_code → target scope_id directly, with no need
                // to ship a separate storeMappings blob.
                let scopeCode;
                if (d.scope === 'websites')
                    scopeCode = websiteCodeById.get(String(d.scope_id));
                else if (d.scope === 'stores')
                    scopeCode = storeCodeById.get(String(d.scope_id));
                values.push({
                    scope: d.scope,
                    scope_id: d.scope_id,
                    ...(scopeCode ? { scope_code: scopeCode } : {}),
                    path: d.path,
                    value
                });
            }
            // Stable ordering for diffable dumps.
            values.sort((a, b) => {
                if (a.scope !== b.scope)
                    return a.scope.localeCompare(b.scope);
                if (a.scope_id !== b.scope_id)
                    return String(a.scope_id).localeCompare(String(b.scope_id));
                return a.path.localeCompare(b.path);
            });
        }
        const dump = {
            __format: 'adobe-commerce-app-builder/system-config-export',
            __version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            // List of sensitive paths so the importer can re-encrypt them with the
            // target env's key without needing to re-derive from the schema.
            sensitivePaths: Array.from(sensitivePaths),
            sensitiveDecrypted: decryptedCount,
            sensitiveDecryptFailed: decryptFailedCount,
            counts: {
                sections: schema ? (schema.sections || []).length : 0,
                values: values.length,
                scopeCoded: values.filter(v => v.scope_code).length
            },
            ...(valuesOnly ? {} : { schema }),
            ...(schemaOnly ? {} : { values })
        };
        logger.info(`Exported: ${dump.counts.sections} section(s), ${dump.counts.values} value(s)`);
        // App Builder actions can only return a ~1MB response payload. A large
        // config (many scopes/values) can exceed that, so when the serialized dump
        // is big we persist it via the Files SDK and return a short-lived download
        // URL instead of the inline body (per the App Builder optimization guide).
        const serialized = JSON.stringify(dump);
        const MAX_INLINE_BYTES = 900 * 1024; // safety margin under the 1MB limit
        if (Buffer.byteLength(serialized, 'utf8') > MAX_INLINE_BYTES) {
            try {
                const filesLib = require('@adobe/aio-lib-files');
                const files = await filesLib.init();
                const filePath = `exports/system-config-export-${Date.now()}.json`;
                await files.write(filePath, serialized);
                const downloadUrl = await files.generatePresignURL(filePath, { expiryInSeconds: 600, permissions: 'r' });
                logger.info(`Export exceeded inline limit — returning download URL for ${filePath}`);
                return {
                    statusCode: 200,
                    body: { ok: true, tooLarge: true, downloadUrl, counts: dump.counts, bytes: Buffer.byteLength(serialized, 'utf8') }
                };
            }
            catch (e) {
                logger.error(`Files fallback failed: ${e.message}`);
                return errorResponse(500, `Export too large for an inline response and the file fallback failed: ${e.message}`, logger);
            }
        }
        return { statusCode: 200, body: { ok: true, dump } };
    }
    catch (error) {
        logger.error(error);
        return errorResponse(500, error.message || 'Export failed', logger);
    }
    finally {
        try {
            await close();
        }
        catch (_) { }
    }
}
exports.main = main;
