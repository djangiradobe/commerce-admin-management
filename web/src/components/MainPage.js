/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

import { View, Flex, ProgressCircle, Text, Button, IllustratedMessage, Heading } from '@adobe/react-spectrum'
import { attach } from '@adobe/uix-guest'
import React, { useEffect, useState, useCallback } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useLocation } from 'react-router-dom'
import { getExtensionId, getActionKey, getNavItems, getPageComponent } from '../settings'
import { callAction } from '../utils'
import AppSectionNav from './AppSectionNav'
import CommerceSetupWizard from './CommerceSetupWizard'

export const MainPage = props => {
  const location = useLocation()

  // Commerce connection gate. `status === 'unknown'` while we're loading,
  // 'configured' / 'unconfigured' after the first probe. `reconfiguring`
  // re-shows the wizard for an already-configured connection.
  const [status, setStatus] = useState('unknown')
  const [maskedCreds, setMaskedCreds] = useState(null)
  const [error, setError] = useState(null)
  const [reconfiguring, setReconfiguring] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await callAction(
        props,
        getActionKey('commerceConnectionStatus'),
        '',
        { fresh: true }
      )
      const body = res && res.body ? res.body : res
      setMaskedCreds(body && body.creds ? body.creds : null)
      setStatus(body && body.configured ? 'configured' : 'unconfigured')
      setError(null)
    } catch (e) {
      setError(e.message || 'Failed to load Commerce connection status')
      setStatus('error')
    }
  }, [props])

  useEffect(() => {
    // Kick off connection-status check immediately — the action is configured
    // with require-adobe-auth: false, so it doesn't need an IMS token. The
    // IMS handshake runs in parallel and is best-effort: in raw localhost
    // (outside the Experience Cloud Shell iframe) `attach()` would hang
    // forever waiting for a parent that isn't there, so we time it out.
    fetchStatus()

    if (props.ims.token) return
    let cancelled = false
    const handshake = Promise.race([
      attach({ id: getExtensionId() }).then((gc) => ({
        token: gc?.sharedContext?.get('imsToken'),
        org: gc?.sharedContext?.get('imsOrgId')
      })),
      new Promise((resolve) => setTimeout(() => resolve(null), 2000))
    ])
    handshake.then((res) => {
      if (cancelled || !res) return
      if (res.token) props.ims.token = res.token
      if (res.org) props.ims.org = res.org
    }).catch(() => {})
    return () => { cancelled = true }
  }, [fetchStatus])

  if (status === 'unknown') {
    return (
      <Flex alignItems="center" justifyContent="center" height="size-3000">
        <Flex direction="column" alignItems="center" gap="size-150">
          <ProgressCircle size="L" isIndeterminate aria-label="Loading" />
          <Text>Checking Commerce connection…</Text>
        </Flex>
      </Flex>
    )
  }

  if (status === 'error') {
    return (
      <View padding="size-400">
        <IllustratedMessage>
          <Heading>Could not load connection status</Heading>
          <Text>{error}</Text>
        </IllustratedMessage>
        <Flex marginTop="size-200" justifyContent="center">
          <Button variant="cta" onPress={fetchStatus}>Retry</Button>
        </Flex>
      </View>
    )
  }

  if (status === 'unconfigured' || reconfiguring) {
    return (
      <CommerceSetupWizard
        runtime={props.runtime}
        ims={props.ims}
        initial={maskedCreds}
        onCompleted={() => {
          setReconfiguring(false)
          fetchStatus()
        }}
        onCancel={reconfiguring ? () => setReconfiguring(false) : undefined}
      />
    )
  }

  // Pick the page component for the active path from the nav registry.
  // To add a new page: register it in pages/index.js (or host extraPages)
  // and add an entry to nav.json (or host extraNav).
  const items = getNavItems()
  const match = items.find((it) => it.path === location.pathname) || items[0]
  const Page = match ? getPageComponent(match.id) : null

  const pageFallback = ({ error }) => (
    <View padding="size-400">
      <Heading level={3}>This page crashed</Heading>
      <Text>
        {match ? `Error in page "${match.id}": ` : ''}{error && error.message ? error.message : String(error)}
      </Text>
    </View>
  )

  return (
    <View UNSAFE_style={{ overflowX: 'clip' }}>
      <AppSectionNav
        rightSlot={
          <Button variant="secondary" onPress={() => setReconfiguring(true)}>
            Reconfigure Commerce
          </Button>
        }
      />
      <View>
        {Page
          ? (
            <ErrorBoundary FallbackComponent={pageFallback}>
              <Page runtime={props.runtime} ims={props.ims} />
            </ErrorBoundary>
          )
          : <View padding="size-400"><Text>No page registered for this route.</Text></View>
        }
      </View>
    </View>
  )
}
