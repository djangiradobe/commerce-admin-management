/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Provider, lightTheme } from '@adobe/react-spectrum'
import { useLocation, useNavigate } from 'react-router-dom'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import { getNavItems } from '../settings'
import { getNavIcon } from '../nav-icons'

/**
 * Top-level navigation. Driven entirely by nav.json + configureWeb({ extraNav }).
 *
 * Each top-level entry is either:
 *   • a leaf            { id, path, label, icon }
 *   • a parent          { id, label, icon, children: [...] }
 *
 * Parents render as a pill with a chevron; clicking opens a popover of
 * children. The parent pill highlights when any child matches the current
 * route, and the matching child highlights inside the dropdown.
 */
export default function AppSectionNav ({ rightSlot } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const items = getNavItems()

  // Resolve which top-level item should appear active. Leaves match by
  // their own `path`; parents match when any of their children's path matches.
  const activeId = (() => {
    for (const it of items) {
      if (Array.isArray(it.children)) {
        for (const c of it.children) {
          if (c.path === location.pathname) return it.id
        }
      } else if (it.path === location.pathname) {
        return it.id
      }
    }
    return items[0]?.id
  })()

  return (
    <div className="sm-tab-bar">
      <div className="sm-tab-bar__track" role="tablist" aria-label="Application sections">
        {items.map((item) => {
          if (Array.isArray(item.children) && item.children.length) {
            return (
              <ParentTab
                key={item.id}
                item={item}
                isActive={item.id === activeId}
                activePath={location.pathname}
                onSelect={(path) => navigate(path)}
              />
            )
          }
          return (
            <LeafTab
              key={item.id}
              item={item}
              isActive={item.id === activeId}
              onSelect={() => navigate(item.path)}
            />
          )
        })}
      </div>
      {rightSlot ? <div className="sm-tab-bar__actions">{rightSlot}</div> : null}
    </div>
  )
}

function LeafTab ({ item, isActive, onSelect }) {
  const Icon = getNavIcon(item.icon)
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`sm-tab${isActive ? ' is-active' : ''}`}
      onClick={() => { if (!isActive) onSelect() }}
    >
      <span className="sm-tab__icon"><Icon size="XS" /></span>
      {item.label}
    </button>
  )
}

/**
 * Parent pill + dropdown submenu. Toggled by click; closes on outside
 * click or Escape.
 *
 * The menu is rendered through a Portal into <body> so it escapes the
 * scrolling tab-track (`.sm-tab-bar__track` has overflow-x:auto, which
 * would otherwise clip an absolutely-positioned dropdown). Position is
 * computed from the trigger button's getBoundingClientRect on open and
 * tracked on scroll/resize so the menu stays glued to the trigger.
 */
function ParentTab ({ item, isActive, activePath, onSelect }) {
  const Icon = getNavIcon(item.icon)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const recompute = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPosition({ top: r.bottom + 6, left: r.left })
  }

  // Reposition synchronously after open so the first paint is correct.
  useLayoutEffect(() => {
    if (open) recompute()
  }, [open])

  // Close on outside click + Esc + reposition on scroll/resize.
  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      const t = e.target
      if (triggerRef.current && triggerRef.current.contains(t)) return
      if (menuRef.current && menuRef.current.contains(t)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScrollOrResize = () => recompute()
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      role="tab"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-selected={isActive}
      className={`sm-tab sm-tab--parent${isActive ? ' is-active' : ''}${open ? ' is-open' : ''}`}
      onClick={() => setOpen((o) => !o)}
    >
      <span className="sm-tab__icon"><Icon size="XS" /></span>
      {item.label}
      <span className="sm-tab__chevron" aria-hidden="true"><ChevronDown size="XS" /></span>
    </button>
  )

  // Portal lands in <body>, outside the React-Spectrum Provider DOM
  // wrapper. Spectrum icons rely on CSS variables that only exist
  // inside that wrapper, so we re-establish a Provider here for the
  // dropdown — otherwise icons render with zero size / no color.
  const menu = open ? createPortal(
    (
      <Provider theme={lightTheme} colorScheme="light" UNSAFE_className="sm-submenu-portal-host">
        <div
          ref={menuRef}
          className="sm-submenu sm-submenu--portal"
          role="menu"
          aria-label={`${item.label} submenu`}
          style={{ top: position.top, left: position.left }}
        >
          {item.children.map((c) => {
            const ChildIcon = getNavIcon(c.icon)
            const childActive = c.path === activePath
            return (
              <button
                key={c.id}
                type="button"
                role="menuitem"
                className={`sm-submenu__item${childActive ? ' is-active' : ''}`}
                onClick={() => { setOpen(false); onSelect(c.path) }}
              >
                <span className="sm-submenu__icon"><ChildIcon size="XS" /></span>
                <span className="sm-submenu__label">{c.label}</span>
              </button>
            )
          })}
        </div>
      </Provider>
    ),
    document.body
  ) : null

  return (
    <>
      {trigger}
      {menu}
    </>
  )
}
