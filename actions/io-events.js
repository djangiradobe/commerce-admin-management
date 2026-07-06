"use strict";
/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/
Object.defineProperty(exports, "__esModule", { value: true });
// Publish a CloudEvent to Adobe I/O Events. No-op when the workspace doesn't
// have the IO_EVENTS_* env vars configured — failing to publish must never
// break the underlying save.
//
// Configure via .env:
//   IO_EVENTS_PROVIDER_ID    GUID of the provider you created in Console
//   IO_EVENTS_EVENT_CODE     event code registered for that provider
//                            (e.g. 'com.example.config.changed')
//   IO_EVENTS_API_KEY        OAuth Client ID from your workspace
//   IO_EVENTS_INGRESS_URL    optional override; defaults to the Adobe ingress
const DEFAULT_INGRESS = 'https://eventsingress.adobe.io';
function isConfigured(params) {
    return !!(params.IO_EVENTS_PROVIDER_ID && params.IO_EVENTS_EVENT_CODE);
}
/**
 * Best-effort publish. Returns `{ ok, skipped?, error? }`. Callers should
 * not throw on failure — log the result and continue.
 */
async function publishConfigEvent(params, payload, logger) {
    const log = logger || { info: () => { }, warn: () => { }, error: () => { } };
    if (!isConfigured(params)) {
        return { ok: true, skipped: true, reason: 'IO_EVENTS_* not configured' };
    }
    const providerId = String(params.IO_EVENTS_PROVIDER_ID);
    const eventCode = String(params.IO_EVENTS_EVENT_CODE);
    const ingress = String(params.IO_EVENTS_INGRESS_URL || DEFAULT_INGRESS);
    const id = `cae-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cloudEvent = {
        specversion: '1.0',
        id,
        source: `urn:uuid:${providerId}`,
        type: eventCode,
        datacontenttype: 'application/json',
        time: new Date().toISOString(),
        data: payload || {}
    };
    try {
        const headers = {
            'Content-Type': 'application/cloudevents+json; charset=UTF-8'
        };
        if (params.IO_EVENTS_API_KEY || params.OAUTH_CLIENT_ID) {
            headers['x-api-key'] = String(params.IO_EVENTS_API_KEY || params.OAUTH_CLIENT_ID);
        }
        if (params.__ow_headers && params.__ow_headers.authorization) {
            headers['Authorization'] = String(params.__ow_headers.authorization);
        }
        const res = await fetch(ingress, {
            method: 'POST',
            headers,
            body: JSON.stringify(cloudEvent)
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            log.warn(`I/O Events publish HTTP ${res.status}: ${text.slice(0, 200)}`);
            return { ok: false, error: `HTTP ${res.status}` };
        }
        return { ok: true, id };
    }
    catch (err) {
        log.warn(`I/O Events publish failed: ${err.message}`);
        return { ok: false, error: err.message };
    }
}
module.exports = { publishConfigEvent, isConfigured };
