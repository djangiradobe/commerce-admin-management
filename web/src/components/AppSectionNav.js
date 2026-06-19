/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

import { useLocation, useNavigate } from 'react-router-dom'
import { getNavItems } from '../settings'
import { getNavIcon } from '../nav-icons'

/**
 * Top-level navigation. Driven entirely by nav.json + configureWeb({ extraNav }).
 * To add a tab: register a page in pages/ and add a matching entry to nav.json
 * (or pass it via host configureWeb).
 */
export default function AppSectionNav ({ rightSlot } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const items = getNavItems()
  const activeKey = items.some((it) => it.path === location.pathname)
    ? location.pathname
    : (items[0] && items[0].path) || '/'

  return (
    <div className="sm-tab-bar">
      <div className="sm-tab-bar__track" role="tablist" aria-label="Application sections">
        {items.map(({ id, path, label, icon }) => {
          const Icon = getNavIcon(icon)
          const active = path === activeKey
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`sm-tab${active ? ' is-active' : ''}`}
              onClick={() => { if (!active) navigate(path) }}
            >
              <span className="sm-tab__icon">
                <Icon size="XS" />
              </span>
              {label}
            </button>
          )
        })}
      </div>
      {rightSlot ? <div className="sm-tab-bar__actions">{rightSlot}</div> : null}
    </div>
  )
}
