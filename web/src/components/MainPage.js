/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { View } from '@adobe/react-spectrum'
import { attach } from '@adobe/uix-guest'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getExtensionId } from '../settings'
import AppSectionNav from './AppSectionNav'
import SystemConfig from './SystemConfig'

export const MainPage = props => {
  const location = useLocation()

  useEffect(() => {
    const fetchCredentials = async () => {
      if (!props.ims.token) {
        const guestConnection = await attach({ id: getExtensionId() })
        props.ims.token = guestConnection?.sharedContext?.get('imsToken')
        props.ims.org = guestConnection?.sharedContext?.get('imsOrgId')
      }
    }
    fetchCredentials()
  }, [])

  // Add a new route branch here when a new tab is added in AppSectionNav.NAV_ITEMS.
  const renderContent = () => {
    switch (location.pathname) {
      default:
        return <SystemConfig runtime={props.runtime} ims={props.ims} />
    }
  }

  return (
    <View UNSAFE_style={{ overflowX: 'clip' }}>
      <AppSectionNav />
      <View>
        {renderContent()}
      </View>
    </View>
  )
}
