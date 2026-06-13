/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Flex,
  Heading,
  Text,
  Button,
  ActionButton,
  TextField,
  Picker,
  Item,
  Switch,
  Checkbox,
  Divider,
  Well,
  ProgressCircle
} from '@adobe/react-spectrum'
import { FIELD_TYPES, SCOPES, emptySchema } from '../schema/systemConfigSchema'
import { useConfirm } from '../hooks/useConfirm'
import { PALETTE, RADIUS, SHADOW } from '../theme'

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/

function blankField () {
  return {
    id: '',
    label: '',
    type: 'text',
    default: '',
    showIn: ['default'],
    sensitive: false,
    options: []
  }
}

function blankGroup () {
  return { id: '', label: '', fields: [] }
}

function blankSection () {
  return { id: '', label: '', groups: [] }
}

function cloneSchema (schema) {
  return JSON.parse(JSON.stringify(schema || emptySchema()))
}

function validateLocal (schema) {
  if (!Array.isArray(schema.sections)) return 'sections must be an array'
  const seenSection = new Set()
  for (const s of schema.sections) {
    if (!ID_RE.test(s.id || '')) return `Section id "${s.id}" is invalid (start with letter, [a-zA-Z0-9_])`
    if (seenSection.has(s.id)) return `Duplicate section id "${s.id}"`
    seenSection.add(s.id)
    if (!s.label?.trim()) return `Section ${s.id}: label required`
    const seenGroup = new Set()
    for (const g of s.groups || []) {
      if (!ID_RE.test(g.id || '')) return `${s.id}: group id "${g.id}" is invalid`
      if (seenGroup.has(g.id)) return `${s.id}: duplicate group id "${g.id}"`
      seenGroup.add(g.id)
      if (!g.label?.trim()) return `${s.id}.${g.id}: label required`
      const seenField = new Set()
      for (const f of g.fields || []) {
        if (!ID_RE.test(f.id || '')) return `${s.id}.${g.id}: field id "${f.id}" is invalid`
        if (seenField.has(f.id)) return `${s.id}.${g.id}: duplicate field id "${f.id}"`
        seenField.add(f.id)
        if (!f.label?.trim()) return `${s.id}.${g.id}.${f.id}: label required`
        if (!FIELD_TYPES.includes(f.type)) return `${s.id}.${g.id}.${f.id}: unknown type "${f.type}"`
        if (!Array.isArray(f.showIn) || f.showIn.length === 0) {
          return `${s.id}.${g.id}.${f.id}: pick at least one scope in showIn`
        }
        if (f.type === 'select' && (!Array.isArray(f.options) || f.options.length === 0)) {
          return `${s.id}.${g.id}.${f.id}: select fields need at least one option`
        }
      }
    }
  }
  return null
}

function FieldEditor ({ field, onChange, onRemove }) {
  const update = (patch) => onChange({ ...field, ...patch })

  const addOption = () => {
    update({ options: [...(field.options || []), { value: '', label: '' }] })
  }
  const updateOption = (i, patch) => {
    const next = [...(field.options || [])]
    next[i] = { ...next[i], ...patch }
    update({ options: next })
  }
  const removeOption = (i) => {
    const next = [...(field.options || [])]
    next.splice(i, 1)
    update({ options: next })
  }

  return (
    <div style={{
      background: PALETTE.surfaceSubtle,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: RADIUS.md,
      padding: 14,
      marginBottom: 10
    }}>
      <Flex gap="size-150" wrap alignItems="end">
        <TextField label="Field ID" value={field.id} onChange={(v) => update({ id: v })} width="size-2400" />
        <TextField label="Label" value={field.label} onChange={(v) => update({ label: v })} width="size-3000" />
        <Picker label="Type" selectedKey={field.type} onSelectionChange={(k) => update({ type: k })} width="size-2000">
          {FIELD_TYPES.map((t) => <Item key={t}>{t}</Item>)}
        </Picker>
        <TextField
          label="Default"
          value={field.default == null ? '' : String(field.default)}
          onChange={(v) => update({ default: v })}
          width="size-2400"
        />
        <ActionButton onPress={onRemove}>Remove field</ActionButton>
      </Flex>

      <Flex gap="size-200" marginTop="size-150" wrap alignItems="center">
        <Text>Visible in:</Text>
        {SCOPES.map((scope) => (
          <Checkbox
            key={scope}
            isSelected={(field.showIn || []).includes(scope)}
            onChange={(checked) => {
              const set = new Set(field.showIn || [])
              if (checked) set.add(scope)
              else set.delete(scope)
              update({ showIn: Array.from(set) })
            }}
          >
            {scope}
          </Checkbox>
        ))}
        <Switch isSelected={!!field.sensitive} onChange={(v) => update({ sensitive: v })}>
          Sensitive (encrypt at rest)
        </Switch>
      </Flex>

      {field.type === 'select' && (
        <View marginTop="size-150">
          <Text>Options</Text>
          {(field.options || []).map((opt, i) => (
            <Flex key={i} gap="size-100" marginTop="size-75" alignItems="end">
              <TextField label="Value" value={opt.value} onChange={(v) => updateOption(i, { value: v })} width="size-2400" />
              <TextField label="Label" value={opt.label} onChange={(v) => updateOption(i, { label: v })} width="size-3000" />
              <ActionButton onPress={() => removeOption(i)}>Remove</ActionButton>
            </Flex>
          ))}
          <Button variant="secondary" marginTop="size-100" onPress={addOption}>+ Add option</Button>
        </View>
      )}
    </div>
  )
}

function GroupEditor ({ group, onChange, onRemove }) {
  const update = (patch) => onChange({ ...group, ...patch })

  const addField = () => update({ fields: [...(group.fields || []), blankField()] })
  const updateField = (i, next) => {
    const fields = [...(group.fields || [])]
    fields[i] = next
    update({ fields })
  }
  const removeField = (i) => {
    const fields = [...(group.fields || [])]
    fields.splice(i, 1)
    update({ fields })
  }

  return (
    <div style={{
      background: PALETTE.surface,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: RADIUS.lg,
      boxShadow: SHADOW.xs,
      padding: 20,
      marginBottom: 16
    }}>
      <Flex gap="size-200" alignItems="end" marginBottom="size-150" wrap>
        <TextField label="Group ID" value={group.id} onChange={(v) => update({ id: v })} width="size-2400" />
        <TextField label="Group Label" value={group.label} onChange={(v) => update({ label: v })} width="size-3600" />
        <ActionButton onPress={onRemove}>Remove group</ActionButton>
      </Flex>
      <Divider size="S" marginBottom="size-150" />
      {(group.fields || []).map((f, i) => (
        <FieldEditor
          key={i}
          field={f}
          onChange={(next) => updateField(i, next)}
          onRemove={() => removeField(i)}
        />
      ))}
      <Button variant="secondary" onPress={addField}>+ Add field</Button>
    </div>
  )
}

export default function SystemConfigSchemaEditor ({ schema, onSave, onCancel, saving, error, palette }) {
  const [draft, setDraft] = useState(() => cloneSchema(schema))
  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [localError, setLocalError] = useState(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  useEffect(() => {
    setDraft(cloneSchema(schema))
  }, [schema])

  const activeSection = draft.sections[activeSectionIdx]

  const updateSection = (idx, patch) => {
    setDraft((prev) => {
      const next = cloneSchema(prev)
      next.sections[idx] = { ...next.sections[idx], ...patch }
      return next
    })
  }

  const addSection = () => {
    setDraft((prev) => {
      const next = cloneSchema(prev)
      next.sections.push(blankSection())
      return next
    })
    setActiveSectionIdx(draft.sections.length)
  }

  const removeSection = async (idx) => {
    const label = draft.sections[idx]?.label || draft.sections[idx]?.id || `section ${idx + 1}`
    const ok = await confirm({
      title: 'Remove section?',
      body: `"${label}" and all of its groups/fields will be removed from the schema. ` +
            'Values already stored under those field paths will remain in the database.',
      confirmLabel: 'Remove',
      variant: 'destructive'
    })
    if (!ok) return
    setDraft((prev) => {
      const next = cloneSchema(prev)
      next.sections.splice(idx, 1)
      return next
    })
    setActiveSectionIdx(0)
  }

  const addGroup = () => {
    updateSection(activeSectionIdx, { groups: [...(activeSection.groups || []), blankGroup()] })
  }

  const updateGroup = (gi, next) => {
    const groups = [...(activeSection.groups || [])]
    groups[gi] = next
    updateSection(activeSectionIdx, { groups })
  }

  const removeGroup = (gi) => {
    const groups = [...(activeSection.groups || [])]
    groups.splice(gi, 1)
    updateSection(activeSectionIdx, { groups })
  }

  const handleSave = async () => {
    const localMsg = validateLocal(draft)
    if (localMsg) {
      setLocalError(localMsg)
      return
    }
    setLocalError(null)
    await onSave(draft)
  }

  const combinedError = localError || error
  const displayedSections = useMemo(() => draft.sections, [draft.sections])

  const P = palette || PALETTE

  const card = {
    background: P.surface,
    border: `1px solid ${P.border}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.xs
  }

  return (
    <View>
      {confirmDialog}
      {combinedError && (
        <Well marginBottom="size-200" UNSAFE_style={{ borderColor: P.danger }}>
          <Text UNSAFE_style={{ color: P.danger }}>{combinedError}</Text>
        </Well>
      )}

      {/* Sticky save bar at the top, just below the hero card.
          Uses the runtime-measured hero height shared via the
          --sc-hero-h CSS variable set by SystemConfig. */}
      <div
        style={{
          position: 'sticky',
          top: 'calc(64px + var(--sc-hero-h, 160px))',
          marginBottom: 16,
          padding: '12px 20px',
          background: P.surface,
          border: `1px solid ${P.border}`,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.floating,
          zIndex: 10
        }}
      >
        <Flex gap="size-100" justifyContent="space-between" alignItems="center">
          <div style={{ fontSize: 12, color: P.textMuted }}>
            {displayedSections.length} section{displayedSections.length === 1 ? '' : 's'} ·
            {' '}{displayedSections.reduce((n, s) => n + (s.groups || []).length, 0)} groups ·
            {' '}{displayedSections.reduce((n, s) => n + (s.groups || []).reduce((m, g) => m + (g.fields || []).length, 0), 0)} fields
          </div>
          <Flex gap="size-100">
            <Button variant="secondary" onPress={onCancel} isDisabled={saving}>Cancel</Button>
            <Button variant="cta" onPress={handleSave} isDisabled={saving}>
              {saving ? 'Saving…' : 'Save schema'}
            </Button>
          </Flex>
        </Flex>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Section sidebar — pill-track styling matches the top AppSectionNav. */}
        <aside
          role="tablist"
          aria-label="Sections"
          style={{
            width: 260,
            flexShrink: 0,
            background: P.surfaceMuted,
            border: `1px solid ${P.border}`,
            borderRadius: RADIUS.xxl,
            boxShadow: SHADOW.inset,
            padding: 6,
            position: 'sticky',
            // Sit below AppSectionNav (64) + hero card (measured) + save bar (64) + gap
            top: 'calc(64px + var(--sc-hero-h, 160px) + 80px)',
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 64px - var(--sc-hero-h, 160px) - 96px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: P.textMuted,
            padding: '6px 14px 4px'
          }}>Sections</div>
          {displayedSections.map((s, idx) => {
            const active = idx === activeSectionIdx
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveSectionIdx(idx)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 14px',
                    border: 0,
                    borderRadius: RADIUS.pill,
                    background: active ? P.surface : 'transparent',
                    cursor: active ? 'default' : 'pointer',
                    font: 'inherit',
                    color: active ? P.accent : PALETTE.neutralText,
                    fontWeight: active ? 700 : 600,
                    textAlign: 'left',
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    boxShadow: active ? SHADOW.pill : 'none',
                    transition: 'background 140ms ease, color 140ms ease, box-shadow 140ms ease'
                  }}
                  onMouseOver={(e) => { if (!active) { e.currentTarget.style.background = PALETTE.surface; e.currentTarget.style.color = PALETTE.text } }}
                  onMouseOut={(e)  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = PALETTE.neutralText } }}
                >
                  {s.label || s.id || `(section ${idx + 1})`}
                </button>
                <ActionButton isQuiet onPress={() => removeSection(idx)} aria-label="Remove">✕</ActionButton>
              </div>
            )
          })}
          <div style={{ padding: '6px 6px 4px' }}>
            <Button variant="secondary" onPress={addSection} UNSAFE_style={{ width: '100%', borderRadius: RADIUS.pill }}>
              + Add section
            </Button>
          </div>
        </aside>

        {/* Active section editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!activeSection ? (
            <div style={{ ...card, padding: 40, textAlign: 'center' }}>
              <Heading level={3} marginTop={0}>No section selected</Heading>
              <Text UNSAFE_style={{ color: P.textMuted }}>
                Add a section on the left to begin building your configuration schema.
              </Text>
            </div>
          ) : (
            <>
              <div style={{ ...card, padding: 20, marginBottom: 16 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', color: P.textMuted, marginBottom: 12
                }}>Section properties</div>
                <Flex gap="size-200" alignItems="end" wrap>
                  <TextField
                    label="Section ID"
                    value={activeSection.id}
                    onChange={(v) => updateSection(activeSectionIdx, { id: v })}
                    width="size-2400"
                  />
                  <TextField
                    label="Section Label"
                    value={activeSection.label}
                    onChange={(v) => updateSection(activeSectionIdx, { label: v })}
                    width="size-3600"
                  />
                </Flex>
              </div>

              {(activeSection.groups || []).map((g, gi) => (
                <GroupEditor
                  key={gi}
                  group={g}
                  onChange={(next) => updateGroup(gi, next)}
                  onRemove={() => removeGroup(gi)}
                />
              ))}
              <Button variant="secondary" onPress={addGroup}>+ Add group</Button>
            </>
          )}
        </div>
      </div>

    </View>
  )
}