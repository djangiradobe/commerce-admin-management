/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import React from 'react'
import { Provider, lightTheme } from '@adobe/react-spectrum'
import { ErrorBoundary } from 'react-error-boundary'
import { Route, Routes, HashRouter } from 'react-router-dom'
import ExtensionRegistration from './ExtensionRegistration'

function App (props) {
  props.runtime.on('configuration', ({ imsOrg, imsToken }) => {
    console.log('configuration change', { imsOrg, imsToken })
  })

  return (
    <ErrorBoundary onError={onError} FallbackComponent={fallbackComponent}>
      <HashRouter>
        <Provider
          theme={lightTheme}
          colorScheme="light"
          UNSAFE_className="sm-provider"
        >
          <Routes>
            <Route index element={<ExtensionRegistration runtime={props.runtime} ims={props.ims} />} />
          </Routes>
        </Provider>
      </HashRouter>
    </ErrorBoundary>
  )

  function onError (e, componentStack) {}

  function fallbackComponent ({ componentStack, error }) {
    return (
      <React.Fragment>
        <h1 style={{ textAlign: 'center', marginTop: '20px' }}>Something went wrong :(</h1>
        <pre>{componentStack + '\n' + error.message}</pre>
      </React.Fragment>
    )
  }
}

export default App
