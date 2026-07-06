/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/

// Registry of Spectrum workflow icons that nav.json can reference by name.
// To use a new icon: import it here and add it to the map. nav.json then
// references it as `"icon": "<Name>"`.

import Settings from '@spectrum-icons/workflow/Settings'
import Properties from '@spectrum-icons/workflow/Properties'
import Data from '@spectrum-icons/workflow/Data'
import User from '@spectrum-icons/workflow/User'
import ShoppingCart from '@spectrum-icons/workflow/ShoppingCart'
import Box from '@spectrum-icons/workflow/Box'
import Folder from '@spectrum-icons/workflow/Folder'
import LockClosed from '@spectrum-icons/workflow/LockClosed'
import UsersLock from '@spectrum-icons/workflow/UsersLock'

export const NAV_ICONS = {
  Settings,
  Properties,
  Data,
  User,
  ShoppingCart,
  Box,
  Folder,
  LockClosed,
  UsersLock
}

export function getNavIcon (name) {
  return NAV_ICONS[name] || Settings
}
