/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  View,
  Flex,
  Heading,
  Text,
  Button,
  ButtonGroup,
  ActionButton,
  TooltipTrigger,
  Tooltip,
  TextField,
  TextArea,
  NumberField,
  Switch,
  Checkbox,
  Picker,
  Item,
  Section,
  ProgressCircle,
  ProgressBar,
  Divider,
  Well,
  SearchField,
  DialogTrigger,
  Dialog,
  Header,
  Content,
  StatusLight
} from '@adobe/react-spectrum'
import Settings from '@spectrum-icons/workflow/Settings'
import Globe from '@spectrum-icons/workflow/Globe'
import Refresh from '@spectrum-icons/workflow/Refresh'
import Edit from '@spectrum-icons/workflow/Edit'
import CloudUpload from '@spectrum-icons/workflow/UploadToCloud'
import LockClosed from '@spectrum-icons/workflow/LockClosed'
import Back from '@spectrum-icons/workflow/Back'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import ChevronRight from '@spectrum-icons/workflow/ChevronRight'
import { useSystemConfig } from '../hooks/useSystemConfig'
import { useSystemConfigSchema } from '../hooks/useSystemConfigSchema'
import { useConfirm } from '../hooks/useConfirm'
import { getUserRoleProvider } from '../settings'
// RBAC lives in @adobedjangir/commerce-admin-ims-access (when installed).
// The add-on calls configureWeb({ userRoleProvider }) at registration
// time. We read it via the registry getter — no static import of the
// add-on, no bundler resolution failure when it's absent.
const useUserRole = (props) => getUserRoleProvider()(props)
// hasRole is a tiny pure function — duplicate it locally to avoid pulling
// in the add-on for its sake.
const ROLE_RANK_LOCAL = { viewer: 0, editor: 1, admin: 2 }
const hasRole = (userRole, required) => {
  if (!required) return true
  return (ROLE_RANK_LOCAL[userRole] ?? -1) >= (ROLE_RANK_LOCAL[required] ?? 99)
}
import { isFieldVisibleAtScope, coerceDefault, sortByOrder } from '../schema/systemConfigSchema'
import SystemConfigSchemaEditor from './SystemConfigSchemaEditor'
import { callAction } from '../utils'
import { getActionKey } from '../settings'
import { PALETTE, RADIUS, SHADOW } from '../theme'

// ----------------------------------------------------------------------------
// Design tokens
// ----------------------------------------------------------------------------
// Height (px) reserved by the AppSectionNav strip at the top of every page.
// Sticky elements inside SystemConfig stack vertically below the section nav
// + the hero card. The hero height is measured at runtime (subtitle wrap
// changes its height) and exposed via the `--sc-hero-h` CSS variable so the
// save bar / sidebar always sit flush against the bottom of the hero.
const APP_NAV_OFFSET = 64
const HERO_HEIGHT    = 160   // initial estimate; overridden via CSS var once measured
const SAVE_BAR_HEIGHT = 64   // save bar (action row + padding)
const HERO_VAR        = `var(--sc-hero-h, ${HERO_HEIGHT}px)`


// ----------------------------------------------------------------------------
// Scope tree (Magento-style hierarchical Picker)
// ----------------------------------------------------------------------------
function buildScopeTreeForPicker (scopeTree) {
  const def = { key: 'default::0', label: 'Default Config', scope: 'default', scopeId: '0' }
  const websites = []
  const all = [def]
  const groupsById = new Map((scopeTree.storeGroups || []).map((g) => [String(g.id), g]))

  for (const w of scopeTree.websites) {
    const websiteOption = {
      key: `websites::${w.id}`,
      label: w.name || w.code || `Website ${w.id}`,
      scope: 'websites',
      scopeId: String(w.id)
    }
    all.push(websiteOption)

    const storesForWebsite = (scopeTree.stores || []).filter(
      (s) => String(s.website_id) === String(w.id)
    )
    storesForWebsite.sort((a, b) => {
      const ga = groupsById.get(String(a.store_group_id))?.name || ''
      const gb = groupsById.get(String(b.store_group_id))?.name || ''
      if (ga !== gb) return ga.localeCompare(gb)
      return (a.name || '').localeCompare(b.name || '')
    })

    const items = storesForWebsite.map((s) => {
      const groupName = groupsById.get(String(s.store_group_id))?.name || ''
      const label = groupName ? `${groupName} / ${s.name}` : s.name
      const option = { key: `stores::${s.id}`, label, scope: 'stores', scopeId: String(s.id) }
      all.push(option)
      return option
    })

    websites.push({
      websiteId: String(w.id),
      websiteName: websiteOption.label,
      websiteOption,
      items
    })
  }

  return { all, default: def, websites }
}

// ----------------------------------------------------------------------------
// Small UI atoms
// ----------------------------------------------------------------------------
function Pill ({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: PALETTE.neutralSoft, fg: PALETTE.neutralText },
    accent:  { bg: PALETTE.accentSoft,  fg: PALETTE.accent      },
    warning: { bg: PALETTE.warningSoft, fg: PALETTE.warning     },
    success: { bg: PALETTE.successSoft, fg: PALETTE.success     },
    danger:  { bg: PALETTE.dangerSoft,  fg: PALETTE.danger      }
  }
  const t = tones[tone] || tones.neutral
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: RADIUS.pill,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: '16px',
        letterSpacing: 0.2,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </span>
  )
}

function Card ({ children, padded = true, style = {} }) {
  return (
    <div
      style={{
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.xs,
        ...(padded ? { padding: 20 } : {}),
        ...style
      }}
    >
      {children}
    </div>
  )
}

function SectionDivider ({ label }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: PALETTE.textMuted,
      padding: '14px 12px 6px'
    }}>{label}</div>
  )
}

// ----------------------------------------------------------------------------
// Field renderer
// ----------------------------------------------------------------------------
function FieldControl ({ field, value, disabled, sensitivePlaceholder, onChange }) {
  const isMasked = value === sensitivePlaceholder

  switch (field.type) {
    case 'textarea':
      return (
        <View width="size-4600">
          <TextArea
            aria-label={field.label}
            value={value ?? ''}
            isDisabled={disabled}
            onChange={onChange}
            width="100%"
            UNSAFE_className="sm-textarea"
          />
        </View>
      )
    case 'password':
      return (
        <TextField
          aria-label={field.label}
          type="password"
          value={isMasked ? '' : (value ?? '')}
          isDisabled={disabled}
          onChange={onChange}
          placeholder={isMasked ? '••••• (encrypted, leave blank to keep)' : ''}
          width="size-4600"
        />
      )
    case 'number':
      return (
        <NumberField
          aria-label={field.label}
          value={typeof value === 'number' ? value : Number(value) || 0}
          isDisabled={disabled}
          onChange={onChange}
          width="size-3000"
        />
      )
    case 'boolean':
      return (
        <Switch isSelected={!!value} isDisabled={disabled} onChange={onChange}>
          {value ? 'Yes' : 'No'}
        </Switch>
      )
    case 'select':
      return (
        <Picker
          aria-label={field.label}
          selectedKey={value ?? field.default}
          isDisabled={disabled}
          onSelectionChange={onChange}
          width="size-3600"
        >
          {(field.options || []).map((opt) => (
            <Item key={opt.value}>{opt.label}</Item>
          ))}
        </Picker>
      )
    case 'text':
    default:
      return (
        <TextField
          aria-label={field.label}
          value={value ?? ''}
          isDisabled={disabled}
          onChange={onChange}
          width="size-4600"
        />
      )
  }
}

function FieldRow ({
  field,
  path,
  scope,
  displayValue,
  origin,
  inherited,
  error,
  onFieldChange,
  onUseDefaultChange,
  sensitivePlaceholder,
  onBulkApply,
  userRole
}) {
  const allowed = isFieldVisibleAtScope(field, scope.scope)
  const showUseDefault = scope.scope !== 'default' && allowed
  // RBAC: viewers are read-only (need editor+ to change any value); and the
  // input is also disabled when the caller lacks the field's required role.
  const canWrite = hasRole(userRole || 'admin', 'editor')
  const rbacOk = hasRole(userRole || 'admin', field.requiredRole)
  const editorDisabled = !canWrite || !allowed || (showUseDefault && inherited) || !rbacOk
  const isTextarea = field.type === 'textarea'

  const originLabel = origin
    ? origin.scope === 'default' ? 'inherited from Default Config' : `set at ${origin.scope}:${origin.scopeId}`
    : 'unset'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr auto',
        gap: 16,
        alignItems: isTextarea ? 'start' : 'center',
        padding: '14px 0',
        borderBottom: `1px solid ${PALETTE.border}`,
        background: error ? 'rgba(192,57,43,0.04)' : 'transparent'
      }}
    >
      <div style={{ paddingTop: isTextarea ? 6 : 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: PALETTE.text,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          {field.label}
          {field.sensitive && (
            <TooltipTrigger>
              <span style={{ display: 'inline-flex', color: PALETTE.textMuted }}>
                <LockClosed size="XS" />
              </span>
              <Tooltip>Encrypted at rest</Tooltip>
            </TooltipTrigger>
          )}
        </div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!allowed && <Pill tone="warning">Not configurable here</Pill>}
          {!rbacOk && <Pill tone="warning">Requires {field.requiredRole}</Pill>}
          {allowed && scope.scope !== 'default' && (
            <Pill tone={inherited ? 'neutral' : 'accent'}>
              {inherited ? originLabel : 'overridden'}
            </Pill>
          )}
        </div>
      </div>

      <div>
        <FieldControl
          field={field}
          value={displayValue}
          disabled={editorDisabled}
          sensitivePlaceholder={sensitivePlaceholder}
          onChange={(v) => onFieldChange(path, v)}
        />
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 6,
              fontSize: 12,
              color: PALETTE.danger,
              fontWeight: 600
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        {showUseDefault && (
          <Checkbox
            isSelected={inherited}
            onChange={(checked) => onUseDefaultChange(path, checked)}
          >
            Use Default
          </Checkbox>
        )}
        {onBulkApply && allowed && canWrite && (
          <Button
            variant="secondary"
            isQuiet
            onPress={() => onBulkApply(path, displayValue, field)}
            UNSAFE_style={{ fontSize: 11 }}
          >
            Apply to…
          </Button>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Group card (collapsible)
// ----------------------------------------------------------------------------
function GroupCard ({
  group,
  sectionId,
  scope,
  collapsed,
  onToggle,
  getDisplayValue,
  getOrigin,
  isInheritedAtScope,
  setFieldValue,
  setUseDefault,
  sensitivePlaceholder,
  fieldErrors = {},
  searchFilter = '',
  onTest,
  onBulkApply,
  userRole
}) {
  const lower = searchFilter.trim().toLowerCase()
  const visibleFields = (group.fields || []).filter((field) => {
    if (!lower) return true
    return (
      String(field.label || '').toLowerCase().includes(lower) ||
      String(field.id || '').toLowerCase().includes(lower)
    )
  })
  if (visibleFields.length === 0 && lower) return null

  // A group exposes a Test button when any field declares `testActionKey`
  // (the action key in DEFAULT_ACTION_KEYS to call). The button POSTs the
  // group's current draft values as the action body.
  const testField = (group.fields || []).find((f) => f && f.testActionKey)
  const groupErrorCount = visibleFields.reduce((n, f) => {
    const path = `${sectionId}/${group.id}/${f.id}`
    return fieldErrors[path] ? n + 1 : n
  }, 0)

  return (
    <Card padded={false} style={{ marginBottom: 16, borderColor: groupErrorCount ? PALETTE.danger : undefined }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: collapsed ? 0 : `1px solid ${PALETTE.border}`,
          gap: 12
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: 1,
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            userSelect: 'none',
            font: 'inherit',
            color: 'inherit',
            textAlign: 'left',
            padding: 0
          }}
        >
          <span style={{ color: PALETTE.textMuted, display: 'inline-flex' }}>
            {collapsed ? <ChevronRight size="S" /> : <ChevronDown size="S" />}
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: PALETTE.text }}>{group.label}</span>
          <Pill tone="neutral">{visibleFields.length} field{visibleFields.length === 1 ? '' : 's'}</Pill>
          {groupErrorCount > 0 && (
            <Pill tone="danger">{groupErrorCount} error{groupErrorCount === 1 ? '' : 's'}</Pill>
          )}
        </button>
        {testField && onTest && (
          <Button
            variant="secondary"
            onPress={() => onTest(group, sectionId)}
            isQuiet
          >
            Test {testField.label || 'connection'}
          </Button>
        )}
      </div>
      {!collapsed && (
        <div style={{ padding: '4px 20px 16px' }}>
          {visibleFields.map((field) => {
            const path = `${sectionId}/${group.id}/${field.id}`
            const inherited = isInheritedAtScope(path)
            const displayValue = getDisplayValue(path, coerceDefault(field))
            return (
              <FieldRow
                key={path}
                field={field}
                path={path}
                scope={scope}
                displayValue={displayValue}
                origin={getOrigin(path)}
                inherited={inherited}
                error={fieldErrors[path]}
                onFieldChange={setFieldValue}
                onUseDefaultChange={setUseDefault}
                sensitivePlaceholder={sensitivePlaceholder}
                onBulkApply={onBulkApply}
                userRole={userRole}
              />
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Sidebar (sections)
// ----------------------------------------------------------------------------
function Sidebar ({ sections, activeSectionId, onSelect }) {
  return (
    <aside
      role="tablist"
      aria-label="Sections"
      style={{
        width: 260,
        flexShrink: 0,
        // Pill-track styling that matches the top AppSectionNav: muted grey
        // track with inset shadow, full-rounded radius, holding individual
        // rounded pill buttons.
        background: PALETTE.surfaceMuted,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: RADIUS.xxl,
        boxShadow: SHADOW.inset,
        padding: 6,
        position: 'sticky',
        // Sit below the hero + save bar (which are also sticky) so the
        // sidebar never overlaps either of them. Uses the runtime-measured
        // hero height so the offset stays correct on viewport resize.
        top: `calc(${APP_NAV_OFFSET}px + ${HERO_VAR} + ${SAVE_BAR_HEIGHT + 16}px)`,
        alignSelf: 'flex-start',
        maxHeight: `calc(100vh - ${APP_NAV_OFFSET}px - ${HERO_VAR} - ${SAVE_BAR_HEIGHT + 32}px)`,
        overflowY: 'auto',
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}
    >
      <div style={{
        padding: '6px 14px 4px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: PALETTE.textMuted
      }}>
        Sections
      </div>
      {sections.map((section) => {
        const active = section.id === activeSectionId
        const fieldCount = (section.groups || []).reduce((n, g) => n + (g.fields || []).length, 0)
        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(section.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 14px',
              border: 0,
              borderRadius: RADIUS.pill,
              background: active ? PALETTE.surface : 'transparent',
              cursor: active ? 'default' : 'pointer',
              font: 'inherit',
              color: active ? PALETTE.accent : PALETTE.neutralText,
              fontWeight: active ? 700 : 600,
              fontSize: 13,
              textAlign: 'left',
              boxShadow: active ? SHADOW.pill : 'none',
              transition: 'background 140ms ease, color 140ms ease, box-shadow 140ms ease'
            }}
            onMouseOver={(e) => { if (!active) { e.currentTarget.style.background = PALETTE.surface; e.currentTarget.style.color = PALETTE.text } }}
            onMouseOut={(e)  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = PALETTE.neutralText } }}
          >
            <span style={{ display: 'inline-flex', opacity: active ? 1 : 0.7 }}>
              <Settings size="XS" />
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {section.label}
            </span>
            <Pill tone={active ? 'accent' : 'neutral'}>{fieldCount}</Pill>
          </button>
        )
      })}
    </aside>
  )
}

// ----------------------------------------------------------------------------
// Values view
// ----------------------------------------------------------------------------
function ValuesView ({ schema, onEditSchema, toolsOpen, setToolsOpen, configCtx, callerProps, userRole }) {
  // Viewers are read-only; editors + admins can save config values.
  const canWrite = hasRole(userRole || 'admin', 'editor')
  const {
    scope,
    scopeTree,
    getDisplayValue,
    getOrigin,
    isInheritedAtScope,
    setFieldValue,
    setUseDefault,
    dirtyCount,
    loading,
    saving,
    error,
    savedAt,
    save,
    reset,
    refresh,
    fieldErrors,
    hasErrors,
    computeDiff,
    SENSITIVE_PLACEHOLDER
  } = configCtx

  const [searchFilter, setSearchFilter] = useState('')
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffRows, setDiffRows] = useState([])
  const [testStatus, setTestStatus] = useState({ tone: 'neutral', message: '' })

  // Bulk-apply ("Apply to…") dialog state. `bulk.targets` is a Set of
  // 'scope::scopeId' strings so toggling is O(1).
  const [bulk, setBulk] = useState({ open: false, path: null, value: null, field: null, targets: new Set(), busy: false, result: null })
  const openBulkApply = useCallback((path, value, field) => {
    setBulk({ open: true, path, value, field, targets: new Set(), busy: false, result: null })
  }, [])
  const toggleBulkTarget = (key) => setBulk((prev) => {
    const next = new Set(prev.targets)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return { ...prev, targets: next }
  })
  const closeBulk = () => setBulk((prev) => ({ ...prev, open: false }))

  const openDiffPreview = () => {
    setDiffRows(computeDiff())
    setDiffOpen(true)
  }
  const confirmSave = async () => {
    setDiffOpen(false)
    await save()
  }

  /**
   * Per-group inline Test. Reads the current draft values for the group's
   * fields, posts them to the action key declared on the testField, and
   * surfaces the {ok, message} response in a top-of-form StatusLight.
   */
  const runBulkApply = useCallback(async () => {
    if (!bulk.path || bulk.targets.size === 0 || !callerProps) return
    setBulk((prev) => ({ ...prev, busy: true, result: null }))
    const targets = Array.from(bulk.targets).map((k) => {
      const [s, ...rest] = k.split('::')
      return { scope: s, scopeId: rest.join('::') }
    })
    try {
      const res = await callAction(callerProps, getActionKey('systemConfigBulkSave'), '', {
        values: { [bulk.path]: bulk.value },
        sensitivePaths: bulk.field?.sensitive ? [bulk.path] : [],
        targets,
        actor: 'bulk-apply'
      })
      const body = res?.body || res
      setBulk((prev) => ({ ...prev, busy: false, result: body }))
    } catch (e) {
      setBulk((prev) => ({ ...prev, busy: false, result: { ok: false, error: e.message } }))
    }
  }, [bulk.path, bulk.value, bulk.field, bulk.targets, callerProps])

  const handleTestGroup = useCallback(async (group, sectionId) => {
    const testField = (group.fields || []).find((f) => f && f.testActionKey)
    if (!testField || !callerProps) return
    setTestStatus({ tone: 'notice', message: `Testing ${group.label}…` })
    try {
      const payload = {}
      for (const f of group.fields || []) {
        const path = `${sectionId}/${group.id}/${f.id}`
        payload[f.id] = getDisplayValue(path, coerceDefault(f))
      }
      const res = await callAction(callerProps, getActionKey(testField.testActionKey), '', payload)
      const body = res?.body || res
      if (body && body.ok) {
        setTestStatus({ tone: 'positive', message: body.message || 'Connection OK' })
      } else {
        setTestStatus({ tone: 'negative', message: (body && body.message) || 'Test failed' })
      }
    } catch (e) {
      setTestStatus({ tone: 'negative', message: e.message || 'Test failed' })
    }
  }, [callerProps, getDisplayValue])

  // Sort once for everything below: editor/UI always presents schema in
  // declared sortOrder (rather than raw insertion order).
  const allSections = useMemo(() => sortByOrder(schema?.sections || []), [schema])
  // Filter sections/groups/fields by the search box. A section is shown if
  // any of its fields' labels (or ids) match; same for groups. Empty
  // containers fall away so the operator only sees relevant results.
  const sections = useMemo(() => {
    const q = searchFilter.trim().toLowerCase()
    const withSortedChildren = allSections.map((section) => ({
      ...section,
      groups: sortByOrder(section.groups || []).map((g) => ({
        ...g,
        fields: sortByOrder(g.fields || [])
      }))
    }))
    if (!q) return withSortedChildren
    const match = (s) => String(s || '').toLowerCase().includes(q)
    const out = []
    for (const section of withSortedChildren) {
      const groups = []
      for (const group of (section.groups || [])) {
        const fields = (group.fields || []).filter(
          (f) => match(f.label) || match(f.id)
        )
        if (fields.length || match(group.label) || match(group.id)) {
          groups.push({ ...group, fields: fields.length ? fields : (group.fields || []) })
        }
      }
      if (groups.length || match(section.label) || match(section.id)) {
        out.push({ ...section, groups })
      }
    }
    return out
  }, [allSections, searchFilter])

  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id)
  const activeSection = useMemo(() => {
    if (sections.length === 0) return null
    return sections.find((s) => s.id === activeSectionId) || sections[0]
  }, [sections, activeSectionId])

  const scopeTreeForPicker = useMemo(() => buildScopeTreeForPicker(scopeTree), [scopeTree])
  const scopeKey = `${scope.scope}::${scope.scopeId}`
  const activeScopeLabel = scopeTreeForPicker.all.find((o) => o.key === scopeKey)?.label || 'Default Config'

  const [collapsedGroups, setCollapsedGroups] = useState({})
  useEffect(() => { setCollapsedGroups({}) }, [activeSection?.id])
  const toggleGroup = (gid) => setCollapsedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }))
  const setAllGroups = (collapsed) => {
    const next = {}
    for (const g of activeSection?.groups || []) next[g.id] = collapsed
    setCollapsedGroups(next)
  }

  if (allSections.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{
            display: 'inline-flex',
            padding: 16,
            background: PALETTE.accentSoft,
            borderRadius: '50%',
            marginBottom: 12,
            color: PALETTE.accent
          }}>
            <Settings size="L" />
          </div>
          <Heading level={3} marginTop={0}>No configuration schema yet</Heading>
          <Text UNSAFE_style={{ color: PALETTE.textMuted, maxWidth: 460, display: 'inline-block' }}>
            {userRole === 'admin'
              ? 'Open the Schema Designer to define sections, groups, and fields for your sync integrations.'
              : 'A schema hasn’t been published yet. Ask an admin to set it up — schema editing is restricted to the admin role.'}
          </Text>
          {userRole === 'admin' && (
            <Flex justifyContent="center" gap="size-150" marginTop="size-200">
              <Button variant="cta" onPress={onEditSchema}>Open Schema Designer</Button>
            </Flex>
          )}
        </div>
      </Card>
    )
  }

  return (
    <>
      {error && (
        <Well marginBottom="size-200" UNSAFE_style={{ borderColor: PALETTE.danger }}>
          <Text UNSAFE_style={{ color: PALETTE.danger }}>{error}</Text>
        </Well>
      )}

      {/* Save bar — sticks to the top of the page (just under the hero card)
          so the primary CTA is always in view as the user scrolls long forms. */}
      <div
        style={{
          position: 'sticky',
          // Hero card sticks at APP_NAV_OFFSET; this save bar sits flush
          // against the hero's bottom edge (measured at runtime via
          // --sc-hero-h so the gap is always zero regardless of subtitle
          // wrap).
          top: `calc(${APP_NAV_OFFSET}px + ${HERO_VAR})`,
          marginBottom: 16,
          padding: '12px 20px',
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.floating,
          zIndex: 10
        }}
      >
        <Flex gap="size-150" alignItems="center" justifyContent="space-between">
          <div style={{ fontSize: 12, color: PALETTE.textMuted }}>
            {!canWrite
              ? <span style={{ color: PALETTE.textMuted, fontWeight: 600 }}>Read-only — your role ({userRole || 'viewer'}) can view but not change config. Editor or admin required.</span>
              : dirtyCount > 0
                ? <span style={{ color: PALETTE.warning, fontWeight: 600 }}>{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span>
                : savedAt && !saving
                  ? <span style={{ color: PALETTE.success, fontWeight: 600 }}>✓ Saved {new Date(savedAt).toLocaleTimeString()}</span>
                  : 'All changes saved'}
          </div>
          <Flex gap="size-100" alignItems="center">
            <SearchField
              aria-label="Filter sections, groups, fields"
              placeholder="Search fields…"
              value={searchFilter}
              onChange={setSearchFilter}
              width="size-2400"
            />
            <Button variant="secondary" onPress={refresh} isDisabled={saving || loading}>
              Reload
            </Button>
            <Button variant="secondary" onPress={reset} isDisabled={saving || dirtyCount === 0}>
              Reset
            </Button>
            <Button
              variant="cta"
              onPress={openDiffPreview}
              isDisabled={!canWrite || saving || loading || dirtyCount === 0 || hasErrors}
            >
              {saving ? 'Saving…' : `Review & Save${dirtyCount ? ` (${dirtyCount})` : ''}`}
            </Button>
          </Flex>
        </Flex>
        {testStatus.message && (
          <View marginTop="size-100">
            <StatusLight variant={testStatus.tone}>{testStatus.message}</StatusLight>
          </View>
        )}
      </div>

      {/* Diff preview modal — shown when the user clicks "Review & Save". */}
      <DialogTrigger
        isOpen={diffOpen}
        onOpenChange={(open) => setDiffOpen(open)}
      >
        {/* DialogTrigger requires a trigger child; we hide it because we open
            programmatically. */}
        <div style={{ display: 'none' }} aria-hidden="true">trigger</div>
        <Dialog size="L">
          <Heading>Confirm {diffRows.length} change{diffRows.length === 1 ? '' : 's'}</Heading>
          <Header>
            <Text>scope = {scope.scope}:{scope.scopeId}</Text>
          </Header>
          <Divider />
          <Content>
            {diffRows.length === 0
              ? <Text>Nothing to save.</Text>
              : (
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  {diffRows.map((r) => (
                    <div
                      key={r.path}
                      style={{
                        padding: '10px 0',
                        borderBottom: `1px solid ${PALETTE.border}`,
                        fontSize: 13
                      }}
                    >
                      <div style={{ fontWeight: 600, color: PALETTE.text }}>
                        {r.sectionLabel} › {r.groupLabel} › {r.label}
                        <span style={{
                          marginLeft: 8,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                          color: r.action === 'create' ? PALETTE.success
                            : r.action === 'inherit' ? PALETTE.warning
                              : PALETTE.accent
                        }}>{r.action}</span>
                      </div>
                      <div style={{ color: PALETTE.textMuted, fontSize: 12, marginTop: 2 }}>{r.path}</div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        marginTop: 6,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 12
                      }}>
                        <div>
                          <div style={{ color: PALETTE.textMuted }}>old</div>
                          <div style={{ color: PALETTE.danger, wordBreak: 'break-all' }}>
                            {r.oldValue == null ? '∅' : String(r.oldValue)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: PALETTE.textMuted }}>new</div>
                          <div style={{ color: PALETTE.success, wordBreak: 'break-all' }}>
                            {r.action === 'inherit' ? '(inherit from default)' : (r.newValue == null ? '∅' : String(r.newValue))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </Content>
          <ButtonGroup>
            <Button variant="secondary" onPress={() => setDiffOpen(false)}>Cancel</Button>
            <Button variant="cta" onPress={confirmSave} isDisabled={diffRows.length === 0}>
              Confirm & Save
            </Button>
          </ButtonGroup>
        </Dialog>
      </DialogTrigger>

      {/* Bulk-apply ("Apply to…") dialog — multi-scope fan-out write. */}
      <DialogTrigger isOpen={bulk.open} onOpenChange={(o) => { if (!o) closeBulk() }}>
        <div style={{ display: 'none' }} aria-hidden="true">trigger</div>
        <Dialog size="L">
          <Heading>Apply value to scopes</Heading>
          <Divider />
          <Content>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: PALETTE.textMuted, marginBottom: 6 }}>
                Path
              </div>
              <code style={{
                display: 'block',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                fontWeight: 600,
                color: PALETTE.text,
                background: PALETTE.surfaceMuted || 'rgba(0,0,0,0.05)',
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 6,
                padding: '6px 10px',
                whiteSpace: 'nowrap',
                overflowX: 'auto'
              }}>
                {bulk.path}
              </code>
            </div>
            <div style={{ marginBottom: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
              <div style={{ color: PALETTE.textMuted }}>Will write</div>
              <div style={{ color: PALETTE.success, wordBreak: 'break-all' }}>
                {bulk.field?.sensitive ? '[sensitive — will encrypt]' : String(bulk.value ?? '')}
              </div>
            </div>
            {(() => {
              // Only offer the scopes this field is actually configurable in
              // (its "Visible in" set in the schema). A default-only field
              // should not fan out to websites/stores.
              const allowWebsites = isFieldVisibleAtScope(bulk.field, 'websites')
              const allowStores = isFieldVisibleAtScope(bulk.field, 'stores')
              if (!allowWebsites && !allowStores) {
                return (
                  <Text UNSAFE_style={{ color: PALETTE.textMuted }}>
                    This field is only configurable at the Default scope, so there are no other scopes to apply it to.
                  </Text>
                )
              }
              const cols = [allowWebsites, allowStores].filter(Boolean).length
              return (
                <div style={{ display: 'grid', gridTemplateColumns: cols === 2 ? '1fr 1fr' : '1fr', gap: 16 }}>
                  {allowWebsites && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: PALETTE.textMuted, marginBottom: 6 }}>
                        Websites
                      </div>
                      {(scopeTree.websites || []).length === 0 && (
                        <Text UNSAFE_style={{ color: PALETTE.textMuted }}>None</Text>
                      )}
                      {(scopeTree.websites || []).map((w) => {
                        const key = `websites::${w.id}`
                        return (
                          <div key={key}>
                            <Checkbox isSelected={bulk.targets.has(key)} onChange={() => toggleBulkTarget(key)}>
                              {w.name || w.code} <span style={{ color: PALETTE.textMuted, fontSize: 11 }}>({w.code})</span>
                            </Checkbox>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {allowStores && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: PALETTE.textMuted, marginBottom: 6 }}>
                        Stores
                      </div>
                      {(scopeTree.stores || []).length === 0 && (
                        <Text UNSAFE_style={{ color: PALETTE.textMuted }}>None</Text>
                      )}
                      {(scopeTree.stores || []).map((s) => {
                        const key = `stores::${s.id}`
                        return (
                          <div key={key}>
                            <Checkbox isSelected={bulk.targets.has(key)} onChange={() => toggleBulkTarget(key)}>
                              {s.name || s.code} <span style={{ color: PALETTE.textMuted, fontSize: 11 }}>({s.code})</span>
                            </Checkbox>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
            {bulk.result && (
              <View marginTop="size-200">
                <StatusLight variant={bulk.result.ok ? 'positive' : 'negative'}>
                  {bulk.result.ok
                    ? `Applied to ${bulk.result.succeeded}/${bulk.result.total}`
                    : (bulk.result.error || `${bulk.result.failed} of ${bulk.result.total} failed`)}
                </StatusLight>
              </View>
            )}
          </Content>
          <ButtonGroup>
            <Button variant="secondary" onPress={closeBulk} isDisabled={bulk.busy}>Close</Button>
            <Button
              variant="cta"
              onPress={runBulkApply}
              isDisabled={bulk.busy || bulk.targets.size === 0}
            >
              {bulk.busy ? 'Applying…' : `Apply to ${bulk.targets.size} scope${bulk.targets.size === 1 ? '' : 's'}`}
            </Button>
          </ButtonGroup>
        </Dialog>
      </DialogTrigger>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <Sidebar
          sections={sections}
          activeSectionId={activeSection?.id}
          onSelect={setActiveSectionId}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16
          }}>
            <div>
              <div style={{ fontSize: 12, color: PALETTE.textMuted, fontWeight: 600, marginBottom: 4 }}>
                {activeScopeLabel}
              </div>
              <Heading level={2} marginTop={0} marginBottom={0}>{activeSection?.label}</Heading>
            </div>
            {(activeSection?.groups || []).length > 1 && (
              <Flex gap="size-50">
                <ActionButton onPress={() => setAllGroups(false)} isQuiet>Expand all</ActionButton>
                <ActionButton onPress={() => setAllGroups(true)} isQuiet>Collapse all</ActionButton>
              </Flex>
            )}
          </div>

          {loading
            ? (
              <Card>
                <Flex justifyContent="center" marginY="size-400">
                  <ProgressCircle aria-label="Loading values" isIndeterminate />
                </Flex>
              </Card>
            )
            : (
              (activeSection?.groups || []).map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  sectionId={activeSection.id}
                  scope={scope}
                  collapsed={!!collapsedGroups[group.id]}
                  onToggle={() => toggleGroup(group.id)}
                  getDisplayValue={getDisplayValue}
                  getOrigin={getOrigin}
                  isInheritedAtScope={isInheritedAtScope}
                  setFieldValue={setFieldValue}
                  setUseDefault={setUseDefault}
                  sensitivePlaceholder={SENSITIVE_PLACEHOLDER}
                  fieldErrors={fieldErrors}
                  searchFilter={searchFilter}
                  onTest={handleTestGroup}
                  onBulkApply={openBulkApply}
                  userRole={userRole}
                />
              ))
            )}

          <div style={{ height: 80 }} />
        </div>
      </div>
    </>
  )
}

// ----------------------------------------------------------------------------
// Custom scope picker — replaces Spectrum's Picker so we can render a clean
// hierarchical menu without the duplicate website-name section header that
// the Spectrum Section title forced.
// ----------------------------------------------------------------------------
function ScopePicker ({ scopeTreeForPicker, selectedKey, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = scopeTreeForPicker.all.find((o) => o.key === selectedKey)
  const selectedLabel = selected?.label || 'Default Config'

  const select = (key) => { onChange(key); setOpen(false) }

  const renderItem = ({ key, label, indent = 0, isWebsite = false }) => {
    const active = key === selectedKey
    return (
      <button
        key={key}
        type="button"
        onClick={() => select(key)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: `8px 12px 8px ${12 + indent * 18}px`,
          background: active ? PALETTE.accentSoft : 'transparent',
          color: active ? PALETTE.accent : PALETTE.text,
          fontSize: 13,
          fontWeight: active ? 700 : (isWebsite ? 600 : 500),
          border: 0,
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit'
        }}
        onMouseOver={(e) => { if (!active) e.currentTarget.style.background = PALETTE.surfaceMuted }}
        onMouseOut={(e)  => { if (!active) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          {indent > 0 && <span style={{ color: PALETTE.textMuted }}>↳</span>}
          <span>{label}</span>
        </span>
        {active && <span style={{ color: PALETTE.accent, fontSize: 14 }}>✓</span>}
      </button>
    )
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: RADIUS.md,
          padding: '6px 10px',
          minWidth: 220,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          color: PALETTE.text,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1
        }}
      >
        <Globe size="XS" />
        <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedLabel}
        </span>
        <span style={{ color: PALETTE.textMuted, fontSize: 11 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            minWidth: 280,
            maxHeight: 420,
            overflowY: 'auto',
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: RADIUS.lg,
            boxShadow: SHADOW.dropdown,
            zIndex: 100,
            padding: 4
          }}
        >
          {renderItem({ key: scopeTreeForPicker.default.key, label: scopeTreeForPicker.default.label, indent: 0 })}
          {scopeTreeForPicker.websites.map((w) => (
            <div key={w.websiteId} style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${PALETTE.border}` }}>
              <div style={{
                padding: '6px 12px 4px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: PALETTE.textMuted
              }}>
                Website
              </div>
              {renderItem({ key: w.websiteOption.key, label: w.websiteOption.label, indent: 0, isWebsite: true })}
              {w.items.map((s) => renderItem({ key: s.key, label: s.label, indent: 1 }))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Top header (sticky)
// ----------------------------------------------------------------------------
function PageHeader ({
  heroRef,
  mode,
  setMode,
  scopeTree,
  scopeTreeForPicker,
  scopeKey,
  onScopeChange,
  onReloadStores,
  onOpenTools,
  toolsOpen,
  userRole
}) {
  const isSchemaMode = mode === 'schema'
  return (
    <div
      ref={heroRef}
      style={{
        // Hero card. Identical chrome to DataIngestion's hero — same border,
        // radius, padding, shadow, font. Sticky so the title + scope picker
        // stay reachable while scrolling long pages of fields.
        position: 'sticky',
        top: APP_NAV_OFFSET,
        zIndex: 20,
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: RADIUS.xl,
        padding: '20px 24px',
        boxShadow: SHADOW.xs,
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        fontFamily: "adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
        {/* Left: icon tile + eyebrow + title + subtitle */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
          <div style={{
            display: 'inline-flex',
            padding: 10,
            background: PALETTE.accentSoft,
            color: PALETTE.accent,
            borderRadius: RADIUS.lg,
            flexShrink: 0
          }}>
            <Settings size="S" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
              textTransform: 'uppercase', color: PALETTE.textMuted, marginBottom: 6
            }}>
              Configurations / App Builder
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.text, lineHeight: 1.2 }}>
              {isSchemaMode ? 'Schema Designer' : 'System Configuration'}
            </div>
            <div style={{ fontSize: 13, color: PALETTE.textMuted, marginTop: 6, maxWidth: 540 }}>
              {isSchemaMode
                ? 'Define sections, groups, and fields. Renaming an id strands existing values; removing one prompts to delete its stored values.'
                : 'Manage configuration values across Default Config, websites, and store views — stored in App Builder DB.'}
            </div>
          </div>
        </div>

        {/* Right: scope picker + action buttons + Back */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {mode === 'values' && (
            <>
              <ScopePicker
                scopeTreeForPicker={scopeTreeForPicker}
                selectedKey={scopeKey}
                onChange={onScopeChange}
                disabled={scopeTree.loading}
              />
              <TooltipTrigger>
                <ActionButton onPress={onReloadStores} isDisabled={scopeTree.loading} aria-label="Reload stores">
                  <Refresh />
                </ActionButton>
                <Tooltip>Reload websites & stores from Commerce</Tooltip>
              </TooltipTrigger>
              <TooltipTrigger>
                <ActionButton onPress={onOpenTools} aria-label="Open tools" isQuiet={!toolsOpen}>
                  <CloudUpload />
                </ActionButton>
                <Tooltip>Legacy migration tools</Tooltip>
              </TooltipTrigger>
              {userRole === 'admin' && (
                <TooltipTrigger>
                  <ActionButton onPress={() => setMode('schema')} aria-label="Edit schema">
                    <Edit />
                  </ActionButton>
                  <Tooltip>Edit schema</Tooltip>
                </TooltipTrigger>
              )}
            </>
          )}
        </div>
      </div>
  )
}

// ----------------------------------------------------------------------------
// Tools drawer (Export/Import + Commerce sync)
// ----------------------------------------------------------------------------
function ToolsPanel ({
  onClose,
  // Export / Import
  onExport, exporting,
  onImport, importing,
  ioMsg,
  ioProgress,  // { phase, done, total, label }
  importSourceKey, setImportSourceKey,
  // Commerce sync
  onSyncStoreMappings, syncingStoreMappings, syncMsg
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Flex justifyContent="space-between" alignItems="center" marginBottom="size-150">
        <Flex gap="size-100" alignItems="center">
          <CloudUpload size="S" />
          <Heading level={4} margin={0}>Export / Import</Heading>
        </Flex>
        <ActionButton isQuiet onPress={onClose} aria-label="Close tools">✕</ActionButton>
      </Flex>
      <Text UNSAFE_style={{ color: PALETTE.textMuted, fontSize: 13, display: 'block', marginBottom: 12 }}>
        Download the entire configuration bundle as JSON for backup or to copy
        between workspaces.
      </Text>
      <Flex gap="size-150" alignItems="center" wrap>
        <Button variant="secondary" onPress={onExport} isDisabled={exporting || importing}>
          {exporting ? 'Exporting…' : 'Export Configuration'}
        </Button>
        <Button variant="secondary" onPress={onImport} isDisabled={importing || exporting}>
          {importing ? 'Importing…' : 'Import Configuration'}
        </Button>
      </Flex>
      <View marginTop="size-150" UNSAFE_style={{ maxWidth: 520 }}>
        <TextField
          label="Source encryption key (only for legacy v1 dumps)"
          type="password"
          value={importSourceKey}
          onChange={setImportSourceKey}
          isDisabled={importing}
          width="100%"
        />
      </View>

      {ioProgress && ioProgress.phase === 'running' && (
        <View marginTop="size-200">
          {ioProgress.total > 0
            ? (
              <ProgressBar
                label={ioProgress.label || 'Working…'}
                value={ioProgress.done}
                maxValue={ioProgress.total}
                valueLabel={`${ioProgress.done} / ${ioProgress.total}`}
                width="100%"
              />
              )
            : (
              <ProgressBar
                label={ioProgress.label || 'Working…'}
                isIndeterminate
                width="100%"
              />
              )}
        </View>
      )}
      {ioMsg && (
        <View
          marginTop="size-150"
          padding="size-150"
          UNSAFE_style={{
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: RADIUS.md
          }}
        >
          <Text UNSAFE_style={{ whiteSpace: 'pre-line', fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace' }}>
            {ioMsg}
          </Text>
        </View>
      )}

      <Divider size="S" marginY="size-250" />

      <Flex justifyContent="space-between" alignItems="center" marginBottom="size-100">
        <Heading level={4} margin={0}>Sync Store Mappings</Heading>
      </Flex>
      <Text UNSAFE_style={{ color: PALETTE.textMuted, fontSize: 13, display: 'block', marginBottom: 12 }}>
        Rebuild <code>general/settings/store_mappings</code> from Commerce.
      </Text>
      <Flex gap="size-150" alignItems="center" wrap>
        <Button
          variant="secondary"
          onPress={onSyncStoreMappings}
          isDisabled={syncingStoreMappings || exporting || importing}
        >
          {syncingStoreMappings ? 'Syncing…' : 'Sync Store Mappings'}
        </Button>
      </Flex>
      {syncMsg && (
        <View
          marginTop="size-150"
          padding="size-150"
          UNSAFE_style={{
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: RADIUS.md
          }}
        >
          <Text UNSAFE_style={{ whiteSpace: 'pre-line', fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace' }}>
            {syncMsg}
          </Text>
        </View>
      )}
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Root
// ----------------------------------------------------------------------------
export default function SystemConfig (props) {
  // Resolve user role FIRST so it can be threaded into every hook below.
  // Schema save needs role to pass the server-side admin gate.
  const { role: userRole } = useUserRole(props)
  const propsWithRole = useMemo(() => ({ ...props, userRole }), [props, userRole])

  const {
    schema,
    saveSchema,
    refresh: refreshSchema,
    loading: schemaLoading,
    saving: schemaSaving,
    error: schemaError
  } = useSystemConfigSchema(propsWithRole)
  const [mode, setMode] = useState('values')

  // Belt + braces: if a non-admin somehow lands on schema mode (e.g. stale
  // localStorage), force them back to values view.
  useEffect(() => {
    if (mode === 'schema' && userRole && userRole !== 'admin') setMode('values')
  }, [mode, userRole])
  const [toolsOpen, setToolsOpen] = useState(false)
  // Export / Import state
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [ioMsg, setIoMsg] = useState(null)
  // { phase: 'idle'|'running'|'done'|'error', done, total, label }
  const [ioProgress, setIoProgress] = useState({ phase: 'idle', done: 0, total: 0, label: '' })
  // Optional SOURCE env's SYSTEM_CONFIG_CRYPT_KEY for cross-env imports.
  const [importSourceKey, setImportSourceKey] = useState('')
  // Store-mapping sync state
  const [syncingStoreMappings, setSyncingStoreMappings] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  // Measure the hero card so the sticky save bar / sidebar always sit
  // flush against its bottom — even when the subtitle wraps to a different
  // line count on narrow viewports. Exposed via a CSS variable that the
  // save bar and sidebars (in this file and in SystemConfigSchemaEditor)
  // consume via calc().
  const heroRef = useRef(null)
  useEffect(() => {
    if (!heroRef.current) return undefined
    const update = () => {
      const h = heroRef.current ? heroRef.current.offsetHeight : HERO_HEIGHT
      document.documentElement.style.setProperty('--sc-hero-h', `${h}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(heroRef.current)
    return () => { ro.disconnect() }
  }, [mode])

  // Single source of truth — both the sticky header (scope picker) and the
  // ValuesView render against the same hook instance. Previously each rendered
  // their own copy of useSystemConfig and changes never propagated.
  const configCtx = useSystemConfig(
    propsWithRole,
    mode === 'values' ? schema : { sections: [] }
  )
  const { scope, setScope, scopeTree, refreshScopeTree } = configCtx
  const scopeTreeForPicker = useMemo(() => buildScopeTreeForPicker(scopeTree), [scopeTree])
  const scopeKey = `${scope.scope}::${scope.scopeId}`
  const onScopeChange = (key) => {
    const opt = scopeTreeForPicker.all.find((o) => o.key === key)
    if (!opt) return
    setScope({ scope: opt.scope, scopeId: opt.scopeId })
  }

  const onSchemaSave = async (next) => {
    let result = await saveSchema(next)
    if (result?.needsConfirmation) {
      const removed = result.removedPaths || []
      const ok = await confirm({
        title: 'Removing schema entries will delete stored values',
        body:
          'The following field path(s) are being removed from the schema. ' +
          'Their values will be permanently deleted from system_config_data ' +
          'across every scope:\n\n  • ' + removed.join('\n  • ') + '\n\n' +
          'Continue?',
        confirmLabel: 'Delete & save',
        cancelLabel: 'Cancel',
        variant: 'destructive'
      })
      if (!ok) return
      result = await saveSchema(next, { confirmCascade: true })
    }
    if (!result?.ok) return
    if ((result.deletedCount || 0) > 0) {
      // Refresh values too so UI reflects the deletions.
      try { await configCtx.refresh() } catch (_) {}
    }
    setMode('values')
  }

  // ── Export configuration → JSON file download ───────────────────────────
  const onExport = async () => {
    setExporting(true)
    setIoMsg(null)
    setIoProgress({ phase: 'running', done: 0, total: 0, label: 'Collecting schema + values from ABDB…' })
    try {
      const response = await callAction(
        props,
        getActionKey('exportConfig'),
        '',
        {}
      )
      const dump = response?.dump || response?.body?.dump
      if (!dump) throw new Error('Export response missing `dump`')

      setIoProgress(p => ({ ...p, label: 'Building file…' }))
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const filename = `system-config-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const c = dump.counts || {}
      setIoProgress({ phase: 'done', done: c.values || 0, total: c.values || 0, label: 'Export complete' })
      setIoMsg(`✓ Exported ${c.sections ?? '?'} section(s) and ${c.values ?? '?'} value(s) → ${filename}`)
    } catch (e) {
      console.error('Export failed', e)
      setIoProgress({ phase: 'error', done: 0, total: 0, label: 'Export failed' })
      setIoMsg(`Export failed: ${e.message || e}`)
    } finally {
      setExporting(false)
    }
  }

  // ── Import configuration ← JSON file picker ─────────────────────────────
  // Imports a previously-exported dump in client-side chunks so we can drive a
  // determinate ProgressBar (instead of a single opaque 5-minute call). On the
  // backend, import-config translates website_id/store_id by matching codes
  // against the target env's current `general/settings/store_mappings`, so be
  // sure to Sync store_mappings before importing into a fresh env.
  const IMPORT_CHUNK_SIZE = 25
  const onImport = async () => {
    // Open file picker
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    document.body.appendChild(input)

    const file = await new Promise((resolve) => {
      input.onchange = () => { resolve(input.files && input.files[0]) }
      input.click()
    })
    document.body.removeChild(input)
    if (!file) return

    let dump
    try {
      const text = await file.text()
      dump = JSON.parse(text)
    } catch (e) {
      setIoMsg(`Could not parse "${file.name}": ${e.message}`)
      return
    }

    // Modern multi-choice confirm — pick overwrite vs insert-only.
    const choice = await confirm({
      title: `Import "${file.name}"?`,
      variant: 'information',
      body: (
        <span>
          Schema + values from this dump will be applied to the current
          workspace. website_id / store_id are remapped on the fly by matching
          <code> website_code </code> and store <code>code</code> against the
          target environment&apos;s Commerce instance.
        </span>
      ),
      choices: [
        {
          label: 'Overwrite existing values',
          value: 'overwrite',
          variant: 'destructive',
          description: 'Recommended for restoring a backup. Existing rows are replaced.'
        },
        {
          label: 'Insert-only',
          value: 'insert',
          variant: 'information',
          description: 'Skip rows that already exist; only add new ones.'
        }
      ],
      cancelLabel: 'Cancel'
    })
    if (!choice) return
    const overwrite = choice === 'overwrite'

    const allValues = Array.isArray(dump.values) ? dump.values : []
    const schemaPayload = dump.schema
    const total = allValues.length

    setImporting(true)
    setIoMsg(null)
    setIoProgress({
      phase: 'running',
      done: 0,
      total,
      label: schemaPayload ? 'Importing schema…' : 'Importing values…'
    })

    const aggregate = {
      schemaImported: false,
      schemaSkipped: false,
      valuesInserted: 0,
      valuesUpserted: 0,
      valuesSkipped: 0,
      unmappedSkipped: 0,
      unmapped: [],
      invalid: [],
      idMap: null,
      sensitiveReencrypted: 0,
      sensitiveDecryptFailed: 0
    }
    const sensitiveCount = allValues.filter(
      v => typeof v?.value === 'string' && v.value.startsWith('enc:v1:')
    ).length

    try {
      // 1) Schema (only on the first call). We still send the source
      //    store_mappings each chunk so the backend can build the id map.
      if (schemaPayload) {
        const r = await callAction(
          props,
          getActionKey('importConfig'),
          '',
          { schema: schemaPayload, overwrite, valuesOnly: false, schemaOnly: true }
        )
        const s = r?.summary || r?.body?.summary
        if (s) {
          aggregate.schemaImported = !!s.schemaImported
          aggregate.schemaSkipped = !!s.schemaSkipped
        }
      }

      // 2) Values in chunks. The backend resolves scope_id remap by reading
      //    the target env's Commerce live and matching each row's
      //    `scope_code` (stamped by export-config v2+) — no source mapping
      //    needs to be carried in the dump.
      // sensitivePaths (added by export-config v2): tells the backend which
      // paths must be encrypted with the local key. Without this list the
      // backend has to derive it from the schema in ABDB, which may not be
      // present yet on a fresh import.
      const sensitivePaths = Array.isArray(dump.sensitivePaths) ? dump.sensitivePaths : undefined

      setIoProgress(p => ({ ...p, label: 'Importing values…' }))
      for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
        const chunk = allValues.slice(i, i + IMPORT_CHUNK_SIZE)
        const r = await callAction(
          props,
          getActionKey('importConfig'),
          '',
          {
            values: chunk,
            overwrite,
            valuesOnly: true,
            // Re-encrypt sensitive ciphertext against the target env's key.
            sourceCryptKey: importSourceKey ? importSourceKey.trim() : undefined,
            // sensitivePaths on every chunk so the backend knows what to
            // encrypt even before the schema row lands.
            dump: sensitivePaths ? { sensitivePaths } : undefined
          }
        )
        const s = r?.summary || r?.body?.summary
        if (s) {
          aggregate.valuesInserted += s.valuesInserted || 0
          aggregate.valuesUpserted += s.valuesUpserted || 0
          aggregate.valuesSkipped += s.valuesSkipped || 0
          aggregate.unmappedSkipped += s.unmappedSkipped || 0
          aggregate.sensitiveReencrypted += s.sensitiveReencrypted || 0
          aggregate.sensitiveDecryptFailed += s.sensitiveDecryptFailed || 0
          if (Array.isArray(s.unmapped)) aggregate.unmapped.push(...s.unmapped)
          if (Array.isArray(s.invalid)) aggregate.invalid.push(...s.invalid)
          if (s.idMap) {
            if (!aggregate.idMap) {
              aggregate.idMap = { ...s.idMap }
            } else {
              aggregate.idMap.matchedByCode = (aggregate.idMap.matchedByCode || 0) + (s.idMap.matchedByCode || 0)
              aggregate.idMap.matchedById = (aggregate.idMap.matchedById || 0) + (s.idMap.matchedById || 0)
            }
          }
        }
        setIoProgress({
          phase: 'running',
          done: Math.min(i + chunk.length, total),
          total,
          label: `Importing values… (${Math.min(i + chunk.length, total)}/${total})`
        })
      }

      const lines = [
        `✓ Import complete (${overwrite ? 'overwrite' : 'insert-only'})`,
        `  Schema: ${aggregate.schemaImported ? 'imported' : aggregate.schemaSkipped ? 'skipped (exists)' : 'no schema in dump'}`,
        `  Values: inserted=${aggregate.valuesInserted}  upserted=${aggregate.valuesUpserted}  skipped=${aggregate.valuesSkipped}`,
        aggregate.unmappedSkipped
          ? `  ⚠ Unmapped rows skipped (no matching website_code/store_code in target): ${aggregate.unmappedSkipped}`
          : '',
        sensitiveCount
          ? `  Sensitive: ${sensitiveCount} ciphertext row(s) in dump → re-encrypted=${aggregate.sensitiveReencrypted}, decrypt-failed=${aggregate.sensitiveDecryptFailed}${
              importSourceKey ? '' : ' (no source key provided — values may show blank if this env\'s key differs)'
            }`
          : '',
        aggregate.invalid.length ? `  ⚠ Invalid rows: ${aggregate.invalid.length}` : '',
        aggregate.idMap
          ? [
              `  id remap → target(${aggregate.idMap.targetSource || 'none'}, websites=${aggregate.idMap.targetWebsiteCount || 0}, stores=${aggregate.idMap.targetStoreCount || 0})  matched(by-code=${aggregate.idMap.matchedByCode || 0}, by-id=${aggregate.idMap.matchedById || 0})`,
              !aggregate.idMap.hasTarget ? '  ⚠ Target env Commerce returned no stores — check COMMERCE_BASE_URL / OAuth1 secrets in this workspace.' : ''
            ].filter(Boolean).join('\n')
          : ''
      ].filter(Boolean)
      setIoMsg(lines.join('\n'))
      setIoProgress({ phase: 'done', done: total, total, label: 'Import complete' })
      await refreshSchema()
      try { await configCtx.refresh() } catch (_) {}
    } catch (e) {
      console.error('Import failed', e)
      setIoProgress(p => ({ ...p, phase: 'error', label: 'Import failed' }))
      setIoMsg(`Import failed: ${e.message || e}`)
    } finally {
      setImporting(false)
    }
  }

  // ── Sync Store Mappings from Commerce REST ──────────────────────────────
  const onSyncStoreMappings = async () => {
    setSyncingStoreMappings(true)
    setSyncMsg('Fetching websites + store views from Commerce…')
    try {
      const response = await callAction(
        props,
        getActionKey('syncStoreMappings'),
        '',
        {}
      )
      const ok = response?.ok ?? response?.body?.ok
      const count = response?.count ?? response?.body?.count
      const mapping = response?.mapping ?? response?.body?.mapping
      if (!ok) throw new Error('Sync response missing `ok`')
      const sample = mapping
        ? Object.entries(mapping).slice(0, 5).map(([id, m]) =>
            `  ${id}: ${m.code} → website ${m.website_code}(${m.website_id}), lang=${m.language_code}`
          ).join('\n')
        : ''
      setSyncMsg(
        `✓ Synced ${count} store(s) → general/settings/store_mappings\n` +
        (sample ? sample + (count > 5 ? `\n  … (${count - 5} more)` : '') : '')
      )
      try { await configCtx.refresh() } catch (_) {}
    } catch (e) {
      console.error('Store-mapping sync failed', e)
      setSyncMsg(`Sync failed: ${e.message || e}`)
    } finally {
      setSyncingStoreMappings(false)
    }
  }

  return (
    <View
      UNSAFE_style={{
        background: PALETTE.bg,
        minHeight: '100vh',
        color: PALETTE.text
      }}
    >
      {confirmDialog}
      <View padding="size-400" maxWidth="1400px" marginX="auto">
        <PageHeader
          heroRef={heroRef}
          mode={mode}
          setMode={setMode}
          scopeTree={scopeTree}
          scopeTreeForPicker={scopeTreeForPicker}
          scopeKey={scopeKey}
          onScopeChange={onScopeChange}
          onReloadStores={refreshScopeTree}
          onOpenTools={() => setToolsOpen((o) => !o)}
          toolsOpen={toolsOpen}
          userRole={userRole}
        />

        <div style={{ paddingTop: 24 }}>
          {toolsOpen && mode === 'values' && (
            <ToolsPanel
              onClose={() => setToolsOpen(false)}
              onExport={onExport}
              exporting={exporting}
              onImport={onImport}
              importing={importing}
              ioMsg={ioMsg}
              ioProgress={ioProgress}
              importSourceKey={importSourceKey}
              setImportSourceKey={setImportSourceKey}
              onSyncStoreMappings={onSyncStoreMappings}
              syncingStoreMappings={syncingStoreMappings}
              syncMsg={syncMsg}
            />
          )}

          {schemaLoading
            ? (
              <Card>
                <Flex justifyContent="center" marginY="size-400">
                  <ProgressCircle aria-label="Loading schema" isIndeterminate />
                </Flex>
              </Card>
            )
            : mode === 'schema'
              ? (
                <SystemConfigSchemaEditor
                  schema={schema}
                  onSave={onSchemaSave}
                  onCancel={() => setMode('values')}
                  saving={schemaSaving}
                  error={schemaError}
                  palette={PALETTE}
                />
              )
              : (
                <ValuesView
                  schema={schema}
                  onEditSchema={() => setMode('schema')}
                  toolsOpen={toolsOpen}
                  setToolsOpen={setToolsOpen}
                  configCtx={configCtx}
                  callerProps={propsWithRole}
                  userRole={userRole}
                />
              )}
        </div>
      </View>
    </View>
  )
}