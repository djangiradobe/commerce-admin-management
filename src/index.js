/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

const {
  getConfig,
  clearAbdbConfigCache,
  COLLECTION: CONFIG_COLLECTION
} = require('configuration-get-config/config')

module.exports = {
  getConfig,
  clearAbdbConfigCache,
  COLLECTION: CONFIG_COLLECTION,
  ...require('configuration-get-config/abdb'),
  ...require('configuration-get-config/shared'),
  ...require('configuration-get-config/crypto'),
  ...require('configuration-get-config/oauth1a')
}
