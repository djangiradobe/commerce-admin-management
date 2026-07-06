/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { PALETTE, RADIUS, SHADOW } from '../theme'

/**
 * Promise-based confirmation dialog rendered as a portal modal. Does NOT
 * depend on Spectrum's DialogContainer / DialogTrigger — those didn't fire
 * reliably from the redesigned shell, so this implementation owns the
 * overlay, focus, ESC handling, and resolve lifecycle directly.
 *
 * Returns:
 *   - confirm(options) → Promise<boolean>
 *   - dialog            — JSX element to render once at the page root
 *
 * Options:
 *   - title          (default: "Are you sure?")
 *   - body           (string | ReactNode)
 *   - confirmLabel   (default: "Confirm")
 *   - cancelLabel    (default: "Cancel")
 *   - variant        ('confirmation' | 'destructive' | 'warning' | 'information')
 *   - choices        (optional) array of { label, value, variant?, description? }
 *                    When provided, the confirm/cancel buttons are replaced by
 *                    this set. Resolves to the chosen `value` (or null when
 *                    cancelled via overlay/Esc).
 */
export function useConfirm () {
  const [state, setState] = useState(null)   // { options } | null
  const resolverRef = useRef(null)

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setState({ options: opts })
    })
  }, [])

  const finish = useCallback((result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setState(null)
    if (resolve) resolve(result)
  }, [])

  // Esc to cancel
  useEffect(() => {
    if (!state) return
    const onKey = (e) => {
      if (e.key === 'Escape') finish(state.options && state.options.choices ? null : false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, finish])

  // Lock body scroll while open
  useEffect(() => {
    if (!state) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [state])

  const dialog = state
    ? ReactDOM.createPortal(
      <ConfirmModal
        options={state.options}
        onConfirm={() => finish(true)}
        onCancel={() => finish(state.options && state.options.choices ? null : false)}
        onChoose={(value) => finish(value)}
      />,
      document.body
    )
    : null

  return { confirm, dialog }
}

const VARIANT_STYLES = {
  destructive:  { color: PALETTE.danger,  primaryBg: PALETTE.danger,  primaryBgHover: PALETTE.dangerHover,  tint: PALETTE.dangerTint,  icon: '⚠' },
  warning:      { color: PALETTE.warning, primaryBg: PALETTE.warning, primaryBgHover: PALETTE.warningHover, tint: PALETTE.warningTint, icon: '!' },
  information:  { color: PALETTE.accent,  primaryBg: PALETTE.accent,  primaryBgHover: PALETTE.accentHover,  tint: PALETTE.accentTint,  icon: 'i' },
  confirmation: { color: PALETTE.accent,  primaryBg: PALETTE.accent,  primaryBgHover: PALETTE.accentHover,  tint: PALETTE.accentTint,  icon: '?' }
}

function ConfirmModal ({ options, onConfirm, onCancel, onChoose }) {
  const variant = options.variant || 'confirmation'
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.confirmation
  const confirmRef = useRef(null)
  const hasChoices = Array.isArray(options.choices) && options.choices.length > 0

  useEffect(() => {
    // Focus the primary action so Enter confirms.
    if (confirmRef.current) confirmRef.current.focus()
  }, [])

  const renderBody = (body) => {
    if (body == null) return null
    if (typeof body !== 'string') return body
    return body.split('\n').map((line, i) => (
      <React.Fragment key={i}>
        {line}
        {i < body.split('\n').length - 1 && <br />}
      </React.Fragment>
    ))
  }

  // Spectrum font stack so the modal blends with the rest of the admin UI
  // instead of falling back to the browser's serif default.
  const SPECTRUM_FONT = "adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, 'Trebuchet MS', 'Lucida Grande', sans-serif"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: PALETTE.overlay,
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: SPECTRUM_FONT,
        animation: 'sm-fade-in 120ms ease-out'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
<div
        style={{
          background: PALETTE.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.modal,
          width: '100%',
          maxWidth: 520,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'sm-pop-in 160ms cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div
          style={{
            padding: '20px 24px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14
          }}
        >
          <div
            aria-hidden="true"
            style={{
              flex: '0 0 auto',
              width: 36,
              height: 36,
              borderRadius: RADIUS.pill,
              background: styles.tint,
              color: styles.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: SPECTRUM_FONT
            }}
          >
            {styles.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="confirm-title"
              style={{
                fontFamily: SPECTRUM_FONT,
                fontSize: 17,
                fontWeight: 700,
                lineHeight: 1.3,
                letterSpacing: '-0.005em',
                color: PALETTE.textStrong
              }}
            >
              {options.title || 'Are you sure?'}
            </div>
            {options.body != null && (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: SPECTRUM_FONT,
                  color: PALETTE.textSoft,
                  fontSize: 13,
                  lineHeight: 1.55,
                  maxHeight: '40vh',
                  overflowY: 'auto'
                }}
              >
                {renderBody(options.body)}
              </div>
            )}
          </div>
        </div>

        {hasChoices
          ? (
            <div
              style={{
                padding: '4px 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              {options.choices.map((c, i) => {
                const cStyles = VARIANT_STYLES[c.variant] || VARIANT_STYLES.confirmation
                const isPrimary = i === 0
                return (
                  <button
                    key={c.value ?? i}
                    type="button"
                    ref={isPrimary ? confirmRef : null}
                    onClick={() => onChoose(c.value)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      borderRadius: RADIUS.lg,
                      border: isPrimary ? `1px solid ${cStyles.primaryBg}` : `1px solid ${PALETTE.borderStrong}`,
                      background: isPrimary ? cStyles.primaryBg : PALETTE.surface,
                      color: isPrimary ? PALETTE.textInverse : PALETTE.textStrong,
                      fontFamily: SPECTRUM_FONT,
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1.35,
                      cursor: 'pointer',
                      transition: 'background 120ms ease, border-color 120ms ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = isPrimary ? cStyles.primaryBgHover : PALETTE.surfaceMuted
                      if (isPrimary) e.currentTarget.style.borderColor = cStyles.primaryBgHover
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = isPrimary ? cStyles.primaryBg : PALETTE.surface
                      if (isPrimary) e.currentTarget.style.borderColor = cStyles.primaryBg
                    }}
                  >
                    <span>{c.label}</span>
                    {c.description && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 400,
                          opacity: isPrimary ? 0.9 : 0.7
                        }}
                      >
                        {c.description}
                      </span>
                    )}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={onCancel}
                style={{
                  marginTop: 4,
                  padding: '8px 14px',
                  borderRadius: RADIUS.lg,
                  border: '1px solid transparent',
                  background: 'transparent',
                  color: PALETTE.textMuted,
                  fontFamily: SPECTRUM_FONT,
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = PALETTE.surfaceMuted }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {options.cancelLabel || 'Cancel'}
              </button>
            </div>
            )
          : (
            <div
              style={{
                padding: '12px 16px',
                background: PALETTE.surfacePanel,
                borderTop: `1px solid ${PALETTE.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10
              }}
            >
              <button
                type="button"
                onClick={onCancel}
                style={{
                  padding: '8px 16px',
                  minHeight: 36,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${PALETTE.borderStrong}`,
                  background: PALETTE.surface,
                  color: PALETTE.textStrong,
                  fontFamily: SPECTRUM_FONT,
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  cursor: 'pointer',
                  transition: 'background 120ms ease'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = PALETTE.surfaceMuted }}
                onMouseOut={(e) => { e.currentTarget.style.background = PALETTE.surface }}
              >
                {options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                ref={confirmRef}
                onClick={onConfirm}
                style={{
                  padding: '8px 16px',
                  minHeight: 36,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${styles.primaryBg}`,
                  background: styles.primaryBg,
                  color: PALETTE.textInverse,
                  fontFamily: SPECTRUM_FONT,
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  cursor: 'pointer',
                  transition: 'background 120ms ease'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = styles.primaryBgHover; e.currentTarget.style.borderColor = styles.primaryBgHover }}
                onMouseOut={(e) => { e.currentTarget.style.background = styles.primaryBg; e.currentTarget.style.borderColor = styles.primaryBg }}
              >
                {options.confirmLabel || 'Confirm'}
              </button>
            </div>
            )}
      </div>
    </div>
  )
}