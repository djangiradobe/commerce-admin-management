/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

import React, { useState } from 'react'
import {
  View,
  Flex,
  Heading,
  Text,
  TextField,
  Button,
  ButtonGroup,
  ProgressCircle,
  StatusLight,
  Divider,
  Form
} from '@adobe/react-spectrum'
import { callAction } from '../utils'
import { getActionKey } from '../settings'

const FIELD_DEFS = [
  { key: 'baseUrl',           label: 'Commerce base URL',           placeholder: 'https://store.example.com/', type: 'text' },
  { key: 'consumerKey',       label: 'Consumer key',                placeholder: '',                            type: 'text' },
  { key: 'consumerSecret',    label: 'Consumer secret',             placeholder: '',                            type: 'password' },
  { key: 'accessToken',       label: 'Access token',                placeholder: '',                            type: 'text' },
  { key: 'accessTokenSecret', label: 'Access token secret',         placeholder: '',                            type: 'password' }
]

const EMPTY = FIELD_DEFS.reduce((a, f) => { a[f.key] = ''; return a }, {})

/**
 * First-run wizard for Adobe Commerce REST connection.
 *
 * Props:
 *   runtime, ims        — passed through to callAction
 *   initial             — masked saved values (used to prefill the URL when "Reconfigure")
 *   onCompleted()       — called after a successful save; parent should refetch status
 *   onCancel?()         — only rendered when present (Reconfigure mode)
 */
export default function CommerceSetupWizard ({ runtime, ims, initial, onCompleted, onCancel }) {
  const [values, setValues] = useState(() => ({
    ...EMPTY,
    ...(initial && initial.baseUrl ? { baseUrl: initial.baseUrl } : {})
  }))
  const [testState, setTestState] = useState({ status: 'idle', message: '' })
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })

  const set = (k) => (v) => setValues((prev) => ({ ...prev, [k]: v }))

  const allFilled = FIELD_DEFS.every((f) => String(values[f.key] || '').trim() !== '')

  async function handleTest () {
    setTestState({ status: 'running', message: 'Testing connection…' })
    try {
      const res = await callAction(
        { runtime, ims },
        getActionKey('commerceConnectionTest'),
        '',
        values
      )
      const body = res && res.body ? res.body : res
      if (body && body.ok) {
        setTestState({ status: 'ok', message: body.message || 'Connection OK' })
      } else {
        setTestState({ status: 'fail', message: (body && body.message) || 'Connection failed' })
      }
    } catch (e) {
      setTestState({ status: 'fail', message: e.message || 'Connection failed' })
    }
  }

  async function handleSave () {
    setSaveState({ status: 'running', message: 'Saving…' })
    try {
      const res = await callAction(
        { runtime, ims },
        getActionKey('commerceConnectionSave'),
        '',
        values
      )
      const body = res && res.body ? res.body : res
      if (body && body.ok && body.saved) {
        setSaveState({ status: 'ok', message: 'Saved. Loading the rest of the app…' })
        // Hand off to parent — it should refetch status and unmount the wizard.
        if (typeof onCompleted === 'function') onCompleted(body)
      } else {
        setSaveState({ status: 'fail', message: (body && body.message) || 'Save failed' })
      }
    } catch (e) {
      setSaveState({ status: 'fail', message: e.message || 'Save failed' })
    }
  }

  const testLight = testState.status === 'ok' ? 'positive'
    : testState.status === 'fail' ? 'negative'
    : testState.status === 'running' ? 'notice'
    : 'neutral'

  return (
    <View padding="size-400" maxWidth="size-6000" margin="0 auto">
      <Heading level={2}>Connect to Adobe Commerce</Heading>
      <Text>
        Enter the REST/OAuth credentials for your Commerce instance. They are encrypted before
        being saved to App Builder Database. The rest of the app stays disabled until the
        connection is verified.
      </Text>
      <Divider size="S" marginY="size-300" />

      <Form isRequired necessityIndicator="icon" labelPosition="top">
        {FIELD_DEFS.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            type={f.type === 'password' ? 'password' : 'text'}
            value={values[f.key]}
            onChange={set(f.key)}
            autoComplete="off"
            isRequired
            width="100%"
          />
        ))}
      </Form>

      <View marginTop="size-300">
        <Flex alignItems="center" gap="size-200" wrap>
          <ButtonGroup>
            <Button variant="secondary" onPress={handleTest} isDisabled={!allFilled || testState.status === 'running'}>
              {testState.status === 'running' ? 'Testing…' : 'Test connection'}
            </Button>
            <Button
              variant="cta"
              onPress={handleSave}
              isDisabled={!allFilled || testState.status === 'running' || saveState.status === 'running'}
            >
              {saveState.status === 'running' ? 'Saving…' : 'Save & continue'}
            </Button>
            {onCancel ? (
              <Button variant="secondary" onPress={onCancel}>Cancel</Button>
            ) : null}
          </ButtonGroup>
          {testState.status !== 'idle' && (
            <Flex alignItems="center" gap="size-100">
              {testState.status === 'running' && <ProgressCircle size="S" isIndeterminate aria-label="Testing" />}
              <StatusLight variant={testLight}>{testState.message}</StatusLight>
            </Flex>
          )}
        </Flex>
        {saveState.status === 'fail' && (
          <View marginTop="size-150"><StatusLight variant="negative">{saveState.message}</StatusLight></View>
        )}
        {saveState.status === 'ok' && (
          <View marginTop="size-150"><StatusLight variant="positive">{saveState.message}</StatusLight></View>
        )}
      </View>
    </View>
  )
}
