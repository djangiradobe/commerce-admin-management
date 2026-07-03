/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { getActionUrl } from './settings'

/**
 * Resolve a human-readable identifier for the current user, used as the
 * `actor` field on audit entries. Preference order:
 *   1. profile.email           — most common, readable
 *   2. profile.userId          — Adobe IMS user GUID
 *   3. profile.displayName     — fallback when email is hidden
 *   4. ims.org                 — last resort: per-org, not per-user
 *
 * Returns 'anonymous' when nothing is available (raw localhost dev).
 */
export function resolveActor (ims) {
  if (!ims || typeof ims !== 'object') return 'anonymous'
  const profile = ims.profile || {}
  const candidate =
    profile.email ||
    profile.userId ||
    profile.displayName ||
    profile.first_name ||
    ims.org
  return candidate ? String(candidate) : 'anonymous'
}

export async function callAction (props, action, operation, body = {}) {
  const url = getActionUrl(action)
  if (!url) {
    throw new Error(`Action ${action} is not configured. Call configureWeb({ actionUrls }) with deploy-time URLs.`)
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gw-ims-org-id': (props.ims && props.ims.org) || '',
      authorization: `Bearer ${(props.ims && props.ims.token) || ''}`
    },
    body: JSON.stringify({
      operation,
      ...body
    })
  })

  const text = await res.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(`Invalid response from ${action}: ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const msg =
      parsed?.error ||
      parsed?.body?.error ||
      parsed?.message ||
      `Action ${action} failed with HTTP ${res.status}`
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.status = res.status
    err.response = parsed
    throw err
  }
  return parsed
}

/**
 * GET variant for cacheable, read-only actions. A GET lets the I/O gateway /
 * CDN honor the action's `Cache-Control` header (POST responses aren't cached),
 * so repeat reads of stable data (e.g. the schema) can skip re-invoking the
 * action entirely. Query params are appended to the URL; OpenWhisk merges them
 * into the action's `params`. Use only for idempotent reads.
 */
export async function callActionGet (props, action, query = {}) {
  const base = getActionUrl(action)
  if (!base) {
    throw new Error(`Action ${action} is not configured. Call configureWeb({ actionUrls }) with deploy-time URLs.`)
  }
  const qs = new URLSearchParams(query).toString()
  const url = qs ? `${base}?${qs}` : base
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-gw-ims-org-id': (props.ims && props.ims.org) || '',
      authorization: `Bearer ${(props.ims && props.ims.token) || ''}`
    }
  })
  const text = await res.text()
  let parsed
  try { parsed = JSON.parse(text) } catch (e) {
    throw new Error(`Invalid response from ${action}: ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const msg = parsed?.error || parsed?.body?.error || parsed?.message || `Action ${action} failed with HTTP ${res.status}`
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.status = res.status
    err.response = parsed
    throw err
  }
  return parsed
}
