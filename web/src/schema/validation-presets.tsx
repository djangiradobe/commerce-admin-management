/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Magento-style validators bundled as reusable presets. Picking one in the
// Schema Editor stamps the underlying rules (pattern / min / max / message /
// preset id) onto `field.validation` so the same rule runs in the browser AND
// in the action (no schema migrations needed when adding a new preset — the
// data layer just consumes `validation.*`).
//
// To add a new preset:
//   1. Append an entry to PRESETS below — id, label, allowed field types,
//      and the validation patch it produces.
//   2. (Optional) If the preset needs a constraint validateFieldValue doesn't
//      know about, extend that function — but try to keep new presets
//      expressible with the existing primitives.
//
// `types` controls which field types show the preset in the Picker.
// `description` shows next to the option as a hint.

export const PRESETS = [
  {
    id: 'free-text',
    label: 'Free text (no validation)',
    description: 'Accepts any value.',
    types: ['text', 'textarea', 'password'],
    apply: () => ({})
  },
  {
    id: 'required',
    label: 'Required (not empty)',
    description: 'Must have a value, no further constraint.',
    types: ['text', 'textarea', 'password', 'number', 'select', 'boolean'],
    apply: () => ({ required: true })
  },
  {
    id: 'email',
    label: 'Email',
    description: 'RFC-5322 lite — same shape as Magento validate-email.',
    types: ['text'],
    apply: () => ({
      pattern: "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$",
      patternMessage: 'Enter a valid email address'
    })
  },
  {
    id: 'url',
    label: 'URL (http or https)',
    description: 'validate-url — must start with http(s)://',
    types: ['text', 'textarea'],
    apply: () => ({
      pattern: '^https?://[^\\s]+$',
      patternMessage: 'Enter a valid URL starting with http:// or https://'
    })
  },
  {
    id: 'secure-url',
    label: 'Secure URL (https only)',
    description: 'validate-secure-url — must start with https://',
    types: ['text', 'textarea'],
    apply: () => ({
      pattern: '^https://[^\\s]+$',
      patternMessage: 'Enter a valid URL starting with https://'
    })
  },
  {
    id: 'integer',
    label: 'Integer',
    description: 'validate-integer — whole number, can be negative.',
    types: ['text', 'number'],
    apply: () => ({
      pattern: '^-?\\d+$',
      patternMessage: 'Enter a whole number'
    })
  },
  {
    id: 'positive-integer',
    label: 'Positive integer (≥ 1)',
    description: 'validate-greater-than-zero.',
    types: ['text', 'number'],
    apply: (field) =>
      field?.type === 'number'
        ? { min: 1, pattern: '^\\d+$', patternMessage: 'Enter a whole number ≥ 1' }
        : { pattern: '^[1-9]\\d*$', patternMessage: 'Enter a whole number ≥ 1' }
  },
  {
    id: 'non-negative-integer',
    label: 'Non-negative integer (≥ 0)',
    description: 'validate-zero-or-greater.',
    types: ['text', 'number'],
    apply: (field) =>
      field?.type === 'number'
        ? { min: 0, pattern: '^\\d+$', patternMessage: 'Enter a whole number ≥ 0' }
        : { pattern: '^\\d+$', patternMessage: 'Enter a whole number ≥ 0' }
  },
  {
    id: 'decimal',
    label: 'Decimal number',
    description: 'validate-number — accepts decimals like 1.23 or -0.5.',
    types: ['text', 'number'],
    apply: () => ({
      pattern: '^-?\\d+(\\.\\d+)?$',
      patternMessage: 'Enter a number'
    })
  },
  {
    id: 'alphanumeric',
    label: 'Alphanumeric',
    description: 'validate-alphanum — letters and digits only.',
    types: ['text'],
    apply: () => ({
      pattern: '^[a-zA-Z0-9]+$',
      patternMessage: 'Letters and digits only'
    })
  },
  {
    id: 'alphanumeric-with-spaces',
    label: 'Alphanumeric + spaces',
    description: 'Letters, digits and spaces.',
    types: ['text'],
    apply: () => ({
      pattern: '^[a-zA-Z0-9 ]+$',
      patternMessage: 'Letters, digits and spaces only'
    })
  },
  {
    id: 'alpha',
    label: 'Letters only',
    description: 'validate-alpha — letters only.',
    types: ['text'],
    apply: () => ({
      pattern: '^[a-zA-Z]+$',
      patternMessage: 'Letters only'
    })
  },
  {
    id: 'slug',
    label: 'Slug / handle',
    description: 'Lower-case letters, digits and hyphens (URL-safe).',
    types: ['text'],
    apply: () => ({
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      patternMessage: 'Lower-case letters, digits and hyphens (no spaces)'
    })
  },
  {
    id: 'phone',
    label: 'Phone number',
    description: 'validate-phoneStrict — digits, spaces, hyphens, parens, leading +',
    types: ['text'],
    apply: () => ({
      pattern: '^\\+?[0-9 ()\\-]{6,20}$',
      patternMessage: 'Enter a valid phone number'
    })
  },
  {
    id: 'hex-color',
    label: 'Hex color',
    description: 'validate-color — e.g. #1473e6 or #fff.',
    types: ['text'],
    apply: () => ({
      pattern: '^#(?:[0-9a-fA-F]{3}){1,2}$',
      patternMessage: 'Enter a valid hex color (e.g. #1473e6)'
    })
  },
  {
    id: 'ipv4',
    label: 'IPv4 address',
    description: 'validate-ip — e.g. 192.168.1.1',
    types: ['text'],
    apply: () => ({
      pattern: '^((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$',
      patternMessage: 'Enter a valid IPv4 address'
    })
  },
  {
    id: 'hostname',
    label: 'Hostname',
    description: 'DNS-style hostname (e.g. shop.example.com).',
    types: ['text'],
    apply: () => ({
      pattern: '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$',
      patternMessage: 'Enter a valid hostname'
    })
  },
  {
    id: 'json',
    label: 'JSON',
    description: 'validate-json — must parse as JSON. Pattern is best-effort; full check runs at save.',
    types: ['textarea', 'text'],
    apply: () => ({
      // Pattern can only guess; the parser does the real check via `format: 'json'`.
      pattern: '^[\\s\\S]*$',
      patternMessage: 'Must be valid JSON',
      format: 'json'
    })
  },
  {
    id: 'date-iso',
    label: 'Date (YYYY-MM-DD)',
    description: 'validate-date — ISO-style calendar date.',
    types: ['text'],
    apply: () => ({
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      patternMessage: 'Enter a date as YYYY-MM-DD'
    })
  },
  {
    id: 'no-html',
    label: 'No HTML tags',
    description: 'validate-no-html-tags — refuses any < or >.',
    types: ['text', 'textarea'],
    apply: () => ({
      pattern: '^[^<>]*$',
      patternMessage: 'HTML tags are not allowed'
    })
  }
]

/** Quick lookup by id. */
export const PRESETS_BY_ID = new Map(PRESETS.map((p) => [p.id, p]))

/** Get presets that apply to a given field type (returns the full list if type unknown). */
export function presetsForType (type) {
  if (!type) return PRESETS
  return PRESETS.filter((p) => !p.types || p.types.includes(type))
}

/**
 * Apply a preset to a field — returns the new `validation` object.
 * Existing custom rules on the field are preserved unless the preset
 * explicitly overrides them.
 */
export function applyPreset (presetId, field) {
  const p = PRESETS_BY_ID.get(presetId)
  if (!p) return field?.validation || {}
  const patch = p.apply(field) || {}
  return { ...(field?.validation || {}), ...patch, preset: presetId }
}
