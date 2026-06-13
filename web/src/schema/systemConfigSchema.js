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

export function flattenFields (schema) {
  const out = []
  if (!schema || !Array.isArray(schema.sections)) return out
  for (const section of schema.sections) {
    if (!Array.isArray(section.groups)) continue
    for (const group of section.groups) {
      if (!Array.isArray(group.fields)) continue
      for (const field of group.fields) {
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
