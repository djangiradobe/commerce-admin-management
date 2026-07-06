/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Built-in page registry. Core ships with just the System Configurations
// page; everything else (Audit Log, Snapshots, My Access) lives in
// optional add-on packages and is registered at runtime via
//   configureWeb({ extraPages, extraNav })
// from the add-on's web entry point.

import SystemConfig from '../components/SystemConfig'

export const BUILT_IN_PAGES = {
  'system-config': SystemConfig
}
