# configuration-management

Schema-driven system configuration for **Adobe Commerce** and **Adobe App Builder** sync applications.

Config reading (`getConfig`, ABDB, crypto, Commerce REST) lives in the companion package [`configuration-get-config`](https://www.npmjs.com/package/configuration-get-config). This package adds the React Admin UI, OpenWhisk actions, and App Builder setup.

## Install

```bash
npm install configuration-management
```

Your App Builder project must also have Adobe I/O runtime dependencies installed (peer dependencies):

```bash
npm install @adobe/aio-lib-core-auth @adobe/aio-lib-db @adobe/aio-lib-ims @adobe/aio-sdk dotenv
```

For the React Admin UI, also install Spectrum and React peers:

```bash
npm install react react-dom @adobe/react-spectrum @adobe/uix-guest @adobe/exc-app react-router-dom react-error-boundary @spectrum-icons/workflow
```

## Quick start

Read a config value from ABDB inside an App Builder action:

```js
// Preferred — config reader package (installed automatically with configuration-management)
const { getConfig } = require('configuration-get-config')

// Or re-exported from this package
const { getConfig } = require('configuration-management')
// const { getConfig } = require('configuration-management/config')

async function main (params) {
  const apiUrl = await getConfig('sync_general/api/url', params, {
    scope: 'websites',
    scopeCode: 'base'
  })
  // ...
}
```

## API

### Config resolution (`configuration-get-config`)

Implemented in [`configuration-get-config`](https://www.npmjs.com/package/configuration-get-config) and re-exported here.

| Export | Description |
|--------|-------------|
| `getConfig(path, params, options)` | Read a value with Magento-style scope inheritance |
| `clearAbdbConfigCache()` | Clear the in-process lookup cache |

### ABDB helpers (`configuration-management/abdb`)

| Export | Description |
|--------|-------------|
| `getClient(params, options)` | Connect to ABDB using IMS credentials from action params |
| `withDbClient(params, fn, options)` | Run work with auto-close |
| `findOne`, `insertOne`, `updateOne`, … | Mongo-style collection helpers |

### Scope / path model (`configuration-management/shared`)

| Export | Description |
|--------|-------------|
| `toStateKey(scope, scopeId, path)` | Encode `section/group/field` as ABDB document `_id` |
| `buildInheritanceChain(scope, scopeId, parentWebsiteId)` | Magento-style fallback chain |
| `isValidPath`, `normalizeScope`, `normalizeScopeId` | Validation helpers |

### Encryption (`configuration-management/crypto`)

| Export | Description |
|--------|-------------|
| `encrypt(plaintext, params)` | AES-256-GCM encrypt for at-rest storage |
| `decrypt(ciphertext, params)` | Decrypt stored values |
| `isEncrypted(value)` | Detect `enc:v1:` wire format |

### Commerce REST (`configuration-management/oauth1a`)

| Export | Description |
|--------|-------------|
| `getCommerceOauthClient(options, logger)` | OAuth 1.0a client for Adobe Commerce REST API |

### React Admin UI (`configuration-management/web`)

Spectrum-based Commerce Admin extension UI for schema-driven system configuration.

```js
import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  ConfigurationManagementApp,
  configureWeb
} from 'configuration-management/web'
import actionUrls from './config.json'
import 'configuration-management/web/styles.css'

configureWeb({ actionUrls })

createRoot(document.getElementById('root')).render(
  React.createElement(ConfigurationManagementApp, { runtime, ims })
)
```

The web UI is **pre-built** in the package. Import the JS entry — styles load automatically:

```js
import { ConfigurationManagementApp, configureWeb } from 'configuration-management/web'
```

Or import styles separately:

```js
import 'configuration-management/web/styles.css'
```

| Export | Description |
|--------|-------------|
| `ConfigurationManagementApp` | Full app shell (router + Spectrum provider + UIX registration) |
| `SystemConfig` | Dynamic config form UI |
| `SystemConfigSchemaEditor` | Schema designer |
| `useSystemConfig`, `useSystemConfigSchema` | Data hooks |
| `configureWeb({ actionUrls, extensionId, actionKeys })` | Wire deploy-time action URLs before render |

Styles: `import 'configuration-management/web/styles.css'`

### App Builder actions (`configuration-management/actions`)

OpenWhisk runtime actions and the Commerce Admin extension manifest ship with the package.

#### Automatic wiring on `npm install`

The package runs a **postinstall** script that patches your project's `app.config.yaml`
(if present) with:

```yaml
extensions:
  commerce/backend-ui/1:
    $include: node_modules/configuration-management/actions/configurations/ext.config.yaml
```

It does **not** modify your `web-src/` files. Add the UI to your existing App Builder
bootstrap manually (see React Admin UI above).

- Run `npm install` from your App Builder project root (where `app.config.yaml` lives).
- Do not use `npm install --ignore-scripts` (that skips postinstall).

Opt out for a single install:

```bash
CONFIGURATION_MANAGEMENT_SKIP_SETUP=1 npm install configuration-management
```

Re-run manually anytime:

```bash
npx configuration-management-setup
```

#### Manual wiring

If you prefer to edit `app.config.yaml` yourself:

```yaml
extensions:
  commerce/backend-ui/1:
    $include: node_modules/configuration-management/actions/configurations/ext.config.yaml
```

The bundled `ext.config.yaml` declares all actions under the `ConfigurationManagement` package
(`system-config-list`, `system-config-save`, `system-config-schema`, `export-config`,
`import-config`, `commerce-rest-get`, `sync-store-mappings-from-commerce`) plus admin menu
`registration`. It expects a `web-src/` folder at your project root for the UI shell.

**Minimal host project layout:**

```
my-app/
├── app.config.yaml          ← $include ext.config (auto-patched on npm install)
├── web-src/
│   └── src/
│       ├── index.js         ← your app bootstrap + package imports (see above)
│       └── config.json      ← generated by aio app deploy
├── .env
└── package.json             ← depends on configuration-management
```

Action helper utilities are also exported for custom actions:

```js
const { errorResponse, checkMissingRequestInputs } = require('configuration-management/actions/utils')
```

## Environment / action inputs

| Variable | Purpose |
|----------|---------|
| `AIO_DB_REGION` | ABDB region (`amer`, `emea`, …) |
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_ORG_ID`, `OAUTH_SCOPES` | IMS credentials for ABDB |
| `SYSTEM_CONFIG_CRYPT_KEY` | Preferred encryption key (fallback: `OAUTH_CLIENT_SECRET`) |
| `COMMERCE_BASE_URL`, `COMMERCE_CONSUMER_*`, `COMMERCE_ACCESS_TOKEN*` | Commerce REST (for scope code resolution) |

## Storage model

Documents in the `system_config_data` collection:

```
{ _id, scope, scope_id, path, value, createdAt, updatedAt }
```

Config paths use the format `section/group/field` (e.g. `sync_general/api/url`).

## License

Apache-2.0
