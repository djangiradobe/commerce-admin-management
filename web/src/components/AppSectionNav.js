/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { useLocation, useNavigate } from 'react-router-dom'
import Settings from '@spectrum-icons/workflow/Settings'

/**
 * Top-level navigation. Add a new sync-entity tab by appending an entry here
 * and adding a matching render branch in MainPage.js. Styling lives in
 * index.css under `.sm-tab*`.
 */
export const NAV_ITEMS = [
  { key: '/',          label: 'System Configurations', Icon: Settings }
]

export default function AppSectionNav () {
  const navigate = useNavigate()
  const location = useLocation()
  const activeKey = NAV_ITEMS.some((it) => it.key === location.pathname) ? location.pathname : '/'

  return (
    <div className="sm-tab-bar">
      <div className="sm-tab-bar__track" role="tablist" aria-label="Application sections">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const active = key === activeKey
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`sm-tab${active ? ' is-active' : ''}`}
              onClick={() => { if (!active) navigate(key) }}
            >
              <span className="sm-tab__icon">
                <Icon size="XS" />
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
