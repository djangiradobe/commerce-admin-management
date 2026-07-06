/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

/**
 * Schema is no longer defined statically — it is stored in App Builder DB
 * and managed entirely through the Schema Designer UI. This module only
 * exposes helpers for working with whatever schema shape is loaded at runtime.
 *
 * Schema shape (returned from the system-config-schema action):
 * {
 *   sections: [{
 *     id, label,
 *     groups: [{
 *       id, label,
 *       fields: [{
 *         id, label, type, default,
 *         showIn: ['default' | 'websites' | 'stores'],
 *         sensitive?: boolean,
 *         options?: [{ value, label }]   // type === 'select'
 *       }]
 *     }]
 *   }]
 * }
 */

export const FIELD_TYPES = ['text', 'textarea', 'password', 'number', 'select', 'boolean']
export const SCOPES = ['default', 'websites', 'stores']

const SENSITIVE_FIELD_TYPES = new Set(['password'])

export function emptySchema () {
  return { sections: [] }
}

export function getFieldPath (sectionId, groupId, fieldId) {
  return `${sectionId}/${groupId}/${fieldId}`
}

export function isFieldSensitive (field) {
  return !!field?.sensitive || SENSITIVE_FIELD_TYPES.has(field?.type)
}

export function isFieldVisibleAtScope (field, scope) {
  const allowed = field?.showIn || ['default']
  return allowed.includes(scope)
}

/**
 * Stable sort by numeric `sortOrder` (ascending), then by insertion order.
 * Items without `sortOrder` are treated as 0 — i.e. they sort to the top
 * but stay in array order amongst themselves. Used for sections, groups, fields.
 */
export function sortByOrder (items) {
  if (!Array.isArray(items)) return []
  return items
    .map((it, idx) => ({ it, idx, ord: typeof it?.sortOrder === 'number' ? it.sortOrder : 0 }))
    .sort((a, b) => (a.ord - b.ord) || (a.idx - b.idx))
    .map((x) => x.it)
}

/**
 * Next sort-order value for a new sibling — multiples of 10 so users can
 * drop a new entry between two existing ones manually if they prefer.
 */
export function nextSortOrder (items) {
  if (!Array.isArray(items) || items.length === 0) return 10
  const max = items.reduce(
    (m, it) => Math.max(m, typeof it?.sortOrder === 'number' ? it.sortOrder : 0),
    0
  )
  return max + 10
}

/**
 * Renumber an array so `sortOrder` reflects its current position
 * (10, 20, 30, …). Returns a NEW array; does not mutate. Use this after
 * a drag-and-drop reorder so the persisted schema matches what the editor
 * shows.
 */
export function renumberSortOrder (items) {
  if (!Array.isArray(items)) return []
  return items.map((it, i) => ({ ...it, sortOrder: (i + 1) * 10 }))
}

export function flattenFields (schema) {
  const out = []
  if (!schema || !Array.isArray(schema.sections)) return out
  for (const section of sortByOrder(schema.sections)) {
    if (!Array.isArray(section.groups)) continue
    for (const group of sortByOrder(section.groups)) {
      if (!Array.isArray(group.fields)) continue
      for (const field of sortByOrder(group.fields)) {
        out.push({
          section,
          group,
          field,
          path: getFieldPath(section.id, group.id, field.id),
          sensitive: isFieldSensitive(field)
        })
      }
    }
  }
  return out
}

export function coerceDefault (field) {
  switch (field?.type) {
    case 'boolean':
      return !!field.default
    case 'number':
      return typeof field.default === 'number' ? field.default : Number(field.default) || 0
    default:
      return field?.default ?? ''
  }
}

/**
 * Validate a single field value against its declared rules.
 *
 * Schema shape (all rules optional, all live under `field.validation`):
 *   { required, pattern, patternMessage,
 *     min, max,             // for type:'number'
 *     minLength, maxLength, // for string types
 *     enum: ['a','b'] }     // restrict to known values; overrides `select` options if both set
 *
 * Returns `null` when valid, or a string error message when invalid.
 * The same function runs in both the browser (live form) and the action
 * (server-side rejection), so the rule set has to stay JSON-serialisable.
 */
export function validateFieldValue (field, value) {
  if (!field) return null
  const v = field.validation || {}
  const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0)

  if (v.required && isEmpty) {
    return `${field.label || field.id} is required`
  }
  if (isEmpty) return null // nothing else to check on empty optional fields

  if (field.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isNaN(n)) return `${field.label || field.id} must be a number`
    if (v.min != null && n < v.min) return `${field.label || field.id} must be ≥ ${v.min}`
    if (v.max != null && n > v.max) return `${field.label || field.id} must be ≤ ${v.max}`
  } else if (typeof value === 'string') {
    if (v.minLength != null && value.length < v.minLength) {
      return `${field.label || field.id} must be at least ${v.minLength} characters`
    }
    if (v.maxLength != null && value.length > v.maxLength) {
      return `${field.label || field.id} must be at most ${v.maxLength} characters`
    }
    if (v.pattern) {
      try {
        const re = new RegExp(v.pattern)
        if (!re.test(value)) {
          return v.patternMessage || `${field.label || field.id} does not match the required pattern`
        }
      } catch (_) {
        // Malformed pattern in schema — don't block the user, just skip.
      }
    }
  }
  if (Array.isArray(v.enum) && v.enum.length && !v.enum.includes(value)) {
    return `${field.label || field.id} must be one of: ${v.enum.join(', ')}`
  }
  // `format: 'json'` only makes sense for free-text fields; ignore it on
  // structured types so a stale preset (e.g. left over from a type change)
  // doesn't flag obviously-fine select/number/boolean values.
  const acceptsJsonFormat = field.type === 'text' || field.type === 'textarea' || field.type === 'password'
  if (v.format === 'json' && acceptsJsonFormat && typeof value === 'string') {
    try { JSON.parse(value) } catch (_) {
      return `${field.label || field.id} must be valid JSON`
    }
  }
  return null
}

/**
 * Validate every value in a `{ path: value }` map against the schema.
 * Returns `{ path: errorMessage }` for fields that failed (empty object means OK).
 */
export function validateSchema (schema, values) {
  const errors = {}
  if (!schema || !Array.isArray(schema.sections)) return errors
  for (const section of schema.sections) {
    for (const group of (section.groups || [])) {
      for (const field of (group.fields || [])) {
        const path = getFieldPath(section.id, group.id, field.id)
        if (!(path in values)) continue
        const err = validateFieldValue(field, values[path])
        if (err) errors[path] = err
      }
    }
  }
  return errors
}
