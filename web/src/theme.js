/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

/**
 * JS facade for the design tokens defined in `index.css`.
 *
 * Every value here is a CSS `var()` reference. Use these in inline styles
 * (`style={{ color: THEME.color.accent }}`) so the rendered value resolves
 * through CSS at runtime — changing the variable in `web/src/styles/index.css` re-skins
 * everything that uses this object without touching any JS.
 *
 * Naming mirrors the CSS variable structure: --sm-color-accent → color.accent.
 */
export const THEME = {
  color: {
    bg:            'var(--sm-color-bg)',
    surface:       'var(--sm-color-surface)',
    surfaceMuted:  'var(--sm-color-surface-muted)',
    surfaceSubtle: 'var(--sm-color-surface-subtle)',
    border:        'var(--sm-color-border)',
    borderStrong:  'var(--sm-color-border-strong)',
    text:          'var(--sm-color-text)',
    textMuted:     'var(--sm-color-text-muted)',
    textStrong:    'var(--sm-color-text-strong)',
    textSoft:      'var(--sm-color-text-soft)',
    textInverse:   'var(--sm-color-text-inverse)',
    surfacePanel:  'var(--sm-color-surface-panel)',
    accent:        'var(--sm-color-accent)',
    accentHover:   'var(--sm-color-accent-hover)',
    accentSoft:    'var(--sm-color-accent-soft)',
    accentTint:    'var(--sm-color-accent-tint)',
    success:       'var(--sm-color-success)',
    successHover:  'var(--sm-color-success-hover)',
    successSoft:   'var(--sm-color-success-soft)',
    warning:       'var(--sm-color-warning)',
    warningHover:  'var(--sm-color-warning-hover)',
    warningSoft:   'var(--sm-color-warning-soft)',
    warningBorder: 'var(--sm-color-warning-border)',
    warningText:   'var(--sm-color-warning-text)',
    warningTint:   'var(--sm-color-warning-tint)',
    danger:        'var(--sm-color-danger)',
    dangerHover:   'var(--sm-color-danger-hover)',
    dangerSoft:    'var(--sm-color-danger-soft)',
    dangerTint:    'var(--sm-color-danger-tint)',
    neutralSoft:   'var(--sm-color-neutral-soft)',
    neutralText:   'var(--sm-color-neutral-text)',
    overlay:       'var(--sm-color-overlay)'
  },
  radius: {
    sm:   'var(--sm-radius-sm)',
    md:   'var(--sm-radius-md)',
    lg:   'var(--sm-radius-lg)',
    xl:   'var(--sm-radius-xl)',
    xxl:  'var(--sm-radius-2xl)',
    pill: 'var(--sm-radius-pill)'
  },
  space: {
    1: 'var(--sm-space-1)',
    2: 'var(--sm-space-2)',
    3: 'var(--sm-space-3)',
    4: 'var(--sm-space-4)',
    5: 'var(--sm-space-5)',
    6: 'var(--sm-space-6)'
  },
  shadow: {
    xs:       'var(--sm-shadow-xs)',
    sm:       'var(--sm-shadow-sm)',
    md:       'var(--sm-shadow-md)',
    pill:     'var(--sm-shadow-pill)',
    floating: 'var(--sm-shadow-floating)',
    dropdown: 'var(--sm-shadow-dropdown)',
    modal:    'var(--sm-shadow-modal)',
    inset:    'var(--sm-shadow-inset)'
  },
  font: {
    family:        'var(--sm-font-family)',
    mono:          'var(--sm-font-mono)',
    sizeXs:        'var(--sm-font-size-xs)',
    sizeSm:        'var(--sm-font-size-sm)',
    sizeMd:        'var(--sm-font-size-md)',
    sizeLg:        'var(--sm-font-size-lg)',
    weightRegular: 'var(--sm-font-weight-regular)',
    weightMedium:  'var(--sm-font-weight-medium)',
    weightSemi:    'var(--sm-font-weight-semibold)',
    weightBold:    'var(--sm-font-weight-bold)'
  }
}

/**
 * Flat alias of `THEME.color` — every colour token reachable as `PALETTE.x`.
 *
 * Components should use this for inline styles so there is exactly one
 * facade for the design system: change a CSS variable in `web/src/styles/index.css` →
 * every reference here resolves to the new value at runtime.
 */
export const PALETTE = { ...THEME.color }
export const RADIUS  = { ...THEME.radius }
export const SHADOW  = { ...THEME.shadow }
export const SPACE   = { ...THEME.space }
export const FONT    = { ...THEME.font }
