/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

// Thin re-export of the shared get-config helpers. Kept as CommonJS require()
// (untyped) on purpose: an ESM `export *` of this workspace subpath cannot be
// resolved by tsc under moduleResolution:node and would need get-config present
// at build time. Consumers who want types import from
// @adobedjangir/commerce-admin-get-config directly.
module.exports = require('@adobedjangir/commerce-admin-get-config/crypto')
