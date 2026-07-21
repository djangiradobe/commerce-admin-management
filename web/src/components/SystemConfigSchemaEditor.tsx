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
import { FIELD_TYPES, SCOPES, emptySchema, sortByOrder, nextSortOrder, renumberSortOrder } from '../schema/systemConfigSchema'
import { presetsForType, applyPreset, PRESETS_BY_ID } from '../schema/validation-presets'
import { useConfirm } from '../hooks/useConfirm'
import { PALETTE, RADIUS, SHADOW } from '../theme'

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/

// Stable per-item identity for React keys. The editable `id` field can't be
// used as a key: while the operator types it, the value changes on every
// keystroke, so a key derived from it would remount the row and drop focus
// after the first character. `_uid` is assigned once, never edited, and
// stripped before the schema is persisted.
let _uidSeq = 0
function uid () {
  _uidSeq += 1
  return `u${Date.now().toString(36)}_${_uidSeq}`
}

function blankField (siblings = []) {
  return {
    _uid: uid(),
    id: '',
    label: '',
    type: 'text',
    default: '',
    showIn: ['default'],
    sensitive: false,
    options: [],
    sortOrder: nextSortOrder(siblings)
  }
}

function blankGroup (siblings = []) {
  return { _uid: uid(), id: '', label: '', fields: [], sortOrder: nextSortOrder(siblings) }
}

function blankSection (siblings = []) {
  return { _uid: uid(), id: '', label: '', groups: [], sortOrder: nextSortOrder(siblings) }
}

/** Fill in `_uid` for any section/group/field that lacks one (e.g. loaded
 *  from the DB). Mutates in place; existing uids are preserved. */
function ensureUids (schema) {
  for (const s of schema?.sections || []) {
    if (!s._uid) s._uid = uid()
    for (const g of s.groups || []) {
      if (!g._uid) g._uid = uid()
      for (const f of g.fields || []) {
        if (!f._uid) f._uid = uid()
      }
    }
  }
  return schema
}

/** Deep copy with all `_uid` markers removed — used just before persisting. */
function stripUids (schema) {
  const clean = JSON.parse(JSON.stringify(schema || {}))
  for (const s of clean.sections || []) {
    delete s._uid
    for (const g of s.groups || []) {
      delete g._uid
      for (const f of g.fields || []) delete f._uid
    }
  }
  return clean
}

/**
 * Tiny HTML5 drag-and-drop helper for an ordered list. The list keeps its
 * own state and bubbles a single `onReorder(newArray)` callback. We avoid
 * external libraries — the list is short enough that native DnD events
 * work cleanly and ship 0 bytes.
 *
 * Usage:
 *   const dnd = useDnd(items, onReorder)
 *   <Wrap key={i} {...dnd.handlers(i)} dragging={dnd.draggingIndex===i}>...</Wrap>
 */
function useDnd (items, onReorder) {
  const [draggingIndex, setDraggingIndex] = useState(null)
  const [hoverIndex, setHoverIndex] = useState(null)

  const handlers = (idx) => ({
    draggable: true,
    onDragStart: (e) => {
      setDraggingIndex(idx)
      try { e.dataTransfer.effectAllowed = 'move' } catch (_) {}
      try { e.dataTransfer.setData('text/plain', String(idx)) } catch (_) {}
    },
    onDragOver: (e) => {
      e.preventDefault()
      try { e.dataTransfer.dropEffect = 'move' } catch (_) {}
      if (hoverIndex !== idx) setHoverIndex(idx)
    },
    onDragLeave: () => {
      if (hoverIndex === idx) setHoverIndex(null)
    },
    onDrop: (e) => {
      e.preventDefault()
      const from = draggingIndex
      const to = idx
      setDraggingIndex(null)
      setHoverIndex(null)
      if (from == null || from === to) return
      const next = [...items]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      // Re-stamp sortOrder so the new positions persist.
      onReorder(renumberSortOrder(next))
    },
    onDragEnd: () => {
      setDraggingIndex(null)
      setHoverIndex(null)
    }
  })
  return { draggingIndex, hoverIndex, handlers }
}

/** Drag handle icon — purely visual, kept tiny so it doesn't dominate rows. */
function DragHandle ({ active }) {
  return (
    <span
      title="Drag to reorder"
      style={{
        cursor: 'grab',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 4,
        color: active ? PALETTE.accent : PALETTE.textMuted,
        fontSize: 16,
        lineHeight: 1
      }}
    >
      ⋮⋮
    </span>
  )
}

function cloneSchema (schema) {
  // JSON round-trip preserves any existing `_uid`; ensureUids backfills the
  // rest so every row has a stable key from the moment it's loaded.
  return ensureUids(JSON.parse(JSON.stringify(schema || emptySchema())))
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

function FieldEditor ({ field, onChange, onRemove, dragging }) {
  const update = (patch) => onChange({ ...field, ...patch })
  const [advOpen, setAdvOpen] = useState(false)

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
        <DragHandle active={dragging} />
        <TextField label="Field ID" value={field.id} onChange={(v) => update({ id: v })} width="size-2400" />
        <TextField label="Label" value={field.label} onChange={(v) => update({ label: v })} width="size-3000" />
        <Picker
          label="Type"
          selectedKey={field.type}
          onSelectionChange={(k) => {
            // Changing the type can invalidate the current validation preset
            // (e.g. JSON preset on a select field, integer preset on a
            // textarea). Clear preset-derived rules unless the existing
            // preset still applies to the new type — keep `required` either
            // way.
            const v = field.validation || {}
            const currentPreset = v.preset && PRESETS_BY_ID.get(v.preset)
            const stillApplies = currentPreset && (!currentPreset.types || currentPreset.types.includes(k))
            const nextValidation = stillApplies
              ? v
              : (v.required ? { required: true } : undefined)
            update({ type: k, validation: nextValidation })
          }}
          width="size-2000"
        >
          {FIELD_TYPES.map((t) => <Item key={t}>{t}</Item>)}
        </Picker>
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
        <View marginTop="size-200">
          <Text
            UNSAFE_style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: PALETTE.textMuted,
              marginBottom: 8
            }}
          >
            Options
          </Text>
          {(field.options || []).map((opt, i) => (
            <Flex key={i} gap="size-100" marginBottom="size-100" alignItems="end">
              <TextField label="Value" value={opt.value} onChange={(v) => updateOption(i, { value: v })} width="size-2400" />
              <TextField label="Label" value={opt.label} onChange={(v) => updateOption(i, { label: v })} width="size-3000" />
              <ActionButton onPress={() => removeOption(i)}>Remove</ActionButton>
            </Flex>
          ))}
          <Button variant="secondary" onPress={addOption}>+ Add option</Button>
        </View>
      )}

      {/* Advanced Options — collapsed by default. Holds the less-common
          per-field settings (Default value, Sort order, Min role) plus the
          full Validation editor, so the common row stays uncluttered. */}
      <View marginTop="size-200">
        <ActionButton isQuiet onPress={() => setAdvOpen((o) => !o)}>
          <Text UNSAFE_style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: PALETTE.textMuted
          }}>
            {advOpen ? '▾' : '▸'} Advanced Options
          </Text>
        </ActionButton>

        {advOpen && (
          <View marginTop="size-150">
            <Flex gap="size-150" wrap alignItems="end">
              <TextField
                label="Default"
                value={field.default == null ? '' : String(field.default)}
                onChange={(v) => update({ default: v })}
                width="size-2400"
              />
              <TextField
                label="Sort order"
                value={String(field.sortOrder ?? 0)}
                onChange={(v) => update({ sortOrder: Number(v) || 0 })}
                width="size-1200"
                type="number"
              />
              <Picker
                label="Min role"
                selectedKey={field.requiredRole || 'none'}
                onSelectionChange={(k) => update({ requiredRole: k === 'none' ? undefined : k })}
                width="size-1700"
              >
                <Item key="none">(anyone)</Item>
                <Item key="viewer">viewer</Item>
                <Item key="editor">editor</Item>
                <Item key="admin">admin</Item>
              </Picker>
            </Flex>

            <ValidationEditor field={field} onChange={onChange} />
          </View>
        )}
      </View>
    </div>
  )
}

/**
 * Inline editor for `field.validation`. Stored on the field as:
 *   { required, pattern, patternMessage,
 *     min, max,                  // numbers only
 *     minLength, maxLength,      // strings only
 *     enum: ['a','b'] }
 * Plus `field.testActionKey` (sibling of `validation`) — picks one of the
 * action keys from DEFAULT_ACTION_KEYS. Setting it makes the form render a
 * "Test" button in the group's header that POSTs the group's draft values
 * to that action.
 *
 * Mirrors the rules consumed by validateFieldValue() (browser) and
 * schema-validation.js (server). Storing strings (parsed lazily on the
 * consumer side) keeps the schema JSON-only.
 */
function ValidationEditor ({ field, onChange }) {
  const v = field.validation || {}
  const setV = (patch) => {
    const next = { ...v, ...patch }
    // strip empty values so the schema stays clean
    for (const k of Object.keys(next)) {
      const val = next[k]
      if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) delete next[k]
    }
    const update = Object.keys(next).length ? { validation: next } : { validation: undefined }
    onChange({ ...field, ...update })
  }
  const isNumber = field.type === 'number'
  const isString = field.type === 'text' || field.type === 'textarea' || field.type === 'password'

  return (
    <View
      marginTop="size-150"
      paddingX="size-150"
      paddingY="size-100"
      UNSAFE_style={{
        borderTop: `1px dashed ${PALETTE.border}`
      }}
    >
      <Text UNSAFE_style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: PALETTE.textMuted }}>
        Validation
      </Text>
      {/* Magento-style preset picker — selecting an entry stamps the rule
          (pattern / patternMessage / min / max / format) into validation.*.
          You can then tweak the individual rules below; the preset id is
          remembered so the picker shows your current choice. */}
      <Flex gap="size-150" wrap alignItems="end" marginTop="size-100">
        <Picker
          label="Preset"
          selectedKey={v.preset || 'free-text'}
          onSelectionChange={(id) => {
            const next = applyPreset(id, field)
            // Empty preset clears any preset-derived rules but keeps `required`.
            if (id === 'free-text') {
              const kept = v.required ? { required: true } : {}
              onChange({ ...field, validation: Object.keys(kept).length ? kept : undefined })
              return
            }
            onChange({ ...field, validation: next })
          }}
          width="size-3000"
        >
          {presetsForType(field.type).map((p) => (
            <Item key={p.id}>{p.label}</Item>
          ))}
        </Picker>
        <Switch isSelected={!!v.required} onChange={(b) => setV({ required: b || undefined })}>
          Required
        </Switch>

        {isNumber && (
          <>
            <TextField
              label="Min"
              value={v.min == null ? '' : String(v.min)}
              onChange={(s) => setV({ min: s === '' ? undefined : Number(s) })}
              width="size-1200"
              type="number"
            />
            <TextField
              label="Max"
              value={v.max == null ? '' : String(v.max)}
              onChange={(s) => setV({ max: s === '' ? undefined : Number(s) })}
              width="size-1200"
              type="number"
            />
          </>
        )}

        {isString && (
          <>
            <TextField
              label="Min length"
              value={v.minLength == null ? '' : String(v.minLength)}
              onChange={(s) => setV({ minLength: s === '' ? undefined : Number(s) })}
              width="size-1600"
              type="number"
            />
            <TextField
              label="Max length"
              value={v.maxLength == null ? '' : String(v.maxLength)}
              onChange={(s) => setV({ maxLength: s === '' ? undefined : Number(s) })}
              width="size-1600"
              type="number"
            />
            <TextField
              label="Pattern (regex)"
              value={v.pattern || ''}
              onChange={(s) => setV({ pattern: s || undefined })}
              width="size-3000"
              placeholder="^https://"
            />
            <TextField
              label="Pattern message"
              value={v.patternMessage || ''}
              onChange={(s) => setV({ patternMessage: s || undefined })}
              width="size-3000"
              placeholder="Must start with https://"
            />
          </>
        )}

        <TextField
          label={field.type === 'select' ? 'Enum (overrides options)' : 'Enum'}
          value={Array.isArray(v.enum) ? v.enum.join(', ') : ''}
          onChange={(s) => {
            const parts = (s || '').split(',').map((x) => x.trim()).filter(Boolean)
            setV({ enum: parts.length ? parts : undefined })
          }}
          width="size-3000"
          placeholder="value1, value2"
        />
      </Flex>

    </View>
  )
}

/** Renders + reorders an array of groups (one section at a time). */
function GroupList ({ groups, onReorder, onUpdate, onRemove }) {
  const dnd = useDnd(groups, onReorder)
  return (
    <>
      {groups.map((g, gi) => {
        const dragging = dnd.draggingIndex === gi
        const hover = dnd.hoverIndex === gi && !dragging
        return (
          <div
            key={g._uid || gi}
            {...dnd.handlers(gi)}
            style={{
              opacity: dragging ? 0.4 : 1,
              borderTop: hover ? `3px solid ${PALETTE.accent}` : '3px solid transparent',
              transition: 'border-color 100ms ease, opacity 100ms ease'
            }}
          >
            <GroupEditor
              group={g}
              dragging={dragging}
              onChange={(next) => onUpdate(gi, next)}
              onRemove={() => onRemove(gi)}
            />
          </div>
        )
      })}
    </>
  )
}

function GroupEditor ({ group, onChange, onRemove, dragging }) {
  const update = (patch) => onChange({ ...group, ...patch })
  const fieldsSorted = sortByOrder(group.fields || [])

  const addField = () => {
    const siblings = group.fields || []
    update({ fields: [...siblings, blankField(siblings)] })
  }
  const updateField = (i, next) => {
    // `i` indexes the SORTED array; map back to the unsorted one by id.
    const original = group.fields || []
    const target = fieldsSorted[i]
    const idx = original.findIndex((f) => f === target)
    if (idx === -1) return
    const fields = [...original]
    fields[idx] = next
    update({ fields })
  }
  const removeField = (i) => {
    const original = group.fields || []
    const target = fieldsSorted[i]
    const idx = original.findIndex((f) => f === target)
    if (idx === -1) return
    const fields = [...original]
    fields.splice(idx, 1)
    update({ fields })
  }
  const reorderFields = (newArr) => update({ fields: newArr })
  const fieldDnd = useDnd(fieldsSorted, reorderFields)

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
        <DragHandle active={dragging} />
        <TextField label="Group ID" value={group.id} onChange={(v) => update({ id: v })} width="size-2400" />
        <TextField label="Group Label" value={group.label} onChange={(v) => update({ label: v })} width="size-3600" />
        <TextField
          label="Sort order"
          value={String(group.sortOrder ?? 0)}
          onChange={(v) => update({ sortOrder: Number(v) || 0 })}
          width="size-1200"
          type="number"
        />
        <ActionButton onPress={onRemove}>Remove group</ActionButton>
      </Flex>
      <Divider size="S" marginBottom="size-150" />
      {fieldsSorted.map((f, i) => {
        const fDragging = fieldDnd.draggingIndex === i
        const fHover = fieldDnd.hoverIndex === i && !fDragging
        return (
          <div
            key={f._uid || i}
            {...fieldDnd.handlers(i)}
            style={{
              opacity: fDragging ? 0.4 : 1,
              borderTop: fHover ? `2px solid ${PALETTE.accent}` : '2px solid transparent'
            }}
          >
            <FieldEditor
              field={f}
              dragging={fDragging}
              onChange={(next) => updateField(i, next)}
              onRemove={() => removeField(i)}
            />
          </div>
        )
      })}
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
      next.sections.push(blankSection(next.sections))
      return next
    })
    setActiveSectionIdx(draft.sections.length)
  }

  /** Replace the sections array (used by drag-and-drop reorder). */
  const reorderSections = (newArr) => {
    setDraft((prev) => {
      const next = cloneSchema(prev)
      // Keep the active section selected as it moves to its new index.
      const currentUid = next.sections[activeSectionIdx]?._uid
      next.sections = newArr
      const newIdx = currentUid ? newArr.findIndex((s) => s._uid === currentUid) : 0
      if (newIdx >= 0) setActiveSectionIdx(newIdx)
      return next
    })
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
    const siblings = activeSection.groups || []
    updateSection(activeSectionIdx, { groups: [...siblings, blankGroup(siblings)] })
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

  const reorderGroups = (newArr) => {
    updateSection(activeSectionIdx, { groups: newArr })
  }

  const handleSave = async () => {
    const localMsg = validateLocal(draft)
    if (localMsg) {
      setLocalError(localMsg)
      return
    }
    setLocalError(null)
    await onSave(stripUids(draft))
  }

  const combinedError = localError || error
  // Sections render in sortOrder. The active index now refers to this
  // sorted view, not the underlying draft array, so reordering visually
  // matches what the operator sees.
  const displayedSections = useMemo(() => sortByOrder(draft.sections), [draft.sections])
  const sectionDnd = useDnd(displayedSections, reorderSections)

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
            const dragging = sectionDnd.draggingIndex === idx
            const hover = sectionDnd.hoverIndex === idx && !dragging
            return (
              <div
                key={s._uid || idx}
                {...sectionDnd.handlers(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: dragging ? 0.4 : 1,
                  borderTop: hover ? `2px solid ${P.accent}` : '2px solid transparent'
                }}
              >
                <DragHandle active={dragging} />
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
                  <TextField
                    label="Sort order"
                    value={String(activeSection.sortOrder ?? 0)}
                    onChange={(v) => updateSection(activeSectionIdx, { sortOrder: Number(v) || 0 })}
                    width="size-1200"
                    type="number"
                  />
                </Flex>
              </div>

              <GroupList
                groups={sortByOrder(activeSection.groups || [])}
                onReorder={reorderGroups}
                onUpdate={updateGroup}
                onRemove={removeGroup}
              />
              <Button variant="secondary" onPress={addGroup}>+ Add group</Button>
            </>
          )}
        </div>
      </div>

    </View>
  )
}