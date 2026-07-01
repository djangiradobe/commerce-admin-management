/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

import React, { useMemo, useState } from 'react'
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
  Form,
  Well,
  Radio,
  RadioGroup
} from '@adobe/react-spectrum'
import { callAction } from '../utils'
import { getActionKey } from '../settings'

// Two integration types, two field shapes.
//   • paas = OAuth 1.0a (Magento on-prem / PaaS Cloud). Operator pastes the
//     consumer + access key/secret quartet.
//   • saas = IMS OAuth (Adobe Commerce as a Cloud Service / ACCS). The
//     bearer token is MINTED PER-REQUEST from the workspace's
//     OAUTH_CLIENT_ID/SECRET/ORG_ID env vars with the `commerce.accs`
//     scope, so we don't store a static token — only the tenant base URL
//     and (optionally) an `x-api-key` override.
const FIELD_DEFS = {
  paas: [
    { key: 'baseUrl',           label: 'Commerce base URL',   placeholder: 'https://store.example.com/', type: 'text' },
    { key: 'consumerKey',       label: 'Consumer key',         placeholder: '',                          type: 'text' },
    { key: 'consumerSecret',    label: 'Consumer secret',      placeholder: '',                          type: 'password' },
    { key: 'accessToken',       label: 'Access token',         placeholder: '',                          type: 'text' },
    { key: 'accessTokenSecret', label: 'Access token secret',  placeholder: '',                          type: 'password' }
  ],
  saas: [
    {
      key: 'baseUrl',
      label: 'Commerce REST base URL (api host + tenant id)',
      placeholder: 'https://na1-sandbox.api.commerce.adobe.com/<tenant-id>/',
      type: 'text'
    },
    {
      key: 'apiKey',
      label: 'IMS API key (optional)',
      placeholder: 'Defaults to workspace OAUTH_CLIENT_ID',
      type: 'text',
      optional: true
    }
  ]
}

function emptyValues (type) {
  return FIELD_DEFS[type].reduce((a, f) => { a[f.key] = ''; return a }, {})
}

/**
 * First-run wizard for the Adobe Commerce REST connection. Supports:
 *   • OAuth 1.0a (PaaS / Magento) — static OAuth1a 4-tuple, stored encrypted.
 *   • IMS OAuth (SaaS / ACCS) — base URL + optional x-api-key. Bearer is
 *     minted at runtime from workspace OAUTH_* env vars using `commerce.accs`
 *     scope, never persisted.
 */
export default function CommerceSetupWizard ({ runtime, ims, initial, onCompleted, onCancel, decryptFailed }) {
  const [connectionType, setConnectionType] = useState(
    initial && initial.connectionType === 'saas' ? 'saas' : 'paas'
  )
  const [values, setValues] = useState(() => ({
    ...emptyValues(connectionType),
    ...(initial && initial.baseUrl ? { baseUrl: initial.baseUrl } : {})
  }))
  const [testState, setTestState] = useState({ status: 'idle', message: '' })
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })

  const fields = FIELD_DEFS[connectionType]
  const requiredKeys = useMemo(
    () => fields.filter((f) => !f.optional).map((f) => f.key),
    [fields]
  )
  const allFilled = requiredKeys.every((k) => String(values[k] || '').trim() !== '')

  const onTypeChange = (next) => {
    setConnectionType(next)
    setValues((prev) => ({ ...emptyValues(next), baseUrl: prev.baseUrl || '' }))
    setTestState({ status: 'idle', message: '' })
    setSaveState({ status: 'idle', message: '' })
  }
  const set = (k) => (v) => setValues((prev) => ({ ...prev, [k]: v }))

  async function handleTest () {
    setTestState({ status: 'running', message: 'Testing connection…' })
    try {
      const res = await callAction(
        { runtime, ims },
        getActionKey('commerceConnectionTest'),
        '',
        { connectionType, ...values }
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
        { connectionType, ...values }
      )
      const body = res && res.body ? res.body : res
      if (body && body.ok && body.saved) {
        setSaveState({ status: 'ok', message: 'Saved. Loading the rest of the app…' })
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
      {decryptFailed ? (
        <Well marginBottom="size-200" UNSAFE_style={{ borderColor: '#b58105' }}>
          <Text UNSAFE_style={{ color: '#92400e' }}>
            <strong>Existing credentials couldn't be decrypted.</strong>{' '}
            They were encrypted with a different <code>SYSTEM_CONFIG_CRYPT_KEY</code>{' '}
            than is configured now. Re-enter them below — the old record will be
            replaced on save.
          </Text>
        </Well>
      ) : (
        <Text>
          Enter the REST/OAuth credentials for your Commerce instance. They are
          encrypted before being saved to App Builder Database. The rest of the
          app stays disabled until the connection is verified.
        </Text>
      )}
      <Divider size="S" marginY="size-300" />

      <Form labelPosition="top" necessityIndicator="icon">
        <RadioGroup
          label="Integration type"
          value={connectionType}
          onChange={onTypeChange}
          orientation="vertical"
        >
          <Radio value="paas">OAuth 1.0a (PaaS / on-prem)</Radio>
          <Radio value="saas">IMS OAuth (Adobe Commerce as a Cloud Service)</Radio>
        </RadioGroup>

        {/* SaaS-specific help block — only shown for IMS OAuth. Explains
            that the bearer is minted from workspace env vars and what the
            base URL should look like. */}
        {connectionType === 'saas' && (
          <View
            marginTop="size-100"
            paddingX="size-200"
            paddingY="size-150"
            UNSAFE_style={{
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: 8
            }}
          >
            <Text UNSAFE_style={{ fontSize: 13, color: '#374151' }}>
              ACCS uses the workspace IMS Server-to-Server credential (with the
              {' '}<code>commerce.accs</code> scope). Use the <strong>api</strong> host
              {' '}(e.g. <code>na1-sandbox.api.commerce.adobe.com</code>), <strong>not</strong> the
              {' '}<code>admin.*</code> URL, and include the tenant id segment as a
              {' '}path prefix. The <code>OAUTH_CLIENT_ID</code>/<code>SECRET</code>/<code>ORG_ID</code>{' '}
              in <code>.env</code> mint the bearer token.
            </Text>
          </View>
        )}

        {fields.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            type={f.type === 'password' ? 'password' : 'text'}
            value={values[f.key] || ''}
            onChange={set(f.key)}
            autoComplete="off"
            isRequired={!f.optional}
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
