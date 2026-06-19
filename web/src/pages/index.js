/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Built-in page registry. Maps `nav.json` entry `id` → React component.
// To add a new built-in page:
//   1. Drop the component into ../components (or ./<file>.js here)
//   2. Import it and add it to BUILT_IN_PAGES below
//   3. Add a matching entry to ../nav.json
// Host apps add additional pages via `configureWeb({ extraPages })`.

import SystemConfig from '../components/SystemConfig'

export const BUILT_IN_PAGES = {
  'system-config': SystemConfig
}
