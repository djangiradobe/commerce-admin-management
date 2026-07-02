// web/src/components/App.js
import React5 from "react";
import { Provider as Provider2, lightTheme as lightTheme2 } from "@adobe/react-spectrum";
import { ErrorBoundary as ErrorBoundary2 } from "react-error-boundary";
import { Route, Routes, HashRouter } from "react-router-dom";

// web/src/components/ExtensionRegistration.js
import { register } from "@adobe/uix-guest";

// web/src/components/MainPage.js
import { View as View4, Flex as Flex4, ProgressCircle as ProgressCircle4, Text as Text4, Button as Button4, IllustratedMessage, Heading as Heading4 } from "@adobe/react-spectrum";
import { attach } from "@adobe/uix-guest";
import React4, { useEffect as useEffect7, useState as useState8, useCallback as useCallback5 } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useLocation as useLocation2 } from "react-router-dom";

// web/src/nav.json
var nav_default = {
  items: [
    {
      id: "system",
      label: "System",
      icon: "Settings",
      children: [
        {
          id: "system-config",
          path: "/",
          label: "System Configurations",
          icon: "Settings"
        }
      ]
    }
  ]
};

// web/src/components/SystemConfig.js
import { useState as useState5, useMemo as useMemo3, useEffect as useEffect5, useRef as useRef2, useCallback as useCallback4 } from "react";
import { Link } from "react-router-dom";
import {
  View as View2,
  Flex as Flex2,
  Heading as Heading2,
  Text as Text2,
  Button as Button2,
  ButtonGroup,
  ActionButton as ActionButton2,
  TooltipTrigger,
  Tooltip,
  TextField as TextField2,
  TextArea,
  NumberField,
  Switch as Switch2,
  Checkbox as Checkbox2,
  Picker as Picker2,
  Item as Item2,
  Section,
  ProgressCircle as ProgressCircle2,
  ProgressBar,
  Divider as Divider2,
  Well as Well2,
  SearchField,
  DialogTrigger,
  Dialog,
  Header,
  Content,
  StatusLight
} from "@adobe/react-spectrum";
import Settings from "@spectrum-icons/workflow/Settings";
import Globe from "@spectrum-icons/workflow/Globe";
import Refresh from "@spectrum-icons/workflow/Refresh";
import Edit from "@spectrum-icons/workflow/Edit";
import CloudUpload from "@spectrum-icons/workflow/UploadToCloud";
import LockClosed from "@spectrum-icons/workflow/LockClosed";
import Back from "@spectrum-icons/workflow/Back";
import ChevronDown from "@spectrum-icons/workflow/ChevronDown";
import ChevronRight from "@spectrum-icons/workflow/ChevronRight";

// web/src/hooks/useSystemConfig.js
import { useCallback, useEffect, useMemo, useState } from "react";

// web/src/utils.js
function resolveActor(ims) {
  if (!ims || typeof ims !== "object") return "anonymous";
  const profile = ims.profile || {};
  const candidate = profile.email || profile.userId || profile.displayName || profile.first_name || ims.org;
  return candidate ? String(candidate) : "anonymous";
}
async function callAction(props, action, operation, body = {}) {
  var _a;
  const url = getActionUrl(action);
  if (!url) {
    throw new Error(`Action ${action} is not configured. Call configureWeb({ actionUrls }) with deploy-time URLs.`);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gw-ims-org-id": props.ims && props.ims.org || "",
      authorization: `Bearer ${props.ims && props.ims.token || ""}`
    },
    body: JSON.stringify({
      operation,
      ...body
    })
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid response from ${action}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = (parsed == null ? void 0 : parsed.error) || ((_a = parsed == null ? void 0 : parsed.body) == null ? void 0 : _a.error) || (parsed == null ? void 0 : parsed.message) || `Action ${action} failed with HTTP ${res.status}`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.response = parsed;
    throw err;
  }
  return parsed;
}

// web/src/schema/systemConfigSchema.js
var FIELD_TYPES = ["text", "textarea", "password", "number", "select", "boolean"];
var SCOPES = ["default", "websites", "stores"];
var SENSITIVE_FIELD_TYPES = /* @__PURE__ */ new Set(["password"]);
function emptySchema() {
  return { sections: [] };
}
function getFieldPath(sectionId, groupId, fieldId) {
  return `${sectionId}/${groupId}/${fieldId}`;
}
function isFieldSensitive(field) {
  return !!(field == null ? void 0 : field.sensitive) || SENSITIVE_FIELD_TYPES.has(field == null ? void 0 : field.type);
}
function isFieldVisibleAtScope(field, scope) {
  const allowed = (field == null ? void 0 : field.showIn) || ["default"];
  return allowed.includes(scope);
}
function sortByOrder(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it, idx) => ({ it, idx, ord: typeof (it == null ? void 0 : it.sortOrder) === "number" ? it.sortOrder : 0 })).sort((a, b) => a.ord - b.ord || a.idx - b.idx).map((x) => x.it);
}
function nextSortOrder(items) {
  if (!Array.isArray(items) || items.length === 0) return 10;
  const max = items.reduce(
    (m, it) => Math.max(m, typeof (it == null ? void 0 : it.sortOrder) === "number" ? it.sortOrder : 0),
    0
  );
  return max + 10;
}
function renumberSortOrder(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it, i) => ({ ...it, sortOrder: (i + 1) * 10 }));
}
function flattenFields(schema) {
  const out = [];
  if (!schema || !Array.isArray(schema.sections)) return out;
  for (const section of sortByOrder(schema.sections)) {
    if (!Array.isArray(section.groups)) continue;
    for (const group of sortByOrder(section.groups)) {
      if (!Array.isArray(group.fields)) continue;
      for (const field of sortByOrder(group.fields)) {
        out.push({
          section,
          group,
          field,
          path: getFieldPath(section.id, group.id, field.id),
          sensitive: isFieldSensitive(field)
        });
      }
    }
  }
  return out;
}
function coerceDefault(field) {
  var _a;
  switch (field == null ? void 0 : field.type) {
    case "boolean":
      return !!field.default;
    case "number":
      return typeof field.default === "number" ? field.default : Number(field.default) || 0;
    default:
      return (_a = field == null ? void 0 : field.default) != null ? _a : "";
  }
}
function validateFieldValue(field, value) {
  if (!field) return null;
  const v = field.validation || {};
  const isEmpty = value == null || value === "" || Array.isArray(value) && value.length === 0;
  if (v.required && isEmpty) {
    return `${field.label || field.id} is required`;
  }
  if (isEmpty) return null;
  if (field.type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return `${field.label || field.id} must be a number`;
    if (v.min != null && n < v.min) return `${field.label || field.id} must be \u2265 ${v.min}`;
    if (v.max != null && n > v.max) return `${field.label || field.id} must be \u2264 ${v.max}`;
  } else if (typeof value === "string") {
    if (v.minLength != null && value.length < v.minLength) {
      return `${field.label || field.id} must be at least ${v.minLength} characters`;
    }
    if (v.maxLength != null && value.length > v.maxLength) {
      return `${field.label || field.id} must be at most ${v.maxLength} characters`;
    }
    if (v.pattern) {
      try {
        const re = new RegExp(v.pattern);
        if (!re.test(value)) {
          return v.patternMessage || `${field.label || field.id} does not match the required pattern`;
        }
      } catch (_) {
      }
    }
  }
  if (Array.isArray(v.enum) && v.enum.length && !v.enum.includes(value)) {
    return `${field.label || field.id} must be one of: ${v.enum.join(", ")}`;
  }
  const acceptsJsonFormat = field.type === "text" || field.type === "textarea" || field.type === "password";
  if (v.format === "json" && acceptsJsonFormat && typeof value === "string") {
    try {
      JSON.parse(value);
    } catch (_) {
      return `${field.label || field.id} must be valid JSON`;
    }
  }
  return null;
}
function validateSchema(schema, values) {
  const errors = {};
  if (!schema || !Array.isArray(schema.sections)) return errors;
  for (const section of schema.sections) {
    for (const group of section.groups || []) {
      for (const field of group.fields || []) {
        const path = getFieldPath(section.id, group.id, field.id);
        if (!(path in values)) continue;
        const err = validateFieldValue(field, values[path]);
        if (err) errors[path] = err;
      }
    }
  }
  return errors;
}

// web/src/utils/storeMappingsFromCommerceRest.js
function localeToLanguageCode(locale) {
  if (locale == null || locale === "") return null;
  const s = String(locale).trim();
  const head = s.split(/[-_]/u)[0];
  if (head && /^[a-zA-Z]{2,8}$/.test(head)) return head.toLowerCase();
  return null;
}
function inferLanguageFromStoreCode(code) {
  if (typeof code !== "string") return null;
  const m = /^([a-z]{2})[-_]/i.exec(code);
  return m ? m[1].toLowerCase() : null;
}
function buildStoreMappingsFromCommercePayload(websitesRaw, storeViewsRaw, storeConfigsRaw) {
  const websiteIdToCode = /* @__PURE__ */ new Map();
  if (Array.isArray(websitesRaw)) {
    for (const w of websitesRaw) {
      if (w && w.id != null && w.code != null) {
        websiteIdToCode.set(String(w.id), String(w.code));
      }
    }
  }
  const storeCodeToLocale = /* @__PURE__ */ new Map();
  if (Array.isArray(storeConfigsRaw)) {
    for (const cfg of storeConfigsRaw) {
      if (cfg && cfg.code != null && cfg.locale != null) {
        storeCodeToLocale.set(String(cfg.code), String(cfg.locale));
      }
    }
  }
  const mappings = {};
  if (!Array.isArray(storeViewsRaw)) return mappings;
  for (const s of storeViewsRaw) {
    if (!s || s.id == null || s.code == null) continue;
    const id = String(s.id);
    const code = String(s.code);
    const websiteId = s.website_id != null ? String(s.website_id) : "";
    const websiteCode = websiteIdToCode.get(websiteId) || "";
    const languageCode = localeToLanguageCode(storeCodeToLocale.get(code)) || inferLanguageFromStoreCode(code) || "en";
    mappings[id] = {
      code,
      language_code: languageCode,
      website_code: websiteCode,
      website_id: websiteId
    };
  }
  return mappings;
}

// web/src/hooks/useSystemConfig.js
var SENSITIVE_PLACEHOLDER = "__SENSITIVE_UNCHANGED__";
var USE_DEFAULT_SENTINEL = "__USE_DEFAULT__";
var DEFAULT_SCOPE = { scope: "default", scopeId: "0" };
var STORE_MAPPINGS_PATH = "general/settings/store_mappings";
function useSystemConfig(props, schema) {
  const fields = useMemo(() => flattenFields(schema), [schema]);
  const allPaths = useMemo(() => fields.map((f) => f.path), [fields]);
  const sensitivePaths = useMemo(
    () => fields.filter((f) => f.sensitive).map((f) => f.path),
    [fields]
  );
  const [scopeTree, setScopeTree] = useState({ websites: [], storeGroups: [], stores: [], loading: true, error: null });
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [serverItems, setServerItems] = useState({});
  const [localValues, setLocalValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const parentWebsiteId = useMemo(() => {
    if (scope.scope !== "stores") return void 0;
    const store = scopeTree.stores.find((s) => String(s.id) === String(scope.scopeId));
    return store == null ? void 0 : store.website_id;
  }, [scope, scopeTree.stores]);
  const fetchScopeTree = useCallback(async () => {
    setScopeTree((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [websitesRes, groupsRes, storesRes, configsRes] = await Promise.all([
        callAction(props, getActionKey("commerceRestGet"), "store/websites"),
        callAction(props, getActionKey("commerceRestGet"), "store/storeGroups"),
        callAction(props, getActionKey("commerceRestGet"), "store/storeViews"),
        callAction(props, getActionKey("commerceRestGet"), "store/storeConfigs").catch(() => null)
      ]);
      const websitesRaw = (websitesRes == null ? void 0 : websitesRes.body) || websitesRes;
      const groupsRaw = (groupsRes == null ? void 0 : groupsRes.body) || groupsRes;
      const storesRaw = (storesRes == null ? void 0 : storesRes.body) || storesRes;
      const configsRaw = (configsRes == null ? void 0 : configsRes.body) || configsRes;
      const websites = Array.isArray(websitesRaw) ? websitesRaw.filter((w) => w.id !== 0 && w.code !== "admin") : [];
      const storeGroups = Array.isArray(groupsRaw) ? groupsRaw.filter((g) => g.id !== 0) : [];
      const stores = Array.isArray(storesRaw) ? storesRaw.filter((s) => s.id !== 0 && s.code !== "admin") : [];
      setScopeTree({ websites, storeGroups, stores, loading: false, error: null });
      const storeMappings = buildStoreMappingsFromCommercePayload(websitesRaw, storesRaw, configsRaw);
      if (Object.keys(storeMappings).length > 0) {
        try {
          await callAction(props, getActionKey("systemConfigSave"), "", {
            values: { [STORE_MAPPINGS_PATH]: JSON.stringify(storeMappings, null, 2) },
            sensitivePaths: [],
            scope: "default",
            scopeId: "0",
            // Flag automatic store-mappings refreshes distinctly so the audit
            // log doesn't blame the operator for system-driven syncs.
            actor: "system:store-mappings-sync"
          });
        } catch (err) {
          console.error("Failed to persist store_mappings to ABDB after loading Commerce stores", err);
        }
      }
    } catch (e) {
      console.error("Failed to load stores from Commerce", e);
      setScopeTree({ websites: [], storeGroups: [], stores: [], loading: false, error: e.message || "Failed to fetch stores" });
    }
  }, [props]);
  useEffect(() => {
    fetchScopeTree();
  }, [fetchScopeTree]);
  const fetchAtScope = useCallback(async () => {
    var _a;
    if (allPaths.length === 0) {
      setServerItems({});
      setLocalValues({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await callAction(
        props,
        getActionKey("systemConfigList"),
        "",
        {
          paths: allPaths,
          sensitivePaths,
          scope: scope.scope,
          scopeId: scope.scopeId,
          parentWebsiteId
        }
      );
      const items = (response == null ? void 0 : response.items) || ((_a = response == null ? void 0 : response.body) == null ? void 0 : _a.items) || {};
      setServerItems(items);
      setLocalValues({});
    } catch (e) {
      console.error("Failed to load system config", e);
      setError(e.message || "Failed to load system config");
    } finally {
      setLoading(false);
    }
  }, [props, allPaths, sensitivePaths, scope, parentWebsiteId]);
  useEffect(() => {
    fetchAtScope();
  }, [fetchAtScope]);
  const getDisplayValue = useCallback((path, fallback) => {
    if (Object.prototype.hasOwnProperty.call(localValues, path)) {
      return localValues[path];
    }
    const item = serverItems[path];
    if (item && item.value !== void 0) return item.value;
    return fallback;
  }, [localValues, serverItems]);
  const getOrigin = useCallback((path) => {
    const item = serverItems[path];
    return (item == null ? void 0 : item.origin) || null;
  }, [serverItems]);
  const isInheritedAtScope = useCallback((path) => {
    if (scope.scope === "default") return false;
    if (Object.prototype.hasOwnProperty.call(localValues, path)) {
      return localValues[path] === USE_DEFAULT_SENTINEL;
    }
    const origin = getOrigin(path);
    if (!origin) return true;
    return !(origin.scope === scope.scope && String(origin.scopeId) === String(scope.scopeId));
  }, [scope, localValues, getOrigin]);
  const setFieldValue = useCallback((path, value) => {
    setLocalValues((prev) => ({ ...prev, [path]: value }));
  }, []);
  const setUseDefault = useCallback((path, useDefault) => {
    setLocalValues((prev) => {
      var _a;
      const next = { ...prev };
      if (useDefault) {
        next[path] = USE_DEFAULT_SENTINEL;
      } else {
        const current = (_a = serverItems[path]) == null ? void 0 : _a.value;
        next[path] = current !== void 0 ? current : "";
      }
      return next;
    });
  }, [serverItems]);
  const dirtyCount = useMemo(() => Object.keys(localValues).length, [localValues]);
  const [serverFieldErrors, setServerFieldErrors] = useState({});
  useEffect(() => {
    if (Object.keys(serverFieldErrors).length === 0) return;
    setServerFieldErrors({});
  }, [Object.keys(localValues).join("|")]);
  const fieldErrors = useMemo(() => {
    const errs = {};
    const byPath = new Map(fields.map((f) => [f.path, f.field]));
    for (const [path, value] of Object.entries(localValues)) {
      const f = byPath.get(path);
      if (!f) continue;
      if (value === USE_DEFAULT_SENTINEL) continue;
      if (value === SENSITIVE_PLACEHOLDER) continue;
      const err = validateFieldValue(f, value);
      if (err) errs[path] = err;
    }
    return errs;
  }, [fields, localValues]);
  const combinedErrors = useMemo(
    () => ({ ...serverFieldErrors, ...fieldErrors }),
    [serverFieldErrors, fieldErrors]
  );
  const hasErrors = Object.keys(combinedErrors).length > 0;
  const computeDiff = useCallback(() => {
    var _a, _b, _c, _d, _e, _f, _g;
    const byPath = new Map(fields.map((f) => [f.path, f]));
    const rows = [];
    const visibleFieldsByPath = new Map(
      fields.filter((f) => isFieldVisibleAtScope(f.field, scope.scope)).map((f) => [f.path, f])
    );
    for (const [path, value] of Object.entries(localValues)) {
      if (!visibleFieldsByPath.has(path)) continue;
      const meta = byPath.get(path);
      const oldServer = serverItems[path];
      let action;
      if (value === USE_DEFAULT_SENTINEL) action = "inherit";
      else if (value === SENSITIVE_PLACEHOLDER) continue;
      else if (oldServer && oldServer.value !== void 0) action = "update";
      else action = "create";
      rows.push({
        path,
        label: ((_a = meta == null ? void 0 : meta.field) == null ? void 0 : _a.label) || ((_b = meta == null ? void 0 : meta.field) == null ? void 0 : _b.id) || path,
        sectionLabel: ((_c = meta == null ? void 0 : meta.section) == null ? void 0 : _c.label) || ((_d = meta == null ? void 0 : meta.section) == null ? void 0 : _d.id),
        groupLabel: ((_e = meta == null ? void 0 : meta.group) == null ? void 0 : _e.label) || ((_f = meta == null ? void 0 : meta.group) == null ? void 0 : _f.id),
        oldValue: (meta == null ? void 0 : meta.sensitive) ? "[encrypted]" : (_g = oldServer == null ? void 0 : oldServer.value) != null ? _g : null,
        newValue: (meta == null ? void 0 : meta.sensitive) ? "[encrypted]" : value,
        action,
        sensitive: !!(meta == null ? void 0 : meta.sensitive)
      });
    }
    return rows;
  }, [fields, localValues, serverItems, scope]);
  const save = useCallback(async () => {
    if (dirtyCount === 0) return true;
    if (hasErrors) {
      setError("Fix validation errors before saving");
      return false;
    }
    setSaving(true);
    setError(null);
    setServerFieldErrors({});
    try {
      const visibleFieldsByPath = new Map(
        fields.filter((f) => isFieldVisibleAtScope(f.field, scope.scope)).map((f) => [f.path, f])
      );
      const payload = {};
      for (const [path, value] of Object.entries(localValues)) {
        if (!visibleFieldsByPath.has(path)) continue;
        payload[path] = value;
      }
      if (Object.keys(payload).length === 0) {
        setSaving(false);
        return true;
      }
      const res = await callAction(
        props,
        getActionKey("systemConfigSave"),
        "",
        {
          values: payload,
          sensitivePaths,
          scope: scope.scope,
          scopeId: scope.scopeId,
          // Per-user audit attribution — resolved from the IMS profile so
          // audit rows show the operator instead of the org id.
          actor: resolveActor(props.ims),
          // Caller-side role hint for RBAC. Server still enforces.
          role: props.userRole || void 0
        }
      );
      const body = (res == null ? void 0 : res.body) || res;
      if (body && body.fieldErrors) {
        setServerFieldErrors(body.fieldErrors);
        setError(body.error || "Server rejected the save");
        return false;
      }
      setSavedAt(Date.now());
      await fetchAtScope();
      return true;
    } catch (e) {
      const resp = e && e.response;
      if (resp && resp.fieldErrors) setServerFieldErrors(resp.fieldErrors);
      else if (resp && resp.body && resp.body.fieldErrors) setServerFieldErrors(resp.body.fieldErrors);
      console.error("Failed to save system config", e);
      setError(e.message || "Failed to save system config");
      return false;
    } finally {
      setSaving(false);
    }
  }, [props, dirtyCount, hasErrors, localValues, sensitivePaths, scope, fields, fetchAtScope]);
  const reset = useCallback(() => {
    setLocalValues({});
  }, []);
  return {
    fields,
    scope,
    setScope,
    scopeTree,
    refreshScopeTree: fetchScopeTree,
    getDisplayValue,
    getOrigin,
    isInheritedAtScope,
    setFieldValue,
    setUseDefault,
    dirtyCount,
    loading,
    saving,
    error,
    savedAt,
    save,
    reset,
    refresh: fetchAtScope,
    fieldErrors: combinedErrors,
    hasErrors,
    computeDiff,
    SENSITIVE_PLACEHOLDER,
    USE_DEFAULT_SENTINEL
  };
}

// web/src/hooks/useSystemConfigSchema.js
import { useCallback as useCallback2, useEffect as useEffect2, useState as useState2 } from "react";
function useSystemConfigSchema(props) {
  const [schema, setSchema] = useState2(emptySchema());
  const [loading, setLoading] = useState2(true);
  const [saving, setSaving] = useState2(false);
  const [error, setError] = useState2(null);
  const fetchSchema = useCallback2(async () => {
    var _a;
    setLoading(true);
    setError(null);
    try {
      const response = await callAction(
        props,
        getActionKey("systemConfigSchema"),
        "get"
      );
      const fetched = (response == null ? void 0 : response.schema) || ((_a = response == null ? void 0 : response.body) == null ? void 0 : _a.schema) || emptySchema();
      setSchema(fetched);
    } catch (e) {
      console.error("Failed to load schema", e);
      setError(e.message || "Failed to load schema");
      setSchema(emptySchema());
    } finally {
      setLoading(false);
    }
  }, [props]);
  useEffect2(() => {
    fetchSchema();
  }, [fetchSchema]);
  const saveSchema = useCallback2(async (nextSchema, { confirmCascade = false } = {}) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    setSaving(true);
    setError(null);
    try {
      let response;
      try {
        response = await callAction(
          props,
          getActionKey("systemConfigSchema"),
          "save",
          {
            schema: nextSchema,
            // Caller role for the server-side admin gate. Server is
            // authoritative — this is just a hint so the rejection is
            // explicit rather than a generic 500.
            role: props.userRole || void 0,
            ...confirmCascade ? { confirmCascade: true } : {}
          }
        );
      } catch (err) {
        const removed = ((_a = err == null ? void 0 : err.response) == null ? void 0 : _a.removedPaths) || ((_c = (_b = err == null ? void 0 : err.response) == null ? void 0 : _b.body) == null ? void 0 : _c.removedPaths);
        if ((err == null ? void 0 : err.status) === 409 && Array.isArray(removed)) {
          return { needsConfirmation: true, removedPaths: removed };
        }
        throw err;
      }
      const saved = (response == null ? void 0 : response.schema) || ((_d = response == null ? void 0 : response.body) == null ? void 0 : _d.schema);
      if (!saved) {
        await fetchSchema();
        setError("Schema save did not return the saved schema. See server logs.");
        return { ok: false };
      }
      setSchema(saved);
      return {
        ok: true,
        removedPaths: (response == null ? void 0 : response.removedPaths) || ((_e = response == null ? void 0 : response.body) == null ? void 0 : _e.removedPaths) || [],
        deletedCount: (_h = (_g = response == null ? void 0 : response.deletedCount) != null ? _g : (_f = response == null ? void 0 : response.body) == null ? void 0 : _f.deletedCount) != null ? _h : 0
      };
    } catch (e) {
      console.error("Failed to save schema", e);
      setError(e.message || "Failed to save schema");
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [props, fetchSchema]);
  return {
    schema,
    setSchema,
    saveSchema,
    refresh: fetchSchema,
    loading,
    saving,
    error
  };
}

// web/src/hooks/useConfirm.js
import React, { useCallback as useCallback3, useEffect as useEffect3, useRef, useState as useState3 } from "react";
import ReactDOM from "react-dom";

// web/src/theme.js
var THEME = {
  color: {
    bg: "var(--sm-color-bg)",
    surface: "var(--sm-color-surface)",
    surfaceMuted: "var(--sm-color-surface-muted)",
    surfaceSubtle: "var(--sm-color-surface-subtle)",
    border: "var(--sm-color-border)",
    borderStrong: "var(--sm-color-border-strong)",
    text: "var(--sm-color-text)",
    textMuted: "var(--sm-color-text-muted)",
    textStrong: "var(--sm-color-text-strong)",
    textSoft: "var(--sm-color-text-soft)",
    textInverse: "var(--sm-color-text-inverse)",
    surfacePanel: "var(--sm-color-surface-panel)",
    accent: "var(--sm-color-accent)",
    accentHover: "var(--sm-color-accent-hover)",
    accentSoft: "var(--sm-color-accent-soft)",
    accentTint: "var(--sm-color-accent-tint)",
    success: "var(--sm-color-success)",
    successHover: "var(--sm-color-success-hover)",
    successSoft: "var(--sm-color-success-soft)",
    warning: "var(--sm-color-warning)",
    warningHover: "var(--sm-color-warning-hover)",
    warningSoft: "var(--sm-color-warning-soft)",
    warningBorder: "var(--sm-color-warning-border)",
    warningText: "var(--sm-color-warning-text)",
    warningTint: "var(--sm-color-warning-tint)",
    danger: "var(--sm-color-danger)",
    dangerHover: "var(--sm-color-danger-hover)",
    dangerSoft: "var(--sm-color-danger-soft)",
    dangerTint: "var(--sm-color-danger-tint)",
    neutralSoft: "var(--sm-color-neutral-soft)",
    neutralText: "var(--sm-color-neutral-text)",
    overlay: "var(--sm-color-overlay)"
  },
  radius: {
    sm: "var(--sm-radius-sm)",
    md: "var(--sm-radius-md)",
    lg: "var(--sm-radius-lg)",
    xl: "var(--sm-radius-xl)",
    xxl: "var(--sm-radius-2xl)",
    pill: "var(--sm-radius-pill)"
  },
  space: {
    1: "var(--sm-space-1)",
    2: "var(--sm-space-2)",
    3: "var(--sm-space-3)",
    4: "var(--sm-space-4)",
    5: "var(--sm-space-5)",
    6: "var(--sm-space-6)"
  },
  shadow: {
    xs: "var(--sm-shadow-xs)",
    sm: "var(--sm-shadow-sm)",
    md: "var(--sm-shadow-md)",
    pill: "var(--sm-shadow-pill)",
    floating: "var(--sm-shadow-floating)",
    dropdown: "var(--sm-shadow-dropdown)",
    modal: "var(--sm-shadow-modal)",
    inset: "var(--sm-shadow-inset)"
  },
  font: {
    family: "var(--sm-font-family)",
    mono: "var(--sm-font-mono)",
    sizeXs: "var(--sm-font-size-xs)",
    sizeSm: "var(--sm-font-size-sm)",
    sizeMd: "var(--sm-font-size-md)",
    sizeLg: "var(--sm-font-size-lg)",
    weightRegular: "var(--sm-font-weight-regular)",
    weightMedium: "var(--sm-font-weight-medium)",
    weightSemi: "var(--sm-font-weight-semibold)",
    weightBold: "var(--sm-font-weight-bold)"
  }
};
var PALETTE = { ...THEME.color };
var RADIUS = { ...THEME.radius };
var SHADOW = { ...THEME.shadow };
var SPACE = { ...THEME.space };
var FONT = { ...THEME.font };

// web/src/hooks/useConfirm.js
import { jsx, jsxs } from "react/jsx-runtime";
function useConfirm() {
  const [state, setState] = useState3(null);
  const resolverRef = useRef(null);
  const confirm = useCallback3((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ options: opts });
    });
  }, []);
  const finish = useCallback3((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (resolve) resolve(result);
  }, []);
  useEffect3(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish(state.options && state.options.choices ? null : false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, finish]);
  useEffect3(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);
  const dialog = state ? ReactDOM.createPortal(
    /* @__PURE__ */ jsx(
      ConfirmModal,
      {
        options: state.options,
        onConfirm: () => finish(true),
        onCancel: () => finish(state.options && state.options.choices ? null : false),
        onChoose: (value) => finish(value)
      }
    ),
    document.body
  ) : null;
  return { confirm, dialog };
}
var VARIANT_STYLES = {
  destructive: { color: PALETTE.danger, primaryBg: PALETTE.danger, primaryBgHover: PALETTE.dangerHover, tint: PALETTE.dangerTint, icon: "\u26A0" },
  warning: { color: PALETTE.warning, primaryBg: PALETTE.warning, primaryBgHover: PALETTE.warningHover, tint: PALETTE.warningTint, icon: "!" },
  information: { color: PALETTE.accent, primaryBg: PALETTE.accent, primaryBgHover: PALETTE.accentHover, tint: PALETTE.accentTint, icon: "i" },
  confirmation: { color: PALETTE.accent, primaryBg: PALETTE.accent, primaryBgHover: PALETTE.accentHover, tint: PALETTE.accentTint, icon: "?" }
};
function ConfirmModal({ options, onConfirm, onCancel, onChoose }) {
  const variant = options.variant || "confirmation";
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.confirmation;
  const confirmRef = useRef(null);
  const hasChoices = Array.isArray(options.choices) && options.choices.length > 0;
  useEffect3(() => {
    if (confirmRef.current) confirmRef.current.focus();
  }, []);
  const renderBody = (body) => {
    if (body == null) return null;
    if (typeof body !== "string") return body;
    return body.split("\n").map((line, i) => /* @__PURE__ */ jsxs(React.Fragment, { children: [
      line,
      i < body.split("\n").length - 1 && /* @__PURE__ */ jsx("br", {})
    ] }, i));
  };
  const SPECTRUM_FONT = "adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, 'Trebuchet MS', 'Lucida Grande', sans-serif";
  return /* @__PURE__ */ jsx(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "confirm-title",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 1e5,
        background: PALETTE.overlay,
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: SPECTRUM_FONT,
        animation: "sm-fade-in 120ms ease-out"
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) onCancel();
      },
      children: /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            background: PALETTE.surface,
            borderRadius: RADIUS.xl,
            boxShadow: SHADOW.modal,
            width: "100%",
            maxWidth: 520,
            maxHeight: "calc(100vh - 32px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "sm-pop-in 160ms cubic-bezier(0.16, 1, 0.3, 1)"
          },
          children: [
            /* @__PURE__ */ jsxs(
              "div",
              {
                style: {
                  padding: "20px 24px 12px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14
                },
                children: [
                  /* @__PURE__ */ jsx(
                    "div",
                    {
                      "aria-hidden": "true",
                      style: {
                        flex: "0 0 auto",
                        width: 36,
                        height: 36,
                        borderRadius: RADIUS.pill,
                        background: styles.tint,
                        color: styles.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 700,
                        lineHeight: 1,
                        fontFamily: SPECTRUM_FONT
                      },
                      children: styles.icon
                    }
                  ),
                  /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
                    /* @__PURE__ */ jsx(
                      "div",
                      {
                        id: "confirm-title",
                        style: {
                          fontFamily: SPECTRUM_FONT,
                          fontSize: 17,
                          fontWeight: 700,
                          lineHeight: 1.3,
                          letterSpacing: "-0.005em",
                          color: PALETTE.textStrong
                        },
                        children: options.title || "Are you sure?"
                      }
                    ),
                    options.body != null && /* @__PURE__ */ jsx(
                      "div",
                      {
                        style: {
                          marginTop: 6,
                          fontFamily: SPECTRUM_FONT,
                          color: PALETTE.textSoft,
                          fontSize: 13,
                          lineHeight: 1.55,
                          maxHeight: "40vh",
                          overflowY: "auto"
                        },
                        children: renderBody(options.body)
                      }
                    )
                  ] })
                ]
              }
            ),
            hasChoices ? /* @__PURE__ */ jsxs(
              "div",
              {
                style: {
                  padding: "4px 16px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                },
                children: [
                  options.choices.map((c, i) => {
                    var _a;
                    const cStyles = VARIANT_STYLES[c.variant] || VARIANT_STYLES.confirmation;
                    const isPrimary = i === 0;
                    return /* @__PURE__ */ jsxs(
                      "button",
                      {
                        type: "button",
                        ref: isPrimary ? confirmRef : null,
                        onClick: () => onChoose(c.value),
                        style: {
                          textAlign: "left",
                          padding: "10px 14px",
                          borderRadius: RADIUS.lg,
                          border: isPrimary ? `1px solid ${cStyles.primaryBg}` : `1px solid ${PALETTE.borderStrong}`,
                          background: isPrimary ? cStyles.primaryBg : PALETTE.surface,
                          color: isPrimary ? PALETTE.textInverse : PALETTE.textStrong,
                          fontFamily: SPECTRUM_FONT,
                          fontSize: 14,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          cursor: "pointer",
                          transition: "background 120ms ease, border-color 120ms ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2
                        },
                        onMouseOver: (e) => {
                          e.currentTarget.style.background = isPrimary ? cStyles.primaryBgHover : PALETTE.surfaceMuted;
                          if (isPrimary) e.currentTarget.style.borderColor = cStyles.primaryBgHover;
                        },
                        onMouseOut: (e) => {
                          e.currentTarget.style.background = isPrimary ? cStyles.primaryBg : PALETTE.surface;
                          if (isPrimary) e.currentTarget.style.borderColor = cStyles.primaryBg;
                        },
                        children: [
                          /* @__PURE__ */ jsx("span", { children: c.label }),
                          c.description && /* @__PURE__ */ jsx(
                            "span",
                            {
                              style: {
                                fontSize: 12,
                                fontWeight: 400,
                                opacity: isPrimary ? 0.9 : 0.7
                              },
                              children: c.description
                            }
                          )
                        ]
                      },
                      (_a = c.value) != null ? _a : i
                    );
                  }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: onCancel,
                      style: {
                        marginTop: 4,
                        padding: "8px 14px",
                        borderRadius: RADIUS.lg,
                        border: "1px solid transparent",
                        background: "transparent",
                        color: PALETTE.textMuted,
                        fontFamily: SPECTRUM_FONT,
                        fontSize: 13,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        cursor: "pointer"
                      },
                      onMouseOver: (e) => {
                        e.currentTarget.style.background = PALETTE.surfaceMuted;
                      },
                      onMouseOut: (e) => {
                        e.currentTarget.style.background = "transparent";
                      },
                      children: options.cancelLabel || "Cancel"
                    }
                  )
                ]
              }
            ) : /* @__PURE__ */ jsxs(
              "div",
              {
                style: {
                  padding: "12px 16px",
                  background: PALETTE.surfacePanel,
                  borderTop: `1px solid ${PALETTE.border}`,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10
                },
                children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: onCancel,
                      style: {
                        padding: "8px 16px",
                        minHeight: 36,
                        borderRadius: RADIUS.md,
                        border: `1px solid ${PALETTE.borderStrong}`,
                        background: PALETTE.surface,
                        color: PALETTE.textStrong,
                        fontFamily: SPECTRUM_FONT,
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        cursor: "pointer",
                        transition: "background 120ms ease"
                      },
                      onMouseOver: (e) => {
                        e.currentTarget.style.background = PALETTE.surfaceMuted;
                      },
                      onMouseOut: (e) => {
                        e.currentTarget.style.background = PALETTE.surface;
                      },
                      children: options.cancelLabel || "Cancel"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      ref: confirmRef,
                      onClick: onConfirm,
                      style: {
                        padding: "8px 16px",
                        minHeight: 36,
                        borderRadius: RADIUS.md,
                        border: `1px solid ${styles.primaryBg}`,
                        background: styles.primaryBg,
                        color: PALETTE.textInverse,
                        fontFamily: SPECTRUM_FONT,
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        cursor: "pointer",
                        transition: "background 120ms ease"
                      },
                      onMouseOver: (e) => {
                        e.currentTarget.style.background = styles.primaryBgHover;
                        e.currentTarget.style.borderColor = styles.primaryBgHover;
                      },
                      onMouseOut: (e) => {
                        e.currentTarget.style.background = styles.primaryBg;
                        e.currentTarget.style.borderColor = styles.primaryBg;
                      },
                      children: options.confirmLabel || "Confirm"
                    }
                  )
                ]
              }
            )
          ]
        }
      )
    }
  );
}

// web/src/components/SystemConfigSchemaEditor.js
import { useEffect as useEffect4, useMemo as useMemo2, useState as useState4 } from "react";
import {
  View,
  Flex,
  Heading,
  Text,
  Button,
  ActionButton,
  TextField,
  Picker,
  Item,
  Switch,
  Checkbox,
  Divider,
  Well,
  ProgressCircle
} from "@adobe/react-spectrum";

// web/src/schema/validation-presets.js
var PRESETS = [
  {
    id: "free-text",
    label: "Free text (no validation)",
    description: "Accepts any value.",
    types: ["text", "textarea", "password"],
    apply: () => ({})
  },
  {
    id: "required",
    label: "Required (not empty)",
    description: "Must have a value, no further constraint.",
    types: ["text", "textarea", "password", "number", "select", "boolean"],
    apply: () => ({ required: true })
  },
  {
    id: "email",
    label: "Email",
    description: "RFC-5322 lite \u2014 same shape as Magento validate-email.",
    types: ["text"],
    apply: () => ({
      pattern: "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$",
      patternMessage: "Enter a valid email address"
    })
  },
  {
    id: "url",
    label: "URL (http or https)",
    description: "validate-url \u2014 must start with http(s)://",
    types: ["text", "textarea"],
    apply: () => ({
      pattern: "^https?://[^\\s]+$",
      patternMessage: "Enter a valid URL starting with http:// or https://"
    })
  },
  {
    id: "secure-url",
    label: "Secure URL (https only)",
    description: "validate-secure-url \u2014 must start with https://",
    types: ["text", "textarea"],
    apply: () => ({
      pattern: "^https://[^\\s]+$",
      patternMessage: "Enter a valid URL starting with https://"
    })
  },
  {
    id: "integer",
    label: "Integer",
    description: "validate-integer \u2014 whole number, can be negative.",
    types: ["text", "number"],
    apply: () => ({
      pattern: "^-?\\d+$",
      patternMessage: "Enter a whole number"
    })
  },
  {
    id: "positive-integer",
    label: "Positive integer (\u2265 1)",
    description: "validate-greater-than-zero.",
    types: ["text", "number"],
    apply: (field) => (field == null ? void 0 : field.type) === "number" ? { min: 1, pattern: "^\\d+$", patternMessage: "Enter a whole number \u2265 1" } : { pattern: "^[1-9]\\d*$", patternMessage: "Enter a whole number \u2265 1" }
  },
  {
    id: "non-negative-integer",
    label: "Non-negative integer (\u2265 0)",
    description: "validate-zero-or-greater.",
    types: ["text", "number"],
    apply: (field) => (field == null ? void 0 : field.type) === "number" ? { min: 0, pattern: "^\\d+$", patternMessage: "Enter a whole number \u2265 0" } : { pattern: "^\\d+$", patternMessage: "Enter a whole number \u2265 0" }
  },
  {
    id: "decimal",
    label: "Decimal number",
    description: "validate-number \u2014 accepts decimals like 1.23 or -0.5.",
    types: ["text", "number"],
    apply: () => ({
      pattern: "^-?\\d+(\\.\\d+)?$",
      patternMessage: "Enter a number"
    })
  },
  {
    id: "alphanumeric",
    label: "Alphanumeric",
    description: "validate-alphanum \u2014 letters and digits only.",
    types: ["text"],
    apply: () => ({
      pattern: "^[a-zA-Z0-9]+$",
      patternMessage: "Letters and digits only"
    })
  },
  {
    id: "alphanumeric-with-spaces",
    label: "Alphanumeric + spaces",
    description: "Letters, digits and spaces.",
    types: ["text"],
    apply: () => ({
      pattern: "^[a-zA-Z0-9 ]+$",
      patternMessage: "Letters, digits and spaces only"
    })
  },
  {
    id: "alpha",
    label: "Letters only",
    description: "validate-alpha \u2014 letters only.",
    types: ["text"],
    apply: () => ({
      pattern: "^[a-zA-Z]+$",
      patternMessage: "Letters only"
    })
  },
  {
    id: "slug",
    label: "Slug / handle",
    description: "Lower-case letters, digits and hyphens (URL-safe).",
    types: ["text"],
    apply: () => ({
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      patternMessage: "Lower-case letters, digits and hyphens (no spaces)"
    })
  },
  {
    id: "phone",
    label: "Phone number",
    description: "validate-phoneStrict \u2014 digits, spaces, hyphens, parens, leading +",
    types: ["text"],
    apply: () => ({
      pattern: "^\\+?[0-9 ()\\-]{6,20}$",
      patternMessage: "Enter a valid phone number"
    })
  },
  {
    id: "hex-color",
    label: "Hex color",
    description: "validate-color \u2014 e.g. #1473e6 or #fff.",
    types: ["text"],
    apply: () => ({
      pattern: "^#(?:[0-9a-fA-F]{3}){1,2}$",
      patternMessage: "Enter a valid hex color (e.g. #1473e6)"
    })
  },
  {
    id: "ipv4",
    label: "IPv4 address",
    description: "validate-ip \u2014 e.g. 192.168.1.1",
    types: ["text"],
    apply: () => ({
      pattern: "^((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$",
      patternMessage: "Enter a valid IPv4 address"
    })
  },
  {
    id: "hostname",
    label: "Hostname",
    description: "DNS-style hostname (e.g. shop.example.com).",
    types: ["text"],
    apply: () => ({
      pattern: "^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$",
      patternMessage: "Enter a valid hostname"
    })
  },
  {
    id: "json",
    label: "JSON",
    description: "validate-json \u2014 must parse as JSON. Pattern is best-effort; full check runs at save.",
    types: ["textarea", "text"],
    apply: () => ({
      // Pattern can only guess; the parser does the real check via `format: 'json'`.
      pattern: "^[\\s\\S]*$",
      patternMessage: "Must be valid JSON",
      format: "json"
    })
  },
  {
    id: "date-iso",
    label: "Date (YYYY-MM-DD)",
    description: "validate-date \u2014 ISO-style calendar date.",
    types: ["text"],
    apply: () => ({
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      patternMessage: "Enter a date as YYYY-MM-DD"
    })
  },
  {
    id: "no-html",
    label: "No HTML tags",
    description: "validate-no-html-tags \u2014 refuses any < or >.",
    types: ["text", "textarea"],
    apply: () => ({
      pattern: "^[^<>]*$",
      patternMessage: "HTML tags are not allowed"
    })
  }
];
var PRESETS_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));
function presetsForType(type) {
  if (!type) return PRESETS;
  return PRESETS.filter((p) => !p.types || p.types.includes(type));
}
function applyPreset(presetId, field) {
  const p = PRESETS_BY_ID.get(presetId);
  if (!p) return (field == null ? void 0 : field.validation) || {};
  const patch = p.apply(field) || {};
  return { ...(field == null ? void 0 : field.validation) || {}, ...patch, preset: presetId };
}

// web/src/components/SystemConfigSchemaEditor.js
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
var _uidSeq = 0;
function uid() {
  _uidSeq += 1;
  return `u${Date.now().toString(36)}_${_uidSeq}`;
}
function blankField(siblings = []) {
  return {
    _uid: uid(),
    id: "",
    label: "",
    type: "text",
    default: "",
    showIn: ["default"],
    sensitive: false,
    options: [],
    sortOrder: nextSortOrder(siblings)
  };
}
function blankGroup(siblings = []) {
  return { _uid: uid(), id: "", label: "", fields: [], sortOrder: nextSortOrder(siblings) };
}
function blankSection(siblings = []) {
  return { _uid: uid(), id: "", label: "", groups: [], sortOrder: nextSortOrder(siblings) };
}
function ensureUids(schema) {
  for (const s of (schema == null ? void 0 : schema.sections) || []) {
    if (!s._uid) s._uid = uid();
    for (const g of s.groups || []) {
      if (!g._uid) g._uid = uid();
      for (const f of g.fields || []) {
        if (!f._uid) f._uid = uid();
      }
    }
  }
  return schema;
}
function stripUids(schema) {
  const clean = JSON.parse(JSON.stringify(schema || {}));
  for (const s of clean.sections || []) {
    delete s._uid;
    for (const g of s.groups || []) {
      delete g._uid;
      for (const f of g.fields || []) delete f._uid;
    }
  }
  return clean;
}
function useDnd(items, onReorder) {
  const [draggingIndex, setDraggingIndex] = useState4(null);
  const [hoverIndex, setHoverIndex] = useState4(null);
  const handlers = (idx) => ({
    draggable: true,
    onDragStart: (e) => {
      setDraggingIndex(idx);
      try {
        e.dataTransfer.effectAllowed = "move";
      } catch (_) {
      }
      try {
        e.dataTransfer.setData("text/plain", String(idx));
      } catch (_) {
      }
    },
    onDragOver: (e) => {
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "move";
      } catch (_) {
      }
      if (hoverIndex !== idx) setHoverIndex(idx);
    },
    onDragLeave: () => {
      if (hoverIndex === idx) setHoverIndex(null);
    },
    onDrop: (e) => {
      e.preventDefault();
      const from = draggingIndex;
      const to = idx;
      setDraggingIndex(null);
      setHoverIndex(null);
      if (from == null || from === to) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(renumberSortOrder(next));
    },
    onDragEnd: () => {
      setDraggingIndex(null);
      setHoverIndex(null);
    }
  });
  return { draggingIndex, hoverIndex, handlers };
}
function DragHandle({ active }) {
  return /* @__PURE__ */ jsx2(
    "span",
    {
      title: "Drag to reorder",
      style: {
        cursor: "grab",
        userSelect: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 4,
        color: active ? PALETTE.accent : PALETTE.textMuted,
        fontSize: 16,
        lineHeight: 1
      },
      children: "\u22EE\u22EE"
    }
  );
}
function cloneSchema(schema) {
  return ensureUids(JSON.parse(JSON.stringify(schema || emptySchema())));
}
function validateLocal(schema) {
  var _a, _b, _c;
  if (!Array.isArray(schema.sections)) return "sections must be an array";
  const seenSection = /* @__PURE__ */ new Set();
  for (const s of schema.sections) {
    if (!ID_RE.test(s.id || "")) return `Section id "${s.id}" is invalid (start with letter, [a-zA-Z0-9_])`;
    if (seenSection.has(s.id)) return `Duplicate section id "${s.id}"`;
    seenSection.add(s.id);
    if (!((_a = s.label) == null ? void 0 : _a.trim())) return `Section ${s.id}: label required`;
    const seenGroup = /* @__PURE__ */ new Set();
    for (const g of s.groups || []) {
      if (!ID_RE.test(g.id || "")) return `${s.id}: group id "${g.id}" is invalid`;
      if (seenGroup.has(g.id)) return `${s.id}: duplicate group id "${g.id}"`;
      seenGroup.add(g.id);
      if (!((_b = g.label) == null ? void 0 : _b.trim())) return `${s.id}.${g.id}: label required`;
      const seenField = /* @__PURE__ */ new Set();
      for (const f of g.fields || []) {
        if (!ID_RE.test(f.id || "")) return `${s.id}.${g.id}: field id "${f.id}" is invalid`;
        if (seenField.has(f.id)) return `${s.id}.${g.id}: duplicate field id "${f.id}"`;
        seenField.add(f.id);
        if (!((_c = f.label) == null ? void 0 : _c.trim())) return `${s.id}.${g.id}.${f.id}: label required`;
        if (!FIELD_TYPES.includes(f.type)) return `${s.id}.${g.id}.${f.id}: unknown type "${f.type}"`;
        if (!Array.isArray(f.showIn) || f.showIn.length === 0) {
          return `${s.id}.${g.id}.${f.id}: pick at least one scope in showIn`;
        }
        if (f.type === "select" && (!Array.isArray(f.options) || f.options.length === 0)) {
          return `${s.id}.${g.id}.${f.id}: select fields need at least one option`;
        }
      }
    }
  }
  return null;
}
function FieldEditor({ field, onChange, onRemove, dragging }) {
  var _a;
  const update = (patch) => onChange({ ...field, ...patch });
  const addOption = () => {
    update({ options: [...field.options || [], { value: "", label: "" }] });
  };
  const updateOption = (i, patch) => {
    const next = [...field.options || []];
    next[i] = { ...next[i], ...patch };
    update({ options: next });
  };
  const removeOption = (i) => {
    const next = [...field.options || []];
    next.splice(i, 1);
    update({ options: next });
  };
  return /* @__PURE__ */ jsxs2("div", { style: {
    background: PALETTE.surfaceSubtle,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 10
  }, children: [
    /* @__PURE__ */ jsxs2(Flex, { gap: "size-150", wrap: true, alignItems: "end", children: [
      /* @__PURE__ */ jsx2(DragHandle, { active: dragging }),
      /* @__PURE__ */ jsx2(TextField, { label: "Field ID", value: field.id, onChange: (v) => update({ id: v }), width: "size-2400" }),
      /* @__PURE__ */ jsx2(TextField, { label: "Label", value: field.label, onChange: (v) => update({ label: v }), width: "size-3000" }),
      /* @__PURE__ */ jsx2(
        Picker,
        {
          label: "Type",
          selectedKey: field.type,
          onSelectionChange: (k) => {
            const v = field.validation || {};
            const currentPreset = v.preset && PRESETS_BY_ID.get(v.preset);
            const stillApplies = currentPreset && (!currentPreset.types || currentPreset.types.includes(k));
            const nextValidation = stillApplies ? v : v.required ? { required: true } : void 0;
            update({ type: k, validation: nextValidation });
          },
          width: "size-2000",
          children: FIELD_TYPES.map((t) => /* @__PURE__ */ jsx2(Item, { children: t }, t))
        }
      ),
      /* @__PURE__ */ jsx2(
        TextField,
        {
          label: "Default",
          value: field.default == null ? "" : String(field.default),
          onChange: (v) => update({ default: v }),
          width: "size-2400"
        }
      ),
      /* @__PURE__ */ jsx2(
        TextField,
        {
          label: "Sort order",
          value: String((_a = field.sortOrder) != null ? _a : 0),
          onChange: (v) => update({ sortOrder: Number(v) || 0 }),
          width: "size-1200",
          type: "number"
        }
      ),
      /* @__PURE__ */ jsx2(ActionButton, { onPress: onRemove, children: "Remove field" })
    ] }),
    /* @__PURE__ */ jsxs2(Flex, { gap: "size-200", marginTop: "size-150", wrap: true, alignItems: "center", children: [
      /* @__PURE__ */ jsx2(Text, { children: "Visible in:" }),
      SCOPES.map((scope) => /* @__PURE__ */ jsx2(
        Checkbox,
        {
          isSelected: (field.showIn || []).includes(scope),
          onChange: (checked) => {
            const set = new Set(field.showIn || []);
            if (checked) set.add(scope);
            else set.delete(scope);
            update({ showIn: Array.from(set) });
          },
          children: scope
        },
        scope
      )),
      /* @__PURE__ */ jsx2(Switch, { isSelected: !!field.sensitive, onChange: (v) => update({ sensitive: v }), children: "Sensitive (encrypt at rest)" }),
      /* @__PURE__ */ jsxs2(
        Picker,
        {
          label: "Min role",
          selectedKey: field.requiredRole || "none",
          onSelectionChange: (k) => update({ requiredRole: k === "none" ? void 0 : k }),
          width: "size-1700",
          children: [
            /* @__PURE__ */ jsx2(Item, { children: "(anyone)" }, "none"),
            /* @__PURE__ */ jsx2(Item, { children: "viewer" }, "viewer"),
            /* @__PURE__ */ jsx2(Item, { children: "editor" }, "editor"),
            /* @__PURE__ */ jsx2(Item, { children: "admin" }, "admin")
          ]
        }
      )
    ] }),
    field.type === "select" && /* @__PURE__ */ jsxs2(View, { marginTop: "size-200", children: [
      /* @__PURE__ */ jsx2(
        Text,
        {
          UNSAFE_style: {
            display: "block",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: PALETTE.textMuted,
            marginBottom: 8
          },
          children: "Options"
        }
      ),
      (field.options || []).map((opt, i) => /* @__PURE__ */ jsxs2(Flex, { gap: "size-100", marginBottom: "size-100", alignItems: "end", children: [
        /* @__PURE__ */ jsx2(TextField, { label: "Value", value: opt.value, onChange: (v) => updateOption(i, { value: v }), width: "size-2400" }),
        /* @__PURE__ */ jsx2(TextField, { label: "Label", value: opt.label, onChange: (v) => updateOption(i, { label: v }), width: "size-3000" }),
        /* @__PURE__ */ jsx2(ActionButton, { onPress: () => removeOption(i), children: "Remove" })
      ] }, i)),
      /* @__PURE__ */ jsx2(Button, { variant: "secondary", onPress: addOption, children: "+ Add option" })
    ] }),
    /* @__PURE__ */ jsx2(ValidationEditor, { field, onChange })
  ] });
}
function ValidationEditor({ field, onChange }) {
  const v = field.validation || {};
  const setV = (patch) => {
    const next = { ...v, ...patch };
    for (const k of Object.keys(next)) {
      const val = next[k];
      if (val == null || val === "" || Array.isArray(val) && val.length === 0) delete next[k];
    }
    const update = Object.keys(next).length ? { validation: next } : { validation: void 0 };
    onChange({ ...field, ...update });
  };
  const isNumber = field.type === "number";
  const isString = field.type === "text" || field.type === "textarea" || field.type === "password";
  return /* @__PURE__ */ jsxs2(
    View,
    {
      marginTop: "size-150",
      paddingX: "size-150",
      paddingY: "size-100",
      UNSAFE_style: {
        borderTop: `1px dashed ${PALETTE.border}`
      },
      children: [
        /* @__PURE__ */ jsx2(Text, { UNSAFE_style: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: PALETTE.textMuted }, children: "Validation" }),
        /* @__PURE__ */ jsxs2(Flex, { gap: "size-150", wrap: true, alignItems: "end", marginTop: "size-100", children: [
          /* @__PURE__ */ jsx2(
            Picker,
            {
              label: "Preset",
              selectedKey: v.preset || "free-text",
              onSelectionChange: (id) => {
                const next = applyPreset(id, field);
                if (id === "free-text") {
                  const kept = v.required ? { required: true } : {};
                  onChange({ ...field, validation: Object.keys(kept).length ? kept : void 0 });
                  return;
                }
                onChange({ ...field, validation: next });
              },
              width: "size-3000",
              children: presetsForType(field.type).map((p) => /* @__PURE__ */ jsx2(Item, { children: p.label }, p.id))
            }
          ),
          /* @__PURE__ */ jsx2(Switch, { isSelected: !!v.required, onChange: (b) => setV({ required: b || void 0 }), children: "Required" }),
          isNumber && /* @__PURE__ */ jsxs2(Fragment, { children: [
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Min",
                value: v.min == null ? "" : String(v.min),
                onChange: (s) => setV({ min: s === "" ? void 0 : Number(s) }),
                width: "size-1200",
                type: "number"
              }
            ),
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Max",
                value: v.max == null ? "" : String(v.max),
                onChange: (s) => setV({ max: s === "" ? void 0 : Number(s) }),
                width: "size-1200",
                type: "number"
              }
            )
          ] }),
          isString && /* @__PURE__ */ jsxs2(Fragment, { children: [
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Min length",
                value: v.minLength == null ? "" : String(v.minLength),
                onChange: (s) => setV({ minLength: s === "" ? void 0 : Number(s) }),
                width: "size-1600",
                type: "number"
              }
            ),
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Max length",
                value: v.maxLength == null ? "" : String(v.maxLength),
                onChange: (s) => setV({ maxLength: s === "" ? void 0 : Number(s) }),
                width: "size-1600",
                type: "number"
              }
            ),
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Pattern (regex)",
                value: v.pattern || "",
                onChange: (s) => setV({ pattern: s || void 0 }),
                width: "size-3000",
                placeholder: "^https://"
              }
            ),
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Pattern message",
                value: v.patternMessage || "",
                onChange: (s) => setV({ patternMessage: s || void 0 }),
                width: "size-3000",
                placeholder: "Must start with https://"
              }
            )
          ] }),
          /* @__PURE__ */ jsx2(
            TextField,
            {
              label: field.type === "select" ? "Enum (overrides options)" : "Enum",
              value: Array.isArray(v.enum) ? v.enum.join(", ") : "",
              onChange: (s) => {
                const parts = (s || "").split(",").map((x) => x.trim()).filter(Boolean);
                setV({ enum: parts.length ? parts : void 0 });
              },
              width: "size-3000",
              placeholder: "value1, value2"
            }
          )
        ] })
      ]
    }
  );
}
function GroupList({ groups, onReorder, onUpdate, onRemove }) {
  const dnd = useDnd(groups, onReorder);
  return /* @__PURE__ */ jsx2(Fragment, { children: groups.map((g, gi) => {
    const dragging = dnd.draggingIndex === gi;
    const hover = dnd.hoverIndex === gi && !dragging;
    return /* @__PURE__ */ jsx2(
      "div",
      {
        ...dnd.handlers(gi),
        style: {
          opacity: dragging ? 0.4 : 1,
          borderTop: hover ? `3px solid ${PALETTE.accent}` : "3px solid transparent",
          transition: "border-color 100ms ease, opacity 100ms ease"
        },
        children: /* @__PURE__ */ jsx2(
          GroupEditor,
          {
            group: g,
            dragging,
            onChange: (next) => onUpdate(gi, next),
            onRemove: () => onRemove(gi)
          }
        )
      },
      g._uid || gi
    );
  }) });
}
function GroupEditor({ group, onChange, onRemove, dragging }) {
  var _a;
  const update = (patch) => onChange({ ...group, ...patch });
  const fieldsSorted = sortByOrder(group.fields || []);
  const addField = () => {
    const siblings = group.fields || [];
    update({ fields: [...siblings, blankField(siblings)] });
  };
  const updateField = (i, next) => {
    const original = group.fields || [];
    const target = fieldsSorted[i];
    const idx = original.findIndex((f) => f === target);
    if (idx === -1) return;
    const fields = [...original];
    fields[idx] = next;
    update({ fields });
  };
  const removeField = (i) => {
    const original = group.fields || [];
    const target = fieldsSorted[i];
    const idx = original.findIndex((f) => f === target);
    if (idx === -1) return;
    const fields = [...original];
    fields.splice(idx, 1);
    update({ fields });
  };
  const reorderFields = (newArr) => update({ fields: newArr });
  const fieldDnd = useDnd(fieldsSorted, reorderFields);
  return /* @__PURE__ */ jsxs2("div", { style: {
    background: PALETTE.surface,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.xs,
    padding: 20,
    marginBottom: 16
  }, children: [
    /* @__PURE__ */ jsxs2(Flex, { gap: "size-200", alignItems: "end", marginBottom: "size-150", wrap: true, children: [
      /* @__PURE__ */ jsx2(DragHandle, { active: dragging }),
      /* @__PURE__ */ jsx2(TextField, { label: "Group ID", value: group.id, onChange: (v) => update({ id: v }), width: "size-2400" }),
      /* @__PURE__ */ jsx2(TextField, { label: "Group Label", value: group.label, onChange: (v) => update({ label: v }), width: "size-3600" }),
      /* @__PURE__ */ jsx2(
        TextField,
        {
          label: "Sort order",
          value: String((_a = group.sortOrder) != null ? _a : 0),
          onChange: (v) => update({ sortOrder: Number(v) || 0 }),
          width: "size-1200",
          type: "number"
        }
      ),
      /* @__PURE__ */ jsx2(ActionButton, { onPress: onRemove, children: "Remove group" })
    ] }),
    /* @__PURE__ */ jsx2(Divider, { size: "S", marginBottom: "size-150" }),
    fieldsSorted.map((f, i) => {
      const fDragging = fieldDnd.draggingIndex === i;
      const fHover = fieldDnd.hoverIndex === i && !fDragging;
      return /* @__PURE__ */ jsx2(
        "div",
        {
          ...fieldDnd.handlers(i),
          style: {
            opacity: fDragging ? 0.4 : 1,
            borderTop: fHover ? `2px solid ${PALETTE.accent}` : "2px solid transparent"
          },
          children: /* @__PURE__ */ jsx2(
            FieldEditor,
            {
              field: f,
              dragging: fDragging,
              onChange: (next) => updateField(i, next),
              onRemove: () => removeField(i)
            }
          )
        },
        f._uid || i
      );
    }),
    /* @__PURE__ */ jsx2(Button, { variant: "secondary", onPress: addField, children: "+ Add field" })
  ] });
}
function SystemConfigSchemaEditor({ schema, onSave, onCancel, saving, error, palette }) {
  var _a;
  const [draft, setDraft] = useState4(() => cloneSchema(schema));
  const [activeSectionIdx, setActiveSectionIdx] = useState4(0);
  const [localError, setLocalError] = useState4(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  useEffect4(() => {
    setDraft(cloneSchema(schema));
  }, [schema]);
  const activeSection = draft.sections[activeSectionIdx];
  const updateSection = (idx, patch) => {
    setDraft((prev) => {
      const next = cloneSchema(prev);
      next.sections[idx] = { ...next.sections[idx], ...patch };
      return next;
    });
  };
  const addSection = () => {
    setDraft((prev) => {
      const next = cloneSchema(prev);
      next.sections.push(blankSection(next.sections));
      return next;
    });
    setActiveSectionIdx(draft.sections.length);
  };
  const reorderSections = (newArr) => {
    setDraft((prev) => {
      var _a2;
      const next = cloneSchema(prev);
      const currentUid = (_a2 = next.sections[activeSectionIdx]) == null ? void 0 : _a2._uid;
      next.sections = newArr;
      const newIdx = currentUid ? newArr.findIndex((s) => s._uid === currentUid) : 0;
      if (newIdx >= 0) setActiveSectionIdx(newIdx);
      return next;
    });
  };
  const removeSection = async (idx) => {
    var _a2, _b;
    const label = ((_a2 = draft.sections[idx]) == null ? void 0 : _a2.label) || ((_b = draft.sections[idx]) == null ? void 0 : _b.id) || `section ${idx + 1}`;
    const ok = await confirm({
      title: "Remove section?",
      body: `"${label}" and all of its groups/fields will be removed from the schema. Values already stored under those field paths will remain in the database.`,
      confirmLabel: "Remove",
      variant: "destructive"
    });
    if (!ok) return;
    setDraft((prev) => {
      const next = cloneSchema(prev);
      next.sections.splice(idx, 1);
      return next;
    });
    setActiveSectionIdx(0);
  };
  const addGroup = () => {
    const siblings = activeSection.groups || [];
    updateSection(activeSectionIdx, { groups: [...siblings, blankGroup(siblings)] });
  };
  const updateGroup = (gi, next) => {
    const groups = [...activeSection.groups || []];
    groups[gi] = next;
    updateSection(activeSectionIdx, { groups });
  };
  const removeGroup = (gi) => {
    const groups = [...activeSection.groups || []];
    groups.splice(gi, 1);
    updateSection(activeSectionIdx, { groups });
  };
  const reorderGroups = (newArr) => {
    updateSection(activeSectionIdx, { groups: newArr });
  };
  const handleSave = async () => {
    const localMsg = validateLocal(draft);
    if (localMsg) {
      setLocalError(localMsg);
      return;
    }
    setLocalError(null);
    await onSave(stripUids(draft));
  };
  const combinedError = localError || error;
  const displayedSections = useMemo2(() => sortByOrder(draft.sections), [draft.sections]);
  const sectionDnd = useDnd(displayedSections, reorderSections);
  const P = palette || PALETTE;
  const card = {
    background: P.surface,
    border: `1px solid ${P.border}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.xs
  };
  return /* @__PURE__ */ jsxs2(View, { children: [
    confirmDialog,
    combinedError && /* @__PURE__ */ jsx2(Well, { marginBottom: "size-200", UNSAFE_style: { borderColor: P.danger }, children: /* @__PURE__ */ jsx2(Text, { UNSAFE_style: { color: P.danger }, children: combinedError }) }),
    /* @__PURE__ */ jsx2(
      "div",
      {
        style: {
          position: "sticky",
          top: "calc(64px + var(--sc-hero-h, 160px))",
          marginBottom: 16,
          padding: "12px 20px",
          background: P.surface,
          border: `1px solid ${P.border}`,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.floating,
          zIndex: 10
        },
        children: /* @__PURE__ */ jsxs2(Flex, { gap: "size-100", justifyContent: "space-between", alignItems: "center", children: [
          /* @__PURE__ */ jsxs2("div", { style: { fontSize: 12, color: P.textMuted }, children: [
            displayedSections.length,
            " section",
            displayedSections.length === 1 ? "" : "s",
            " \xB7",
            " ",
            displayedSections.reduce((n, s) => n + (s.groups || []).length, 0),
            " groups \xB7",
            " ",
            displayedSections.reduce((n, s) => n + (s.groups || []).reduce((m, g) => m + (g.fields || []).length, 0), 0),
            " fields"
          ] }),
          /* @__PURE__ */ jsxs2(Flex, { gap: "size-100", children: [
            /* @__PURE__ */ jsx2(Button, { variant: "secondary", onPress: onCancel, isDisabled: saving, children: "Cancel" }),
            /* @__PURE__ */ jsx2(Button, { variant: "cta", onPress: handleSave, isDisabled: saving, children: saving ? "Saving\u2026" : "Save schema" })
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 24, alignItems: "flex-start" }, children: [
      /* @__PURE__ */ jsxs2(
        "aside",
        {
          role: "tablist",
          "aria-label": "Sections",
          style: {
            width: 260,
            flexShrink: 0,
            background: P.surfaceMuted,
            border: `1px solid ${P.border}`,
            borderRadius: RADIUS.xxl,
            boxShadow: SHADOW.inset,
            padding: 6,
            position: "sticky",
            // Sit below AppSectionNav (64) + hero card (measured) + save bar (64) + gap
            top: "calc(64px + var(--sc-hero-h, 160px) + 80px)",
            alignSelf: "flex-start",
            maxHeight: "calc(100vh - 64px - var(--sc-hero-h, 160px) - 96px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4
          },
          children: [
            /* @__PURE__ */ jsx2("div", { style: {
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: P.textMuted,
              padding: "6px 14px 4px"
            }, children: "Sections" }),
            displayedSections.map((s, idx) => {
              const active = idx === activeSectionIdx;
              const dragging = sectionDnd.draggingIndex === idx;
              const hover = sectionDnd.hoverIndex === idx && !dragging;
              return /* @__PURE__ */ jsxs2(
                "div",
                {
                  ...sectionDnd.handlers(idx),
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    opacity: dragging ? 0.4 : 1,
                    borderTop: hover ? `2px solid ${P.accent}` : "2px solid transparent"
                  },
                  children: [
                    /* @__PURE__ */ jsx2(DragHandle, { active: dragging }),
                    /* @__PURE__ */ jsx2(
                      "button",
                      {
                        type: "button",
                        role: "tab",
                        "aria-selected": active,
                        onClick: () => setActiveSectionIdx(idx),
                        style: {
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          padding: "10px 14px",
                          border: 0,
                          borderRadius: RADIUS.pill,
                          background: active ? P.surface : "transparent",
                          cursor: active ? "default" : "pointer",
                          font: "inherit",
                          color: active ? P.accent : PALETTE.neutralText,
                          fontWeight: active ? 700 : 600,
                          textAlign: "left",
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          boxShadow: active ? SHADOW.pill : "none",
                          transition: "background 140ms ease, color 140ms ease, box-shadow 140ms ease"
                        },
                        onMouseOver: (e) => {
                          if (!active) {
                            e.currentTarget.style.background = PALETTE.surface;
                            e.currentTarget.style.color = PALETTE.text;
                          }
                        },
                        onMouseOut: (e) => {
                          if (!active) {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = PALETTE.neutralText;
                          }
                        },
                        children: s.label || s.id || `(section ${idx + 1})`
                      }
                    ),
                    /* @__PURE__ */ jsx2(ActionButton, { isQuiet: true, onPress: () => removeSection(idx), "aria-label": "Remove", children: "\u2715" })
                  ]
                },
                s._uid || idx
              );
            }),
            /* @__PURE__ */ jsx2("div", { style: { padding: "6px 6px 4px" }, children: /* @__PURE__ */ jsx2(Button, { variant: "secondary", onPress: addSection, UNSAFE_style: { width: "100%", borderRadius: RADIUS.pill }, children: "+ Add section" }) })
          ]
        }
      ),
      /* @__PURE__ */ jsx2("div", { style: { flex: 1, minWidth: 0 }, children: !activeSection ? /* @__PURE__ */ jsxs2("div", { style: { ...card, padding: 40, textAlign: "center" }, children: [
        /* @__PURE__ */ jsx2(Heading, { level: 3, marginTop: 0, children: "No section selected" }),
        /* @__PURE__ */ jsx2(Text, { UNSAFE_style: { color: P.textMuted }, children: "Add a section on the left to begin building your configuration schema." })
      ] }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
        /* @__PURE__ */ jsxs2("div", { style: { ...card, padding: 20, marginBottom: 16 }, children: [
          /* @__PURE__ */ jsx2("div", { style: {
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: P.textMuted,
            marginBottom: 12
          }, children: "Section properties" }),
          /* @__PURE__ */ jsxs2(Flex, { gap: "size-200", alignItems: "end", wrap: true, children: [
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Section ID",
                value: activeSection.id,
                onChange: (v) => updateSection(activeSectionIdx, { id: v }),
                width: "size-2400"
              }
            ),
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Section Label",
                value: activeSection.label,
                onChange: (v) => updateSection(activeSectionIdx, { label: v }),
                width: "size-3600"
              }
            ),
            /* @__PURE__ */ jsx2(
              TextField,
              {
                label: "Sort order",
                value: String((_a = activeSection.sortOrder) != null ? _a : 0),
                onChange: (v) => updateSection(activeSectionIdx, { sortOrder: Number(v) || 0 }),
                width: "size-1200",
                type: "number"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx2(
          GroupList,
          {
            groups: sortByOrder(activeSection.groups || []),
            onReorder: reorderGroups,
            onUpdate: updateGroup,
            onRemove: removeGroup
          }
        ),
        /* @__PURE__ */ jsx2(Button, { variant: "secondary", onPress: addGroup, children: "+ Add group" })
      ] }) })
    ] })
  ] });
}

// web/src/components/SystemConfig.js
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var useUserRole = (props) => getUserRoleProvider()(props);
var ROLE_RANK_LOCAL = { viewer: 0, editor: 1, admin: 2 };
var hasRole = (userRole, required) => {
  var _a, _b;
  if (!required) return true;
  return ((_a = ROLE_RANK_LOCAL[userRole]) != null ? _a : -1) >= ((_b = ROLE_RANK_LOCAL[required]) != null ? _b : 99);
};
var APP_NAV_OFFSET = 64;
var HERO_HEIGHT = 160;
var SAVE_BAR_HEIGHT = 64;
var HERO_VAR = `var(--sc-hero-h, ${HERO_HEIGHT}px)`;
function buildScopeTreeForPicker(scopeTree) {
  const def = { key: "default::0", label: "Default Config", scope: "default", scopeId: "0" };
  const websites = [];
  const all = [def];
  const groupsById = new Map((scopeTree.storeGroups || []).map((g) => [String(g.id), g]));
  for (const w of scopeTree.websites) {
    const websiteOption = {
      key: `websites::${w.id}`,
      label: w.name || w.code || `Website ${w.id}`,
      scope: "websites",
      scopeId: String(w.id)
    };
    all.push(websiteOption);
    const storesForWebsite = (scopeTree.stores || []).filter(
      (s) => String(s.website_id) === String(w.id)
    );
    storesForWebsite.sort((a, b) => {
      var _a, _b;
      const ga = ((_a = groupsById.get(String(a.store_group_id))) == null ? void 0 : _a.name) || "";
      const gb = ((_b = groupsById.get(String(b.store_group_id))) == null ? void 0 : _b.name) || "";
      if (ga !== gb) return ga.localeCompare(gb);
      return (a.name || "").localeCompare(b.name || "");
    });
    const items = storesForWebsite.map((s) => {
      var _a;
      const groupName = ((_a = groupsById.get(String(s.store_group_id))) == null ? void 0 : _a.name) || "";
      const label = groupName ? `${groupName} / ${s.name}` : s.name;
      const option = { key: `stores::${s.id}`, label, scope: "stores", scopeId: String(s.id) };
      all.push(option);
      return option;
    });
    websites.push({
      websiteId: String(w.id),
      websiteName: websiteOption.label,
      websiteOption,
      items
    });
  }
  return { all, default: def, websites };
}
function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: PALETTE.neutralSoft, fg: PALETTE.neutralText },
    accent: { bg: PALETTE.accentSoft, fg: PALETTE.accent },
    warning: { bg: PALETTE.warningSoft, fg: PALETTE.warning },
    success: { bg: PALETTE.successSoft, fg: PALETTE.success },
    danger: { bg: PALETTE.dangerSoft, fg: PALETTE.danger }
  };
  const t = tones[tone] || tones.neutral;
  return /* @__PURE__ */ jsx3(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: RADIUS.pill,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "16px",
        letterSpacing: 0.2,
        whiteSpace: "nowrap"
      },
      children
    }
  );
}
function Card({ children, padded = true, style = {} }) {
  return /* @__PURE__ */ jsx3(
    "div",
    {
      style: {
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.xs,
        ...padded ? { padding: 20 } : {},
        ...style
      },
      children
    }
  );
}
function FieldControl({ field, value, disabled, sensitivePlaceholder, onChange }) {
  const isMasked = value === sensitivePlaceholder;
  switch (field.type) {
    case "textarea":
      return /* @__PURE__ */ jsx3(View2, { width: "size-4600", children: /* @__PURE__ */ jsx3(
        TextArea,
        {
          "aria-label": field.label,
          value: value != null ? value : "",
          isDisabled: disabled,
          onChange,
          width: "100%",
          UNSAFE_className: "sm-textarea"
        }
      ) });
    case "password":
      return /* @__PURE__ */ jsx3(
        TextField2,
        {
          "aria-label": field.label,
          type: "password",
          value: isMasked ? "" : value != null ? value : "",
          isDisabled: disabled,
          onChange,
          placeholder: isMasked ? "\u2022\u2022\u2022\u2022\u2022 (encrypted, leave blank to keep)" : "",
          width: "size-4600"
        }
      );
    case "number":
      return /* @__PURE__ */ jsx3(
        NumberField,
        {
          "aria-label": field.label,
          value: typeof value === "number" ? value : Number(value) || 0,
          isDisabled: disabled,
          onChange,
          width: "size-3000"
        }
      );
    case "boolean":
      return /* @__PURE__ */ jsx3(Switch2, { isSelected: !!value, isDisabled: disabled, onChange, children: value ? "Yes" : "No" });
    case "select":
      return /* @__PURE__ */ jsx3(
        Picker2,
        {
          "aria-label": field.label,
          selectedKey: value != null ? value : field.default,
          isDisabled: disabled,
          onSelectionChange: onChange,
          width: "size-3600",
          children: (field.options || []).map((opt) => /* @__PURE__ */ jsx3(Item2, { children: opt.label }, opt.value))
        }
      );
    case "text":
    default:
      return /* @__PURE__ */ jsx3(
        TextField2,
        {
          "aria-label": field.label,
          value: value != null ? value : "",
          isDisabled: disabled,
          onChange,
          width: "size-4600"
        }
      );
  }
}
function FieldRow({
  field,
  path,
  scope,
  displayValue,
  origin,
  inherited,
  error,
  onFieldChange,
  onUseDefaultChange,
  sensitivePlaceholder,
  onBulkApply,
  userRole
}) {
  const allowed = isFieldVisibleAtScope(field, scope.scope);
  const showUseDefault = scope.scope !== "default" && allowed;
  const canWrite = hasRole(userRole || "admin", "editor");
  const rbacOk = hasRole(userRole || "admin", field.requiredRole);
  const editorDisabled = !canWrite || !allowed || showUseDefault && inherited || !rbacOk;
  const isTextarea = field.type === "textarea";
  const originLabel = origin ? origin.scope === "default" ? "inherited from Default Config" : `set at ${origin.scope}:${origin.scopeId}` : "unset";
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      style: {
        display: "grid",
        gridTemplateColumns: "220px 1fr auto",
        gap: 16,
        alignItems: isTextarea ? "start" : "center",
        padding: "14px 0",
        borderBottom: `1px solid ${PALETTE.border}`,
        background: error ? "rgba(192,57,43,0.04)" : "transparent"
      },
      children: [
        /* @__PURE__ */ jsxs3("div", { style: { paddingTop: isTextarea ? 6 : 0 }, children: [
          /* @__PURE__ */ jsxs3("div", { style: {
            fontSize: 13,
            fontWeight: 600,
            color: PALETTE.text,
            display: "flex",
            alignItems: "center",
            gap: 6
          }, children: [
            field.label,
            field.sensitive && /* @__PURE__ */ jsxs3(TooltipTrigger, { children: [
              /* @__PURE__ */ jsx3("span", { style: { display: "inline-flex", color: PALETTE.textMuted }, children: /* @__PURE__ */ jsx3(LockClosed, { size: "XS" }) }),
              /* @__PURE__ */ jsx3(Tooltip, { children: "Encrypted at rest" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { style: { marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }, children: [
            !allowed && /* @__PURE__ */ jsx3(Pill, { tone: "warning", children: "Not configurable here" }),
            !rbacOk && /* @__PURE__ */ jsxs3(Pill, { tone: "warning", children: [
              "Requires ",
              field.requiredRole
            ] }),
            allowed && scope.scope !== "default" && /* @__PURE__ */ jsx3(Pill, { tone: inherited ? "neutral" : "accent", children: inherited ? originLabel : "overridden" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(
            FieldControl,
            {
              field,
              value: displayValue,
              disabled: editorDisabled,
              sensitivePlaceholder,
              onChange: (v) => onFieldChange(path, v)
            }
          ),
          error && /* @__PURE__ */ jsx3(
            "div",
            {
              role: "alert",
              style: {
                marginTop: 6,
                fontSize: 12,
                color: PALETTE.danger,
                fontWeight: 600
              },
              children: error
            }
          )
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }, children: [
          showUseDefault && /* @__PURE__ */ jsx3(
            Checkbox2,
            {
              isSelected: inherited,
              onChange: (checked) => onUseDefaultChange(path, checked),
              children: "Use Default"
            }
          ),
          onBulkApply && allowed && canWrite && /* @__PURE__ */ jsx3(
            Button2,
            {
              variant: "secondary",
              isQuiet: true,
              onPress: () => onBulkApply(path, displayValue, field),
              UNSAFE_style: { fontSize: 11 },
              children: "Apply to\u2026"
            }
          )
        ] })
      ]
    }
  );
}
function GroupCard({
  group,
  sectionId,
  scope,
  collapsed,
  onToggle,
  getDisplayValue,
  getOrigin,
  isInheritedAtScope,
  setFieldValue,
  setUseDefault,
  sensitivePlaceholder,
  fieldErrors = {},
  searchFilter = "",
  onTest,
  onBulkApply,
  userRole
}) {
  const lower = searchFilter.trim().toLowerCase();
  const visibleFields = (group.fields || []).filter((field) => {
    if (!lower) return true;
    return String(field.label || "").toLowerCase().includes(lower) || String(field.id || "").toLowerCase().includes(lower);
  });
  if (visibleFields.length === 0 && lower) return null;
  const testField = (group.fields || []).find((f) => f && f.testActionKey);
  const groupErrorCount = visibleFields.reduce((n, f) => {
    const path = `${sectionId}/${group.id}/${f.id}`;
    return fieldErrors[path] ? n + 1 : n;
  }, 0);
  return /* @__PURE__ */ jsxs3(Card, { padded: false, style: { marginBottom: 16, borderColor: groupErrorCount ? PALETTE.danger : void 0 }, children: [
    /* @__PURE__ */ jsxs3(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: collapsed ? 0 : `1px solid ${PALETTE.border}`,
          gap: 12
        },
        children: [
          /* @__PURE__ */ jsxs3(
            "button",
            {
              type: "button",
              onClick: onToggle,
              "aria-expanded": !collapsed,
              style: {
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: 1,
                background: "transparent",
                border: 0,
                cursor: "pointer",
                userSelect: "none",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                padding: 0
              },
              children: [
                /* @__PURE__ */ jsx3("span", { style: { color: PALETTE.textMuted, display: "inline-flex" }, children: collapsed ? /* @__PURE__ */ jsx3(ChevronRight, { size: "S" }) : /* @__PURE__ */ jsx3(ChevronDown, { size: "S" }) }),
                /* @__PURE__ */ jsx3("span", { style: { fontWeight: 700, fontSize: 15, color: PALETTE.text }, children: group.label }),
                /* @__PURE__ */ jsxs3(Pill, { tone: "neutral", children: [
                  visibleFields.length,
                  " field",
                  visibleFields.length === 1 ? "" : "s"
                ] }),
                groupErrorCount > 0 && /* @__PURE__ */ jsxs3(Pill, { tone: "danger", children: [
                  groupErrorCount,
                  " error",
                  groupErrorCount === 1 ? "" : "s"
                ] })
              ]
            }
          ),
          testField && onTest && /* @__PURE__ */ jsxs3(
            Button2,
            {
              variant: "secondary",
              onPress: () => onTest(group, sectionId),
              isQuiet: true,
              children: [
                "Test ",
                testField.label || "connection"
              ]
            }
          )
        ]
      }
    ),
    !collapsed && /* @__PURE__ */ jsx3("div", { style: { padding: "4px 20px 16px" }, children: visibleFields.map((field) => {
      const path = `${sectionId}/${group.id}/${field.id}`;
      const inherited = isInheritedAtScope(path);
      const displayValue = getDisplayValue(path, coerceDefault(field));
      return /* @__PURE__ */ jsx3(
        FieldRow,
        {
          field,
          path,
          scope,
          displayValue,
          origin: getOrigin(path),
          inherited,
          error: fieldErrors[path],
          onFieldChange: setFieldValue,
          onUseDefaultChange: setUseDefault,
          sensitivePlaceholder,
          onBulkApply,
          userRole
        },
        path
      );
    }) })
  ] });
}
function Sidebar({ sections, activeSectionId, onSelect }) {
  return /* @__PURE__ */ jsxs3(
    "aside",
    {
      role: "tablist",
      "aria-label": "Sections",
      style: {
        width: 260,
        flexShrink: 0,
        // Pill-track styling that matches the top AppSectionNav: muted grey
        // track with inset shadow, full-rounded radius, holding individual
        // rounded pill buttons.
        background: PALETTE.surfaceMuted,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: RADIUS.xxl,
        boxShadow: SHADOW.inset,
        padding: 6,
        position: "sticky",
        // Sit below the hero + save bar (which are also sticky) so the
        // sidebar never overlaps either of them. Uses the runtime-measured
        // hero height so the offset stays correct on viewport resize.
        top: `calc(${APP_NAV_OFFSET}px + ${HERO_VAR} + ${SAVE_BAR_HEIGHT + 16}px)`,
        alignSelf: "flex-start",
        maxHeight: `calc(100vh - ${APP_NAV_OFFSET}px - ${HERO_VAR} - ${SAVE_BAR_HEIGHT + 32}px)`,
        overflowY: "auto",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        gap: 4
      },
      children: [
        /* @__PURE__ */ jsx3("div", { style: {
          padding: "6px 14px 4px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: PALETTE.textMuted
        }, children: "Sections" }),
        sections.map((section) => {
          const active = section.id === activeSectionId;
          const fieldCount = (section.groups || []).reduce((n, g) => n + (g.fields || []).length, 0);
          return /* @__PURE__ */ jsxs3(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": active,
              onClick: () => onSelect(section.id),
              style: {
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 14px",
                border: 0,
                borderRadius: RADIUS.pill,
                background: active ? PALETTE.surface : "transparent",
                cursor: active ? "default" : "pointer",
                font: "inherit",
                color: active ? PALETTE.accent : PALETTE.neutralText,
                fontWeight: active ? 700 : 600,
                fontSize: 13,
                textAlign: "left",
                boxShadow: active ? SHADOW.pill : "none",
                transition: "background 140ms ease, color 140ms ease, box-shadow 140ms ease"
              },
              onMouseOver: (e) => {
                if (!active) {
                  e.currentTarget.style.background = PALETTE.surface;
                  e.currentTarget.style.color = PALETTE.text;
                }
              },
              onMouseOut: (e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = PALETTE.neutralText;
                }
              },
              children: [
                /* @__PURE__ */ jsx3("span", { style: { display: "inline-flex", opacity: active ? 1 : 0.7 }, children: /* @__PURE__ */ jsx3(Settings, { size: "XS" }) }),
                /* @__PURE__ */ jsx3("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: section.label }),
                /* @__PURE__ */ jsx3(Pill, { tone: active ? "accent" : "neutral", children: fieldCount })
              ]
            },
            section.id
          );
        })
      ]
    }
  );
}
function ValuesView({ schema, onEditSchema, toolsOpen, setToolsOpen, configCtx, callerProps, userRole }) {
  var _a, _b, _c, _d;
  const canWrite = hasRole(userRole || "admin", "editor");
  const {
    scope,
    scopeTree,
    getDisplayValue,
    getOrigin,
    isInheritedAtScope,
    setFieldValue,
    setUseDefault,
    dirtyCount,
    loading,
    saving,
    error,
    savedAt,
    save,
    reset,
    refresh,
    fieldErrors,
    hasErrors,
    computeDiff,
    SENSITIVE_PLACEHOLDER: SENSITIVE_PLACEHOLDER2
  } = configCtx;
  const [searchFilter, setSearchFilter] = useState5("");
  const [diffOpen, setDiffOpen] = useState5(false);
  const [diffRows, setDiffRows] = useState5([]);
  const [testStatus, setTestStatus] = useState5({ tone: "neutral", message: "" });
  const [bulk, setBulk] = useState5({ open: false, path: null, value: null, field: null, targets: /* @__PURE__ */ new Set(), busy: false, result: null });
  const openBulkApply = useCallback4((path, value, field) => {
    setBulk({ open: true, path, value, field, targets: /* @__PURE__ */ new Set(), busy: false, result: null });
  }, []);
  const toggleBulkTarget = (key) => setBulk((prev) => {
    const next = new Set(prev.targets);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return { ...prev, targets: next };
  });
  const closeBulk = () => setBulk((prev) => ({ ...prev, open: false }));
  const openDiffPreview = () => {
    setDiffRows(computeDiff());
    setDiffOpen(true);
  };
  const confirmSave = async () => {
    setDiffOpen(false);
    await save();
  };
  const runBulkApply = useCallback4(async () => {
    var _a2;
    if (!bulk.path || bulk.targets.size === 0 || !callerProps) return;
    setBulk((prev) => ({ ...prev, busy: true, result: null }));
    const targets = Array.from(bulk.targets).map((k) => {
      const [s, ...rest] = k.split("::");
      return { scope: s, scopeId: rest.join("::") };
    });
    try {
      const res = await callAction(callerProps, getActionKey("systemConfigBulkSave"), "", {
        values: { [bulk.path]: bulk.value },
        sensitivePaths: ((_a2 = bulk.field) == null ? void 0 : _a2.sensitive) ? [bulk.path] : [],
        targets,
        actor: "bulk-apply"
      });
      const body = (res == null ? void 0 : res.body) || res;
      setBulk((prev) => ({ ...prev, busy: false, result: body }));
    } catch (e) {
      setBulk((prev) => ({ ...prev, busy: false, result: { ok: false, error: e.message } }));
    }
  }, [bulk.path, bulk.value, bulk.field, bulk.targets, callerProps]);
  const handleTestGroup = useCallback4(async (group, sectionId) => {
    const testField = (group.fields || []).find((f) => f && f.testActionKey);
    if (!testField || !callerProps) return;
    setTestStatus({ tone: "notice", message: `Testing ${group.label}\u2026` });
    try {
      const payload = {};
      for (const f of group.fields || []) {
        const path = `${sectionId}/${group.id}/${f.id}`;
        payload[f.id] = getDisplayValue(path, coerceDefault(f));
      }
      const res = await callAction(callerProps, getActionKey(testField.testActionKey), "", payload);
      const body = (res == null ? void 0 : res.body) || res;
      if (body && body.ok) {
        setTestStatus({ tone: "positive", message: body.message || "Connection OK" });
      } else {
        setTestStatus({ tone: "negative", message: body && body.message || "Test failed" });
      }
    } catch (e) {
      setTestStatus({ tone: "negative", message: e.message || "Test failed" });
    }
  }, [callerProps, getDisplayValue]);
  const allSections = useMemo3(() => sortByOrder((schema == null ? void 0 : schema.sections) || []), [schema]);
  const sections = useMemo3(() => {
    const q = searchFilter.trim().toLowerCase();
    const withSortedChildren = allSections.map((section) => ({
      ...section,
      groups: sortByOrder(section.groups || []).map((g) => ({
        ...g,
        fields: sortByOrder(g.fields || [])
      }))
    }));
    if (!q) return withSortedChildren;
    const match = (s) => String(s || "").toLowerCase().includes(q);
    const out = [];
    for (const section of withSortedChildren) {
      const groups = [];
      for (const group of section.groups || []) {
        const fields = (group.fields || []).filter(
          (f) => match(f.label) || match(f.id)
        );
        if (fields.length || match(group.label) || match(group.id)) {
          groups.push({ ...group, fields: fields.length ? fields : group.fields || [] });
        }
      }
      if (groups.length || match(section.label) || match(section.id)) {
        out.push({ ...section, groups });
      }
    }
    return out;
  }, [allSections, searchFilter]);
  const [activeSectionId, setActiveSectionId] = useState5((_a = sections[0]) == null ? void 0 : _a.id);
  const activeSection = useMemo3(() => {
    if (sections.length === 0) return null;
    return sections.find((s) => s.id === activeSectionId) || sections[0];
  }, [sections, activeSectionId]);
  const scopeTreeForPicker = useMemo3(() => buildScopeTreeForPicker(scopeTree), [scopeTree]);
  const scopeKey = `${scope.scope}::${scope.scopeId}`;
  const activeScopeLabel = ((_b = scopeTreeForPicker.all.find((o) => o.key === scopeKey)) == null ? void 0 : _b.label) || "Default Config";
  const [collapsedGroups, setCollapsedGroups] = useState5({});
  useEffect5(() => {
    setCollapsedGroups({});
  }, [activeSection == null ? void 0 : activeSection.id]);
  const toggleGroup = (gid) => setCollapsedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }));
  const setAllGroups = (collapsed) => {
    const next = {};
    for (const g of (activeSection == null ? void 0 : activeSection.groups) || []) next[g.id] = collapsed;
    setCollapsedGroups(next);
  };
  if (allSections.length === 0) {
    return /* @__PURE__ */ jsx3(Card, { children: /* @__PURE__ */ jsxs3("div", { style: { textAlign: "center", padding: "40px 20px" }, children: [
      /* @__PURE__ */ jsx3("div", { style: {
        display: "inline-flex",
        padding: 16,
        background: PALETTE.accentSoft,
        borderRadius: "50%",
        marginBottom: 12,
        color: PALETTE.accent
      }, children: /* @__PURE__ */ jsx3(Settings, { size: "L" }) }),
      /* @__PURE__ */ jsx3(Heading2, { level: 3, marginTop: 0, children: "No configuration schema yet" }),
      /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { color: PALETTE.textMuted, maxWidth: 460, display: "inline-block" }, children: userRole === "admin" ? "Open the Schema Designer to define sections, groups, and fields for your sync integrations." : "A schema hasn\u2019t been published yet. Ask an admin to set it up \u2014 schema editing is restricted to the admin role." }),
      userRole === "admin" && /* @__PURE__ */ jsx3(Flex2, { justifyContent: "center", gap: "size-150", marginTop: "size-200", children: /* @__PURE__ */ jsx3(Button2, { variant: "cta", onPress: onEditSchema, children: "Open Schema Designer" }) })
    ] }) });
  }
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    error && /* @__PURE__ */ jsx3(Well2, { marginBottom: "size-200", UNSAFE_style: { borderColor: PALETTE.danger }, children: /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { color: PALETTE.danger }, children: error }) }),
    /* @__PURE__ */ jsxs3(
      "div",
      {
        style: {
          position: "sticky",
          // Hero card sticks at APP_NAV_OFFSET; this save bar sits flush
          // against the hero's bottom edge (measured at runtime via
          // --sc-hero-h so the gap is always zero regardless of subtitle
          // wrap).
          top: `calc(${APP_NAV_OFFSET}px + ${HERO_VAR})`,
          marginBottom: 16,
          padding: "12px 20px",
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.floating,
          zIndex: 10
        },
        children: [
          /* @__PURE__ */ jsxs3(Flex2, { gap: "size-150", alignItems: "center", justifyContent: "space-between", children: [
            /* @__PURE__ */ jsx3("div", { style: { fontSize: 12, color: PALETTE.textMuted }, children: !canWrite ? /* @__PURE__ */ jsxs3("span", { style: { color: PALETTE.textMuted, fontWeight: 600 }, children: [
              "Read-only \u2014 your role (",
              userRole || "viewer",
              ") can view but not change config. Editor or admin required."
            ] }) : dirtyCount > 0 ? /* @__PURE__ */ jsxs3("span", { style: { color: PALETTE.warning, fontWeight: 600 }, children: [
              dirtyCount,
              " unsaved change",
              dirtyCount === 1 ? "" : "s"
            ] }) : savedAt && !saving ? /* @__PURE__ */ jsxs3("span", { style: { color: PALETTE.success, fontWeight: 600 }, children: [
              "\u2713 Saved ",
              new Date(savedAt).toLocaleTimeString()
            ] }) : "All changes saved" }),
            /* @__PURE__ */ jsxs3(Flex2, { gap: "size-100", alignItems: "center", children: [
              /* @__PURE__ */ jsx3(
                SearchField,
                {
                  "aria-label": "Filter sections, groups, fields",
                  placeholder: "Search fields\u2026",
                  value: searchFilter,
                  onChange: setSearchFilter,
                  width: "size-2400"
                }
              ),
              /* @__PURE__ */ jsx3(Button2, { variant: "secondary", onPress: refresh, isDisabled: saving || loading, children: "Reload" }),
              /* @__PURE__ */ jsx3(Button2, { variant: "secondary", onPress: reset, isDisabled: saving || dirtyCount === 0, children: "Reset" }),
              /* @__PURE__ */ jsx3(
                Button2,
                {
                  variant: "cta",
                  onPress: openDiffPreview,
                  isDisabled: !canWrite || saving || loading || dirtyCount === 0 || hasErrors,
                  children: saving ? "Saving\u2026" : `Review & Save${dirtyCount ? ` (${dirtyCount})` : ""}`
                }
              )
            ] })
          ] }),
          testStatus.message && /* @__PURE__ */ jsx3(View2, { marginTop: "size-100", children: /* @__PURE__ */ jsx3(StatusLight, { variant: testStatus.tone, children: testStatus.message }) })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3(
      DialogTrigger,
      {
        isOpen: diffOpen,
        onOpenChange: (open) => setDiffOpen(open),
        children: [
          /* @__PURE__ */ jsx3("div", { style: { display: "none" }, "aria-hidden": "true", children: "trigger" }),
          /* @__PURE__ */ jsxs3(Dialog, { size: "L", children: [
            /* @__PURE__ */ jsxs3(Heading2, { children: [
              "Confirm ",
              diffRows.length,
              " change",
              diffRows.length === 1 ? "" : "s"
            ] }),
            /* @__PURE__ */ jsx3(Header, { children: /* @__PURE__ */ jsxs3(Text2, { children: [
              "scope = ",
              scope.scope,
              ":",
              scope.scopeId
            ] }) }),
            /* @__PURE__ */ jsx3(Divider2, {}),
            /* @__PURE__ */ jsx3(Content, { children: diffRows.length === 0 ? /* @__PURE__ */ jsx3(Text2, { children: "Nothing to save." }) : /* @__PURE__ */ jsx3("div", { style: { maxHeight: 360, overflow: "auto" }, children: diffRows.map((r) => /* @__PURE__ */ jsxs3(
              "div",
              {
                style: {
                  padding: "10px 0",
                  borderBottom: `1px solid ${PALETTE.border}`,
                  fontSize: 13
                },
                children: [
                  /* @__PURE__ */ jsxs3("div", { style: { fontWeight: 600, color: PALETTE.text }, children: [
                    r.sectionLabel,
                    " \u203A ",
                    r.groupLabel,
                    " \u203A ",
                    r.label,
                    /* @__PURE__ */ jsx3("span", { style: {
                      marginLeft: 8,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      color: r.action === "create" ? PALETTE.success : r.action === "inherit" ? PALETTE.warning : PALETTE.accent
                    }, children: r.action })
                  ] }),
                  /* @__PURE__ */ jsx3("div", { style: { color: PALETTE.textMuted, fontSize: 12, marginTop: 2 }, children: r.path }),
                  /* @__PURE__ */ jsxs3("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginTop: 6,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12
                  }, children: [
                    /* @__PURE__ */ jsxs3("div", { children: [
                      /* @__PURE__ */ jsx3("div", { style: { color: PALETTE.textMuted }, children: "old" }),
                      /* @__PURE__ */ jsx3("div", { style: { color: PALETTE.danger, wordBreak: "break-all" }, children: r.oldValue == null ? "\u2205" : String(r.oldValue) })
                    ] }),
                    /* @__PURE__ */ jsxs3("div", { children: [
                      /* @__PURE__ */ jsx3("div", { style: { color: PALETTE.textMuted }, children: "new" }),
                      /* @__PURE__ */ jsx3("div", { style: { color: PALETTE.success, wordBreak: "break-all" }, children: r.action === "inherit" ? "(inherit from default)" : r.newValue == null ? "\u2205" : String(r.newValue) })
                    ] })
                  ] })
                ]
              },
              r.path
            )) }) }),
            /* @__PURE__ */ jsxs3(ButtonGroup, { children: [
              /* @__PURE__ */ jsx3(Button2, { variant: "secondary", onPress: () => setDiffOpen(false), children: "Cancel" }),
              /* @__PURE__ */ jsx3(Button2, { variant: "cta", onPress: confirmSave, isDisabled: diffRows.length === 0, children: "Confirm & Save" })
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3(DialogTrigger, { isOpen: bulk.open, onOpenChange: (o) => {
      if (!o) closeBulk();
    }, children: [
      /* @__PURE__ */ jsx3("div", { style: { display: "none" }, "aria-hidden": "true", children: "trigger" }),
      /* @__PURE__ */ jsxs3(Dialog, { size: "L", children: [
        /* @__PURE__ */ jsx3(Heading2, { children: "Apply value to scopes" }),
        /* @__PURE__ */ jsx3(Divider2, {}),
        /* @__PURE__ */ jsxs3(Content, { children: [
          /* @__PURE__ */ jsxs3("div", { style: { marginBottom: 16 }, children: [
            /* @__PURE__ */ jsx3("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: PALETTE.textMuted, marginBottom: 6 }, children: "Path" }),
            /* @__PURE__ */ jsx3("code", { style: {
              display: "block",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              fontWeight: 600,
              color: PALETTE.text,
              background: PALETTE.surfaceMuted || "rgba(0,0,0,0.05)",
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 6,
              padding: "6px 10px",
              whiteSpace: "nowrap",
              overflowX: "auto"
            }, children: bulk.path })
          ] }),
          /* @__PURE__ */ jsxs3("div", { style: { marginBottom: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }, children: [
            /* @__PURE__ */ jsx3("div", { style: { color: PALETTE.textMuted }, children: "Will write" }),
            /* @__PURE__ */ jsx3("div", { style: { color: PALETTE.success, wordBreak: "break-all" }, children: ((_c = bulk.field) == null ? void 0 : _c.sensitive) ? "[sensitive \u2014 will encrypt]" : String((_d = bulk.value) != null ? _d : "") })
          ] }),
          (() => {
            const allowWebsites = isFieldVisibleAtScope(bulk.field, "websites");
            const allowStores = isFieldVisibleAtScope(bulk.field, "stores");
            if (!allowWebsites && !allowStores) {
              return /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { color: PALETTE.textMuted }, children: "This field is only configurable at the Default scope, so there are no other scopes to apply it to." });
            }
            const cols = [allowWebsites, allowStores].filter(Boolean).length;
            return /* @__PURE__ */ jsxs3("div", { style: { display: "grid", gridTemplateColumns: cols === 2 ? "1fr 1fr" : "1fr", gap: 16 }, children: [
              allowWebsites && /* @__PURE__ */ jsxs3("div", { children: [
                /* @__PURE__ */ jsx3("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: PALETTE.textMuted, marginBottom: 6 }, children: "Websites" }),
                (scopeTree.websites || []).length === 0 && /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { color: PALETTE.textMuted }, children: "None" }),
                (scopeTree.websites || []).map((w) => {
                  const key = `websites::${w.id}`;
                  return /* @__PURE__ */ jsx3("div", { children: /* @__PURE__ */ jsxs3(Checkbox2, { isSelected: bulk.targets.has(key), onChange: () => toggleBulkTarget(key), children: [
                    w.name || w.code,
                    " ",
                    /* @__PURE__ */ jsxs3("span", { style: { color: PALETTE.textMuted, fontSize: 11 }, children: [
                      "(",
                      w.code,
                      ")"
                    ] })
                  ] }) }, key);
                })
              ] }),
              allowStores && /* @__PURE__ */ jsxs3("div", { children: [
                /* @__PURE__ */ jsx3("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: PALETTE.textMuted, marginBottom: 6 }, children: "Stores" }),
                (scopeTree.stores || []).length === 0 && /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { color: PALETTE.textMuted }, children: "None" }),
                (scopeTree.stores || []).map((s) => {
                  const key = `stores::${s.id}`;
                  return /* @__PURE__ */ jsx3("div", { children: /* @__PURE__ */ jsxs3(Checkbox2, { isSelected: bulk.targets.has(key), onChange: () => toggleBulkTarget(key), children: [
                    s.name || s.code,
                    " ",
                    /* @__PURE__ */ jsxs3("span", { style: { color: PALETTE.textMuted, fontSize: 11 }, children: [
                      "(",
                      s.code,
                      ")"
                    ] })
                  ] }) }, key);
                })
              ] })
            ] });
          })(),
          bulk.result && /* @__PURE__ */ jsx3(View2, { marginTop: "size-200", children: /* @__PURE__ */ jsx3(StatusLight, { variant: bulk.result.ok ? "positive" : "negative", children: bulk.result.ok ? `Applied to ${bulk.result.succeeded}/${bulk.result.total}` : bulk.result.error || `${bulk.result.failed} of ${bulk.result.total} failed` }) })
        ] }),
        /* @__PURE__ */ jsxs3(ButtonGroup, { children: [
          /* @__PURE__ */ jsx3(Button2, { variant: "secondary", onPress: closeBulk, isDisabled: bulk.busy, children: "Close" }),
          /* @__PURE__ */ jsx3(
            Button2,
            {
              variant: "cta",
              onPress: runBulkApply,
              isDisabled: bulk.busy || bulk.targets.size === 0,
              children: bulk.busy ? "Applying\u2026" : `Apply to ${bulk.targets.size} scope${bulk.targets.size === 1 ? "" : "s"}`
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 24, alignItems: "flex-start" }, children: [
      /* @__PURE__ */ jsx3(
        Sidebar,
        {
          sections,
          activeSectionId: activeSection == null ? void 0 : activeSection.id,
          onSelect: setActiveSectionId
        }
      ),
      /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsxs3("div", { style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16
        }, children: [
          /* @__PURE__ */ jsxs3("div", { children: [
            /* @__PURE__ */ jsx3("div", { style: { fontSize: 12, color: PALETTE.textMuted, fontWeight: 600, marginBottom: 4 }, children: activeScopeLabel }),
            /* @__PURE__ */ jsx3(Heading2, { level: 2, marginTop: 0, marginBottom: 0, children: activeSection == null ? void 0 : activeSection.label })
          ] }),
          ((activeSection == null ? void 0 : activeSection.groups) || []).length > 1 && /* @__PURE__ */ jsxs3(Flex2, { gap: "size-50", children: [
            /* @__PURE__ */ jsx3(ActionButton2, { onPress: () => setAllGroups(false), isQuiet: true, children: "Expand all" }),
            /* @__PURE__ */ jsx3(ActionButton2, { onPress: () => setAllGroups(true), isQuiet: true, children: "Collapse all" })
          ] })
        ] }),
        loading ? /* @__PURE__ */ jsx3(Card, { children: /* @__PURE__ */ jsx3(Flex2, { justifyContent: "center", marginY: "size-400", children: /* @__PURE__ */ jsx3(ProgressCircle2, { "aria-label": "Loading values", isIndeterminate: true }) }) }) : ((activeSection == null ? void 0 : activeSection.groups) || []).map((group) => /* @__PURE__ */ jsx3(
          GroupCard,
          {
            group,
            sectionId: activeSection.id,
            scope,
            collapsed: !!collapsedGroups[group.id],
            onToggle: () => toggleGroup(group.id),
            getDisplayValue,
            getOrigin,
            isInheritedAtScope,
            setFieldValue,
            setUseDefault,
            sensitivePlaceholder: SENSITIVE_PLACEHOLDER2,
            fieldErrors,
            searchFilter,
            onTest: handleTestGroup,
            onBulkApply: openBulkApply,
            userRole
          },
          group.id
        )),
        /* @__PURE__ */ jsx3("div", { style: { height: 80 } })
      ] })
    ] })
  ] });
}
function ScopePicker({ scopeTreeForPicker, selectedKey, onChange, disabled }) {
  const [open, setOpen] = useState5(false);
  const wrapperRef = useRef2(null);
  useEffect5(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const selected = scopeTreeForPicker.all.find((o) => o.key === selectedKey);
  const selectedLabel = (selected == null ? void 0 : selected.label) || "Default Config";
  const select = (key) => {
    onChange(key);
    setOpen(false);
  };
  const renderItem = ({ key, label, indent = 0, isWebsite = false }) => {
    const active = key === selectedKey;
    return /* @__PURE__ */ jsxs3(
      "button",
      {
        type: "button",
        onClick: () => select(key),
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: `8px 12px 8px ${12 + indent * 18}px`,
          background: active ? PALETTE.accentSoft : "transparent",
          color: active ? PALETTE.accent : PALETTE.text,
          fontSize: 13,
          fontWeight: active ? 700 : isWebsite ? 600 : 500,
          border: 0,
          textAlign: "left",
          cursor: "pointer",
          font: "inherit"
        },
        onMouseOver: (e) => {
          if (!active) e.currentTarget.style.background = PALETTE.surfaceMuted;
        },
        onMouseOut: (e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        },
        children: [
          /* @__PURE__ */ jsxs3("span", { style: { display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }, children: [
            indent > 0 && /* @__PURE__ */ jsx3("span", { style: { color: PALETTE.textMuted }, children: "\u21B3" }),
            /* @__PURE__ */ jsx3("span", { children: label })
          ] }),
          active && /* @__PURE__ */ jsx3("span", { style: { color: PALETTE.accent, fontSize: 14 }, children: "\u2713" })
        ]
      },
      key
    );
  };
  return /* @__PURE__ */ jsxs3("div", { ref: wrapperRef, style: { position: "relative" }, children: [
    /* @__PURE__ */ jsxs3(
      "button",
      {
        type: "button",
        onClick: () => !disabled && setOpen((o) => !o),
        disabled,
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: RADIUS.md,
          padding: "6px 10px",
          minWidth: 220,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          color: PALETTE.text,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1
        },
        children: [
          /* @__PURE__ */ jsx3(Globe, { size: "XS" }),
          /* @__PURE__ */ jsx3("span", { style: { flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: selectedLabel }),
          /* @__PURE__ */ jsx3("span", { style: { color: PALETTE.textMuted, fontSize: 11 }, children: "\u25BE" })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxs3(
      "div",
      {
        role: "listbox",
        style: {
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 4,
          minWidth: 280,
          maxHeight: 420,
          overflowY: "auto",
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.dropdown,
          zIndex: 100,
          padding: 4
        },
        children: [
          renderItem({ key: scopeTreeForPicker.default.key, label: scopeTreeForPicker.default.label, indent: 0 }),
          scopeTreeForPicker.websites.map((w) => /* @__PURE__ */ jsxs3("div", { style: { marginTop: 6, paddingTop: 6, borderTop: `1px solid ${PALETTE.border}` }, children: [
            /* @__PURE__ */ jsx3("div", { style: {
              padding: "6px 12px 4px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: PALETTE.textMuted
            }, children: "Website" }),
            renderItem({ key: w.websiteOption.key, label: w.websiteOption.label, indent: 0, isWebsite: true }),
            w.items.map((s) => renderItem({ key: s.key, label: s.label, indent: 1 }))
          ] }, w.websiteId))
        ]
      }
    )
  ] });
}
function PageHeader({
  heroRef,
  mode,
  setMode,
  scopeTree,
  scopeTreeForPicker,
  scopeKey,
  onScopeChange,
  onReloadStores,
  onOpenTools,
  toolsOpen,
  userRole
}) {
  const isSchemaMode = mode === "schema";
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      ref: heroRef,
      style: {
        // Hero card. Identical chrome to DataIngestion's hero — same border,
        // radius, padding, shadow, font. Sticky so the title + scope picker
        // stay reachable while scrolling long pages of fields.
        position: "sticky",
        top: APP_NAV_OFFSET,
        zIndex: 20,
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: RADIUS.xl,
        padding: "20px 24px",
        boxShadow: SHADOW.xs,
        display: "flex",
        gap: 24,
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        fontFamily: "adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      },
      children: [
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 16, alignItems: "flex-start", minWidth: 0 }, children: [
          /* @__PURE__ */ jsx3("div", { style: {
            display: "inline-flex",
            padding: 10,
            background: PALETTE.accentSoft,
            color: PALETTE.accent,
            borderRadius: RADIUS.lg,
            flexShrink: 0
          }, children: /* @__PURE__ */ jsx3(Settings, { size: "S" }) }),
          /* @__PURE__ */ jsxs3("div", { style: { minWidth: 0 }, children: [
            /* @__PURE__ */ jsx3("div", { style: {
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: PALETTE.textMuted,
              marginBottom: 6
            }, children: "Configurations / App Builder" }),
            /* @__PURE__ */ jsx3("div", { style: { fontSize: 24, fontWeight: 700, color: PALETTE.text, lineHeight: 1.2 }, children: isSchemaMode ? "Schema Designer" : "System Configuration" }),
            /* @__PURE__ */ jsx3("div", { style: { fontSize: 13, color: PALETTE.textMuted, marginTop: 6, maxWidth: 540 }, children: isSchemaMode ? "Define sections, groups, and fields. Renaming an id strands existing values; removing one prompts to delete its stored values." : "Manage configuration values across Default Config, websites, and store views \u2014 stored in App Builder DB." })
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: mode === "values" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
          /* @__PURE__ */ jsx3(
            ScopePicker,
            {
              scopeTreeForPicker,
              selectedKey: scopeKey,
              onChange: onScopeChange,
              disabled: scopeTree.loading
            }
          ),
          /* @__PURE__ */ jsxs3(TooltipTrigger, { children: [
            /* @__PURE__ */ jsx3(ActionButton2, { onPress: onReloadStores, isDisabled: scopeTree.loading, "aria-label": "Reload stores", children: /* @__PURE__ */ jsx3(Refresh, {}) }),
            /* @__PURE__ */ jsx3(Tooltip, { children: "Reload websites & stores from Commerce" })
          ] }),
          /* @__PURE__ */ jsxs3(TooltipTrigger, { children: [
            /* @__PURE__ */ jsx3(ActionButton2, { onPress: onOpenTools, "aria-label": "Open tools", isQuiet: !toolsOpen, children: /* @__PURE__ */ jsx3(CloudUpload, {}) }),
            /* @__PURE__ */ jsx3(Tooltip, { children: "Legacy migration tools" })
          ] }),
          userRole === "admin" && /* @__PURE__ */ jsxs3(TooltipTrigger, { children: [
            /* @__PURE__ */ jsx3(ActionButton2, { onPress: () => setMode("schema"), "aria-label": "Edit schema", children: /* @__PURE__ */ jsx3(Edit, {}) }),
            /* @__PURE__ */ jsx3(Tooltip, { children: "Edit schema" })
          ] })
        ] }) })
      ]
    }
  );
}
function ToolsPanel({
  onClose,
  // Export / Import
  onExport,
  exporting,
  onImport,
  importing,
  ioMsg,
  ioProgress,
  // { phase, done, total, label }
  importSourceKey,
  setImportSourceKey,
  // Commerce sync
  onSyncStoreMappings,
  syncingStoreMappings,
  syncMsg
}) {
  return /* @__PURE__ */ jsxs3(Card, { style: { marginBottom: 16 }, children: [
    /* @__PURE__ */ jsxs3(Flex2, { justifyContent: "space-between", alignItems: "center", marginBottom: "size-150", children: [
      /* @__PURE__ */ jsxs3(Flex2, { gap: "size-100", alignItems: "center", children: [
        /* @__PURE__ */ jsx3(CloudUpload, { size: "S" }),
        /* @__PURE__ */ jsx3(Heading2, { level: 4, margin: 0, children: "Export / Import" })
      ] }),
      /* @__PURE__ */ jsx3(ActionButton2, { isQuiet: true, onPress: onClose, "aria-label": "Close tools", children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { color: PALETTE.textMuted, fontSize: 13, display: "block", marginBottom: 12 }, children: "Download the entire configuration bundle as JSON for backup or to copy between workspaces." }),
    /* @__PURE__ */ jsxs3(Flex2, { gap: "size-150", alignItems: "center", wrap: true, children: [
      /* @__PURE__ */ jsx3(Button2, { variant: "secondary", onPress: onExport, isDisabled: exporting || importing, children: exporting ? "Exporting\u2026" : "Export Configuration" }),
      /* @__PURE__ */ jsx3(Button2, { variant: "secondary", onPress: onImport, isDisabled: importing || exporting, children: importing ? "Importing\u2026" : "Import Configuration" })
    ] }),
    /* @__PURE__ */ jsx3(View2, { marginTop: "size-150", UNSAFE_style: { maxWidth: 520 }, children: /* @__PURE__ */ jsx3(
      TextField2,
      {
        label: "Source encryption key (only for legacy v1 dumps)",
        type: "password",
        value: importSourceKey,
        onChange: setImportSourceKey,
        isDisabled: importing,
        width: "100%"
      }
    ) }),
    ioProgress && ioProgress.phase === "running" && /* @__PURE__ */ jsx3(View2, { marginTop: "size-200", children: ioProgress.total > 0 ? /* @__PURE__ */ jsx3(
      ProgressBar,
      {
        label: ioProgress.label || "Working\u2026",
        value: ioProgress.done,
        maxValue: ioProgress.total,
        valueLabel: `${ioProgress.done} / ${ioProgress.total}`,
        width: "100%"
      }
    ) : /* @__PURE__ */ jsx3(
      ProgressBar,
      {
        label: ioProgress.label || "Working\u2026",
        isIndeterminate: true,
        width: "100%"
      }
    ) }),
    ioMsg && /* @__PURE__ */ jsx3(
      View2,
      {
        marginTop: "size-150",
        padding: "size-150",
        UNSAFE_style: {
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: RADIUS.md
        },
        children: /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { whiteSpace: "pre-line", fontSize: 13, fontFamily: "ui-monospace, Menlo, monospace" }, children: ioMsg })
      }
    ),
    /* @__PURE__ */ jsx3(Divider2, { size: "S", marginY: "size-250" }),
    /* @__PURE__ */ jsx3(Flex2, { justifyContent: "space-between", alignItems: "center", marginBottom: "size-100", children: /* @__PURE__ */ jsx3(Heading2, { level: 4, margin: 0, children: "Sync Store Mappings" }) }),
    /* @__PURE__ */ jsxs3(Text2, { UNSAFE_style: { color: PALETTE.textMuted, fontSize: 13, display: "block", marginBottom: 12 }, children: [
      "Rebuild ",
      /* @__PURE__ */ jsx3("code", { children: "general/settings/store_mappings" }),
      " from Commerce."
    ] }),
    /* @__PURE__ */ jsx3(Flex2, { gap: "size-150", alignItems: "center", wrap: true, children: /* @__PURE__ */ jsx3(
      Button2,
      {
        variant: "secondary",
        onPress: onSyncStoreMappings,
        isDisabled: syncingStoreMappings || exporting || importing,
        children: syncingStoreMappings ? "Syncing\u2026" : "Sync Store Mappings"
      }
    ) }),
    syncMsg && /* @__PURE__ */ jsx3(
      View2,
      {
        marginTop: "size-150",
        padding: "size-150",
        UNSAFE_style: {
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: RADIUS.md
        },
        children: /* @__PURE__ */ jsx3(Text2, { UNSAFE_style: { whiteSpace: "pre-line", fontSize: 13, fontFamily: "ui-monospace, Menlo, monospace" }, children: syncMsg })
      }
    )
  ] });
}
function SystemConfig(props) {
  const { role: userRole } = useUserRole(props);
  const propsWithRole = useMemo3(() => ({ ...props, userRole }), [props, userRole]);
  const {
    schema,
    saveSchema,
    refresh: refreshSchema,
    loading: schemaLoading,
    saving: schemaSaving,
    error: schemaError
  } = useSystemConfigSchema(propsWithRole);
  const [mode, setMode] = useState5("values");
  useEffect5(() => {
    if (mode === "schema" && userRole && userRole !== "admin") setMode("values");
  }, [mode, userRole]);
  const [toolsOpen, setToolsOpen] = useState5(false);
  const [exporting, setExporting] = useState5(false);
  const [importing, setImporting] = useState5(false);
  const [ioMsg, setIoMsg] = useState5(null);
  const [ioProgress, setIoProgress] = useState5({ phase: "idle", done: 0, total: 0, label: "" });
  const [importSourceKey, setImportSourceKey] = useState5("");
  const [syncingStoreMappings, setSyncingStoreMappings] = useState5(false);
  const [syncMsg, setSyncMsg] = useState5(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const heroRef = useRef2(null);
  useEffect5(() => {
    if (!heroRef.current) return void 0;
    const update = () => {
      const h = heroRef.current ? heroRef.current.offsetHeight : HERO_HEIGHT;
      document.documentElement.style.setProperty("--sc-hero-h", `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(heroRef.current);
    return () => {
      ro.disconnect();
    };
  }, [mode]);
  const configCtx = useSystemConfig(
    propsWithRole,
    mode === "values" ? schema : { sections: [] }
  );
  const { scope, setScope, scopeTree, refreshScopeTree } = configCtx;
  const scopeTreeForPicker = useMemo3(() => buildScopeTreeForPicker(scopeTree), [scopeTree]);
  const scopeKey = `${scope.scope}::${scope.scopeId}`;
  const onScopeChange = (key) => {
    const opt = scopeTreeForPicker.all.find((o) => o.key === key);
    if (!opt) return;
    setScope({ scope: opt.scope, scopeId: opt.scopeId });
  };
  const onSchemaSave = async (next) => {
    let result = await saveSchema(next);
    if (result == null ? void 0 : result.needsConfirmation) {
      const removed = result.removedPaths || [];
      const ok = await confirm({
        title: "Removing schema entries will delete stored values",
        body: "The following field path(s) are being removed from the schema. Their values will be permanently deleted from system_config_data across every scope:\n\n  \u2022 " + removed.join("\n  \u2022 ") + "\n\nContinue?",
        confirmLabel: "Delete & save",
        cancelLabel: "Cancel",
        variant: "destructive"
      });
      if (!ok) return;
      result = await saveSchema(next, { confirmCascade: true });
    }
    if (!(result == null ? void 0 : result.ok)) return;
    if ((result.deletedCount || 0) > 0) {
      try {
        await configCtx.refresh();
      } catch (_) {
      }
    }
    setMode("values");
  };
  const onExport = async () => {
    var _a, _b, _c;
    setExporting(true);
    setIoMsg(null);
    setIoProgress({ phase: "running", done: 0, total: 0, label: "Collecting schema + values from ABDB\u2026" });
    try {
      const response = await callAction(
        props,
        getActionKey("exportConfig"),
        "",
        {}
      );
      const dump = (response == null ? void 0 : response.dump) || ((_a = response == null ? void 0 : response.body) == null ? void 0 : _a.dump);
      if (!dump) throw new Error("Export response missing `dump`");
      setIoProgress((p) => ({ ...p, label: "Building file\u2026" }));
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const filename = `system-config-export-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const c = dump.counts || {};
      setIoProgress({ phase: "done", done: c.values || 0, total: c.values || 0, label: "Export complete" });
      setIoMsg(`\u2713 Exported ${(_b = c.sections) != null ? _b : "?"} section(s) and ${(_c = c.values) != null ? _c : "?"} value(s) \u2192 ${filename}`);
    } catch (e) {
      console.error("Export failed", e);
      setIoProgress({ phase: "error", done: 0, total: 0, label: "Export failed" });
      setIoMsg(`Export failed: ${e.message || e}`);
    } finally {
      setExporting(false);
    }
  };
  const IMPORT_CHUNK_SIZE = 25;
  const onImport = async () => {
    var _a, _b;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);
    const file = await new Promise((resolve) => {
      input.onchange = () => {
        resolve(input.files && input.files[0]);
      };
      input.click();
    });
    document.body.removeChild(input);
    if (!file) return;
    let dump;
    try {
      const text = await file.text();
      dump = JSON.parse(text);
    } catch (e) {
      setIoMsg(`Could not parse "${file.name}": ${e.message}`);
      return;
    }
    const choice = await confirm({
      title: `Import "${file.name}"?`,
      variant: "information",
      body: /* @__PURE__ */ jsxs3("span", { children: [
        "Schema + values from this dump will be applied to the current workspace. website_id / store_id are remapped on the fly by matching",
        /* @__PURE__ */ jsx3("code", { children: " website_code " }),
        " and store ",
        /* @__PURE__ */ jsx3("code", { children: "code" }),
        " against the target environment's Commerce instance."
      ] }),
      choices: [
        {
          label: "Overwrite existing values",
          value: "overwrite",
          variant: "destructive",
          description: "Recommended for restoring a backup. Existing rows are replaced."
        },
        {
          label: "Insert-only",
          value: "insert",
          variant: "information",
          description: "Skip rows that already exist; only add new ones."
        }
      ],
      cancelLabel: "Cancel"
    });
    if (!choice) return;
    const overwrite = choice === "overwrite";
    const allValues = Array.isArray(dump.values) ? dump.values : [];
    const schemaPayload = dump.schema;
    const total = allValues.length;
    setImporting(true);
    setIoMsg(null);
    setIoProgress({
      phase: "running",
      done: 0,
      total,
      label: schemaPayload ? "Importing schema\u2026" : "Importing values\u2026"
    });
    const aggregate = {
      schemaImported: false,
      schemaSkipped: false,
      valuesInserted: 0,
      valuesUpserted: 0,
      valuesSkipped: 0,
      unmappedSkipped: 0,
      unmapped: [],
      invalid: [],
      idMap: null,
      sensitiveReencrypted: 0,
      sensitiveDecryptFailed: 0
    };
    const sensitiveCount = allValues.filter(
      (v) => typeof (v == null ? void 0 : v.value) === "string" && v.value.startsWith("enc:v1:")
    ).length;
    try {
      if (schemaPayload) {
        const r = await callAction(
          props,
          getActionKey("importConfig"),
          "",
          { schema: schemaPayload, overwrite, valuesOnly: false, schemaOnly: true }
        );
        const s = (r == null ? void 0 : r.summary) || ((_a = r == null ? void 0 : r.body) == null ? void 0 : _a.summary);
        if (s) {
          aggregate.schemaImported = !!s.schemaImported;
          aggregate.schemaSkipped = !!s.schemaSkipped;
        }
      }
      const sensitivePaths = Array.isArray(dump.sensitivePaths) ? dump.sensitivePaths : void 0;
      setIoProgress((p) => ({ ...p, label: "Importing values\u2026" }));
      for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
        const chunk = allValues.slice(i, i + IMPORT_CHUNK_SIZE);
        const r = await callAction(
          props,
          getActionKey("importConfig"),
          "",
          {
            values: chunk,
            overwrite,
            valuesOnly: true,
            // Re-encrypt sensitive ciphertext against the target env's key.
            sourceCryptKey: importSourceKey ? importSourceKey.trim() : void 0,
            // sensitivePaths on every chunk so the backend knows what to
            // encrypt even before the schema row lands.
            dump: sensitivePaths ? { sensitivePaths } : void 0
          }
        );
        const s = (r == null ? void 0 : r.summary) || ((_b = r == null ? void 0 : r.body) == null ? void 0 : _b.summary);
        if (s) {
          aggregate.valuesInserted += s.valuesInserted || 0;
          aggregate.valuesUpserted += s.valuesUpserted || 0;
          aggregate.valuesSkipped += s.valuesSkipped || 0;
          aggregate.unmappedSkipped += s.unmappedSkipped || 0;
          aggregate.sensitiveReencrypted += s.sensitiveReencrypted || 0;
          aggregate.sensitiveDecryptFailed += s.sensitiveDecryptFailed || 0;
          if (Array.isArray(s.unmapped)) aggregate.unmapped.push(...s.unmapped);
          if (Array.isArray(s.invalid)) aggregate.invalid.push(...s.invalid);
          if (s.idMap) {
            if (!aggregate.idMap) {
              aggregate.idMap = { ...s.idMap };
            } else {
              aggregate.idMap.matchedByCode = (aggregate.idMap.matchedByCode || 0) + (s.idMap.matchedByCode || 0);
              aggregate.idMap.matchedById = (aggregate.idMap.matchedById || 0) + (s.idMap.matchedById || 0);
            }
          }
        }
        setIoProgress({
          phase: "running",
          done: Math.min(i + chunk.length, total),
          total,
          label: `Importing values\u2026 (${Math.min(i + chunk.length, total)}/${total})`
        });
      }
      const lines = [
        `\u2713 Import complete (${overwrite ? "overwrite" : "insert-only"})`,
        `  Schema: ${aggregate.schemaImported ? "imported" : aggregate.schemaSkipped ? "skipped (exists)" : "no schema in dump"}`,
        `  Values: inserted=${aggregate.valuesInserted}  upserted=${aggregate.valuesUpserted}  skipped=${aggregate.valuesSkipped}`,
        aggregate.unmappedSkipped ? `  \u26A0 Unmapped rows skipped (no matching website_code/store_code in target): ${aggregate.unmappedSkipped}` : "",
        sensitiveCount ? `  Sensitive: ${sensitiveCount} ciphertext row(s) in dump \u2192 re-encrypted=${aggregate.sensitiveReencrypted}, decrypt-failed=${aggregate.sensitiveDecryptFailed}${importSourceKey ? "" : " (no source key provided \u2014 values may show blank if this env's key differs)"}` : "",
        aggregate.invalid.length ? `  \u26A0 Invalid rows: ${aggregate.invalid.length}` : "",
        aggregate.idMap ? [
          `  id remap \u2192 target(${aggregate.idMap.targetSource || "none"}, websites=${aggregate.idMap.targetWebsiteCount || 0}, stores=${aggregate.idMap.targetStoreCount || 0})  matched(by-code=${aggregate.idMap.matchedByCode || 0}, by-id=${aggregate.idMap.matchedById || 0})`,
          !aggregate.idMap.hasTarget ? "  \u26A0 Target env Commerce returned no stores \u2014 check COMMERCE_BASE_URL / OAuth1 secrets in this workspace." : ""
        ].filter(Boolean).join("\n") : ""
      ].filter(Boolean);
      setIoMsg(lines.join("\n"));
      setIoProgress({ phase: "done", done: total, total, label: "Import complete" });
      await refreshSchema();
      try {
        await configCtx.refresh();
      } catch (_) {
      }
    } catch (e) {
      console.error("Import failed", e);
      setIoProgress((p) => ({ ...p, phase: "error", label: "Import failed" }));
      setIoMsg(`Import failed: ${e.message || e}`);
    } finally {
      setImporting(false);
    }
  };
  const onSyncStoreMappings = async () => {
    var _a, _b, _c, _d, _e, _f;
    setSyncingStoreMappings(true);
    setSyncMsg("Fetching websites + store views from Commerce\u2026");
    try {
      const response = await callAction(
        props,
        getActionKey("syncStoreMappings"),
        "",
        {}
      );
      const ok = (_b = response == null ? void 0 : response.ok) != null ? _b : (_a = response == null ? void 0 : response.body) == null ? void 0 : _a.ok;
      const count = (_d = response == null ? void 0 : response.count) != null ? _d : (_c = response == null ? void 0 : response.body) == null ? void 0 : _c.count;
      const mapping = (_f = response == null ? void 0 : response.mapping) != null ? _f : (_e = response == null ? void 0 : response.body) == null ? void 0 : _e.mapping;
      if (!ok) throw new Error("Sync response missing `ok`");
      const sample = mapping ? Object.entries(mapping).slice(0, 5).map(
        ([id, m]) => `  ${id}: ${m.code} \u2192 website ${m.website_code}(${m.website_id}), lang=${m.language_code}`
      ).join("\n") : "";
      setSyncMsg(
        `\u2713 Synced ${count} store(s) \u2192 general/settings/store_mappings
` + (sample ? sample + (count > 5 ? `
  \u2026 (${count - 5} more)` : "") : "")
      );
      try {
        await configCtx.refresh();
      } catch (_) {
      }
    } catch (e) {
      console.error("Store-mapping sync failed", e);
      setSyncMsg(`Sync failed: ${e.message || e}`);
    } finally {
      setSyncingStoreMappings(false);
    }
  };
  return /* @__PURE__ */ jsxs3(
    View2,
    {
      UNSAFE_style: {
        background: PALETTE.bg,
        minHeight: "100vh",
        color: PALETTE.text
      },
      children: [
        confirmDialog,
        /* @__PURE__ */ jsxs3(View2, { padding: "size-400", maxWidth: "1400px", marginX: "auto", children: [
          /* @__PURE__ */ jsx3(
            PageHeader,
            {
              heroRef,
              mode,
              setMode,
              scopeTree,
              scopeTreeForPicker,
              scopeKey,
              onScopeChange,
              onReloadStores: refreshScopeTree,
              onOpenTools: () => setToolsOpen((o) => !o),
              toolsOpen,
              userRole
            }
          ),
          /* @__PURE__ */ jsxs3("div", { style: { paddingTop: 24 }, children: [
            toolsOpen && mode === "values" && /* @__PURE__ */ jsx3(
              ToolsPanel,
              {
                onClose: () => setToolsOpen(false),
                onExport,
                exporting,
                onImport,
                importing,
                ioMsg,
                ioProgress,
                importSourceKey,
                setImportSourceKey,
                onSyncStoreMappings,
                syncingStoreMappings,
                syncMsg
              }
            ),
            schemaLoading ? /* @__PURE__ */ jsx3(Card, { children: /* @__PURE__ */ jsx3(Flex2, { justifyContent: "center", marginY: "size-400", children: /* @__PURE__ */ jsx3(ProgressCircle2, { "aria-label": "Loading schema", isIndeterminate: true }) }) }) : mode === "schema" ? /* @__PURE__ */ jsx3(
              SystemConfigSchemaEditor,
              {
                schema,
                onSave: onSchemaSave,
                onCancel: () => setMode("values"),
                saving: schemaSaving,
                error: schemaError,
                palette: PALETTE
              }
            ) : /* @__PURE__ */ jsx3(
              ValuesView,
              {
                schema,
                onEditSchema: () => setMode("schema"),
                toolsOpen,
                setToolsOpen,
                configCtx,
                callerProps: propsWithRole,
                userRole
              }
            )
          ] })
        ] })
      ]
    }
  );
}

// web/src/pages/index.js
var BUILT_IN_PAGES = {
  "system-config": SystemConfig
};

// web/src/settings.js
var DEFAULT_ACTION_KEYS = {
  commerceRestGet: "CommerceAdminManagement/commerce-rest-get",
  systemConfigList: "CommerceAdminManagement/system-config-list",
  systemConfigSave: "CommerceAdminManagement/system-config-save",
  systemConfigSchema: "CommerceAdminManagement/system-config-schema",
  exportConfig: "CommerceAdminManagement/export-config",
  importConfig: "CommerceAdminManagement/import-config",
  syncStoreMappings: "CommerceAdminManagement/sync-store-mappings-from-commerce",
  commerceConnectionStatus: "CommerceAdminManagement/commerce-connection-status",
  commerceConnectionTest: "CommerceAdminManagement/commerce-connection-test",
  commerceConnectionSave: "CommerceAdminManagement/commerce-connection-save",
  systemConfigBulkSave: "CommerceAdminManagement/system-config-bulk-save"
};
var extensionId = "CommerceAdminManagement";
var actionUrls = {};
var actionKeys = { ...DEFAULT_ACTION_KEYS };
var userRoleProvider = null;
var roleBadgeComponent = null;
function getUserRoleProvider() {
  return userRoleProvider || (() => ({ role: "admin", loading: false, groups: [], profile: null }));
}
function getRoleBadgeComponent() {
  return roleBadgeComponent;
}
var builtinNavItems = Array.isArray(nav_default && nav_default.items) ? nav_default.items : [];
var extraNavItems = [];
var extraPages = {};
function getExtensionId() {
  return extensionId;
}
function getActionKey(name) {
  return actionKeys[name] || name;
}
function getActionUrl(actionKey) {
  if (actionUrls[actionKey]) return actionUrls[actionKey];
  const known = Object.values(actionUrls).find((u) => typeof u === "string" && /\/api\/v1\/web\//.test(u));
  if (known) {
    const m = String(known).match(/^(https?:\/\/[^/]+\/api\/v1\/web\/)/);
    if (m) return m[1] + actionKey;
  }
  return void 0;
}
function getNavItems() {
  const byId = /* @__PURE__ */ new Map();
  const clone = (it) => ({ ...it, children: Array.isArray(it.children) ? it.children.map((c) => ({ ...c })) : void 0 });
  for (const it of builtinNavItems) byId.set(it.id, clone(it));
  for (const it of extraNavItems) byId.set(it.id, { ...byId.get(it.id), ...clone(it) });
  const all = Array.from(byId.values());
  const topLevel = [];
  for (const it of all) {
    if (it.parentId && byId.has(it.parentId)) {
      const parent = byId.get(it.parentId);
      parent.children = Array.isArray(parent.children) ? parent.children : [];
      if (!parent.children.some((c) => c.id === it.id)) {
        const { parentId, ...leaf } = it;
        parent.children.push(leaf);
      }
    } else {
      topLevel.push(it);
    }
  }
  return topLevel;
}
function flattenNavItems(items = getNavItems()) {
  const out = [];
  for (const it of items || []) {
    if (Array.isArray(it.children) && it.children.length) {
      for (const c of it.children) {
        if (c && c.id && c.path) out.push({ ...c, parentId: it.id });
      }
    } else if (it && it.id && it.path) {
      out.push(it);
    }
  }
  return out;
}
function getPageComponent(id) {
  if (extraPages && extraPages[id]) return extraPages[id];
  return BUILT_IN_PAGES[id] || null;
}
function configureWeb({
  extensionId: nextExtensionId,
  actionUrls: nextActionUrls,
  actionKeys: nextActionKeys,
  extraNav: nextExtraNav,
  extraPages: nextExtraPages,
  userRoleProvider: nextUserRoleProvider,
  roleBadge: nextRoleBadge
} = {}) {
  if (typeof nextUserRoleProvider === "function") userRoleProvider = nextUserRoleProvider;
  if (nextRoleBadge != null) roleBadgeComponent = nextRoleBadge;
  if (nextExtensionId != null) {
    extensionId = String(nextExtensionId);
  }
  if (nextActionUrls) {
    actionUrls = { ...nextActionUrls };
  }
  if (nextActionKeys) {
    actionKeys = { ...actionKeys, ...nextActionKeys };
  }
  if (Array.isArray(nextExtraNav)) {
    const byId = new Map(extraNavItems.map((it) => [it.id, it]));
    for (const it of nextExtraNav) {
      if (it && it.id && (it.path || Array.isArray(it.children) && it.children.length)) {
        byId.set(it.id, it);
      }
    }
    extraNavItems = Array.from(byId.values());
  }
  if (nextExtraPages && typeof nextExtraPages === "object") {
    extraPages = { ...extraPages, ...nextExtraPages };
  }
}

// web/src/components/AppSectionNav.js
import React2, { useEffect as useEffect6, useRef as useRef3, useState as useState6, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Provider, lightTheme } from "@adobe/react-spectrum";
import { useLocation, useNavigate } from "react-router-dom";
import ChevronDown2 from "@spectrum-icons/workflow/ChevronDown";

// web/src/nav-icons.js
import Settings2 from "@spectrum-icons/workflow/Settings";
import Properties from "@spectrum-icons/workflow/Properties";
import Data from "@spectrum-icons/workflow/Data";
import User from "@spectrum-icons/workflow/User";
import ShoppingCart from "@spectrum-icons/workflow/ShoppingCart";
import Box from "@spectrum-icons/workflow/Box";
import Folder from "@spectrum-icons/workflow/Folder";
var NAV_ICONS = {
  Settings: Settings2,
  Properties,
  Data,
  User,
  ShoppingCart,
  Box,
  Folder
};
function getNavIcon(name) {
  return NAV_ICONS[name] || Settings2;
}

// web/src/components/AppSectionNav.js
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function AppSectionNav({ rightSlot } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = getNavItems();
  const activeId = (() => {
    var _a;
    for (const it of items) {
      if (Array.isArray(it.children)) {
        for (const c of it.children) {
          if (c.path === location.pathname) return it.id;
        }
      } else if (it.path === location.pathname) {
        return it.id;
      }
    }
    return (_a = items[0]) == null ? void 0 : _a.id;
  })();
  return /* @__PURE__ */ jsxs4("div", { className: "sm-tab-bar", children: [
    /* @__PURE__ */ jsx4("div", { className: "sm-tab-bar__track", role: "tablist", "aria-label": "Application sections", children: items.map((item) => {
      if (Array.isArray(item.children) && item.children.length) {
        return /* @__PURE__ */ jsx4(
          ParentTab,
          {
            item,
            isActive: item.id === activeId,
            activePath: location.pathname,
            onSelect: (path) => navigate(path)
          },
          item.id
        );
      }
      return /* @__PURE__ */ jsx4(
        LeafTab,
        {
          item,
          isActive: item.id === activeId,
          onSelect: () => navigate(item.path)
        },
        item.id
      );
    }) }),
    rightSlot ? /* @__PURE__ */ jsx4("div", { className: "sm-tab-bar__actions", children: rightSlot }) : null
  ] });
}
function LeafTab({ item, isActive, onSelect }) {
  const Icon = getNavIcon(item.icon);
  return /* @__PURE__ */ jsxs4(
    "button",
    {
      type: "button",
      role: "tab",
      "aria-selected": isActive,
      className: `sm-tab${isActive ? " is-active" : ""}`,
      onClick: () => {
        if (!isActive) onSelect();
      },
      children: [
        /* @__PURE__ */ jsx4("span", { className: "sm-tab__icon", children: /* @__PURE__ */ jsx4(Icon, { size: "XS" }) }),
        item.label
      ]
    }
  );
}
function ParentTab({ item, isActive, activePath, onSelect }) {
  const Icon = getNavIcon(item.icon);
  const [open, setOpen] = useState6(false);
  const [position, setPosition] = useState6({ top: 0, left: 0 });
  const triggerRef = useRef3(null);
  const menuRef = useRef3(null);
  const recompute = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPosition({ top: r.bottom + 6, left: r.left });
  };
  useLayoutEffect(() => {
    if (open) recompute();
  }, [open]);
  useEffect6(() => {
    if (!open) return void 0;
    const onDocClick = (e) => {
      const t = e.target;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScrollOrResize = () => recompute();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);
  const trigger = /* @__PURE__ */ jsxs4(
    "button",
    {
      ref: triggerRef,
      type: "button",
      role: "tab",
      "aria-haspopup": "menu",
      "aria-expanded": open,
      "aria-selected": isActive,
      className: `sm-tab sm-tab--parent${isActive ? " is-active" : ""}${open ? " is-open" : ""}`,
      onClick: () => setOpen((o) => !o),
      children: [
        /* @__PURE__ */ jsx4("span", { className: "sm-tab__icon", children: /* @__PURE__ */ jsx4(Icon, { size: "XS" }) }),
        item.label,
        /* @__PURE__ */ jsx4("span", { className: "sm-tab__chevron", "aria-hidden": "true", children: /* @__PURE__ */ jsx4(ChevronDown2, { size: "XS" }) })
      ]
    }
  );
  const menu = open ? createPortal(
    /* @__PURE__ */ jsx4(Provider, { theme: lightTheme, colorScheme: "light", UNSAFE_className: "sm-submenu-portal-host", children: /* @__PURE__ */ jsx4(
      "div",
      {
        ref: menuRef,
        className: "sm-submenu sm-submenu--portal",
        role: "menu",
        "aria-label": `${item.label} submenu`,
        style: { top: position.top, left: position.left },
        children: item.children.map((c) => {
          const ChildIcon = getNavIcon(c.icon);
          const childActive = c.path === activePath;
          return /* @__PURE__ */ jsxs4(
            "button",
            {
              type: "button",
              role: "menuitem",
              className: `sm-submenu__item${childActive ? " is-active" : ""}`,
              onClick: () => {
                setOpen(false);
                onSelect(c.path);
              },
              children: [
                /* @__PURE__ */ jsx4("span", { className: "sm-submenu__icon", children: /* @__PURE__ */ jsx4(ChildIcon, { size: "XS" }) }),
                /* @__PURE__ */ jsx4("span", { className: "sm-submenu__label", children: c.label })
              ]
            },
            c.id
          );
        })
      }
    ) }),
    document.body
  ) : null;
  return /* @__PURE__ */ jsxs4(Fragment3, { children: [
    trigger,
    menu
  ] });
}

// web/src/components/CommerceSetupWizard.js
import React3, { useMemo as useMemo4, useState as useState7 } from "react";
import {
  View as View3,
  Flex as Flex3,
  Heading as Heading3,
  Text as Text3,
  TextField as TextField3,
  Button as Button3,
  ButtonGroup as ButtonGroup2,
  ProgressCircle as ProgressCircle3,
  StatusLight as StatusLight2,
  Divider as Divider3,
  Form,
  Well as Well3,
  Radio,
  RadioGroup
} from "@adobe/react-spectrum";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var FIELD_DEFS = {
  paas: [
    { key: "baseUrl", label: "Commerce base URL", placeholder: "https://store.example.com/", type: "text" },
    { key: "consumerKey", label: "Consumer key", placeholder: "", type: "text" },
    { key: "consumerSecret", label: "Consumer secret", placeholder: "", type: "password" },
    { key: "accessToken", label: "Access token", placeholder: "", type: "text" },
    { key: "accessTokenSecret", label: "Access token secret", placeholder: "", type: "password" }
  ],
  saas: [
    {
      key: "baseUrl",
      label: "Commerce REST base URL (api host + tenant id)",
      placeholder: "https://na1-sandbox.api.commerce.adobe.com/<tenant-id>/",
      type: "text"
    },
    {
      key: "apiKey",
      label: "IMS API key (optional)",
      placeholder: "Defaults to workspace OAUTH_CLIENT_ID",
      type: "text",
      optional: true
    }
  ]
};
function emptyValues(type) {
  return FIELD_DEFS[type].reduce((a, f) => {
    a[f.key] = "";
    return a;
  }, {});
}
function CommerceSetupWizard({ runtime, ims, initial, onCompleted, onCancel, decryptFailed }) {
  const [connectionType, setConnectionType] = useState7(
    initial && initial.connectionType === "saas" ? "saas" : "paas"
  );
  const [values, setValues] = useState7(() => ({
    ...emptyValues(connectionType),
    ...initial && initial.baseUrl ? { baseUrl: initial.baseUrl } : {}
  }));
  const [testState, setTestState] = useState7({ status: "idle", message: "" });
  const [saveState, setSaveState] = useState7({ status: "idle", message: "" });
  const fields = FIELD_DEFS[connectionType];
  const requiredKeys = useMemo4(
    () => fields.filter((f) => !f.optional).map((f) => f.key),
    [fields]
  );
  const allFilled = requiredKeys.every((k) => String(values[k] || "").trim() !== "");
  const onTypeChange = (next) => {
    setConnectionType(next);
    setValues((prev) => ({ ...emptyValues(next), baseUrl: prev.baseUrl || "" }));
    setTestState({ status: "idle", message: "" });
    setSaveState({ status: "idle", message: "" });
  };
  const set = (k) => (v) => setValues((prev) => ({ ...prev, [k]: v }));
  async function handleTest() {
    setTestState({ status: "running", message: "Testing connection\u2026" });
    try {
      const res = await callAction(
        { runtime, ims },
        getActionKey("commerceConnectionTest"),
        "",
        { connectionType, ...values }
      );
      const body = res && res.body ? res.body : res;
      if (body && body.ok) {
        setTestState({ status: "ok", message: body.message || "Connection OK" });
      } else {
        setTestState({ status: "fail", message: body && body.message || "Connection failed" });
      }
    } catch (e) {
      setTestState({ status: "fail", message: e.message || "Connection failed" });
    }
  }
  async function handleSave() {
    setSaveState({ status: "running", message: "Saving\u2026" });
    try {
      const res = await callAction(
        { runtime, ims },
        getActionKey("commerceConnectionSave"),
        "",
        { connectionType, ...values }
      );
      const body = res && res.body ? res.body : res;
      if (body && body.ok && body.saved) {
        setSaveState({ status: "ok", message: "Saved. Loading the rest of the app\u2026" });
        if (typeof onCompleted === "function") onCompleted(body);
      } else {
        setSaveState({ status: "fail", message: body && body.message || "Save failed" });
      }
    } catch (e) {
      setSaveState({ status: "fail", message: e.message || "Save failed" });
    }
  }
  const testLight = testState.status === "ok" ? "positive" : testState.status === "fail" ? "negative" : testState.status === "running" ? "notice" : "neutral";
  return /* @__PURE__ */ jsxs5(View3, { padding: "size-400", maxWidth: "size-6000", margin: "0 auto", children: [
    /* @__PURE__ */ jsx5(Heading3, { level: 2, children: "Connect to Adobe Commerce" }),
    decryptFailed ? /* @__PURE__ */ jsx5(Well3, { marginBottom: "size-200", UNSAFE_style: { borderColor: "#b58105" }, children: /* @__PURE__ */ jsxs5(Text3, { UNSAFE_style: { color: "#92400e" }, children: [
      /* @__PURE__ */ jsx5("strong", { children: "Existing credentials couldn't be decrypted." }),
      " ",
      "They were encrypted with a different ",
      /* @__PURE__ */ jsx5("code", { children: "SYSTEM_CONFIG_CRYPT_KEY" }),
      " ",
      "than is configured now. Re-enter them below \u2014 the old record will be replaced on save."
    ] }) }) : /* @__PURE__ */ jsx5(Text3, { children: "Enter the REST/OAuth credentials for your Commerce instance. They are encrypted before being saved to App Builder Database. The rest of the app stays disabled until the connection is verified." }),
    /* @__PURE__ */ jsx5(Divider3, { size: "S", marginY: "size-300" }),
    /* @__PURE__ */ jsxs5(Form, { labelPosition: "top", necessityIndicator: "icon", children: [
      /* @__PURE__ */ jsxs5(
        RadioGroup,
        {
          label: "Integration type",
          value: connectionType,
          onChange: onTypeChange,
          orientation: "vertical",
          children: [
            /* @__PURE__ */ jsx5(Radio, { value: "paas", children: "OAuth 1.0a (PaaS / on-prem)" }),
            /* @__PURE__ */ jsx5(Radio, { value: "saas", children: "IMS OAuth (Adobe Commerce as a Cloud Service)" })
          ]
        }
      ),
      connectionType === "saas" && /* @__PURE__ */ jsx5(
        View3,
        {
          marginTop: "size-100",
          paddingX: "size-200",
          paddingY: "size-150",
          UNSAFE_style: {
            background: "#f3f4f6",
            border: "1px solid #e5e7eb",
            borderRadius: 8
          },
          children: /* @__PURE__ */ jsxs5(Text3, { UNSAFE_style: { fontSize: 13, color: "#374151" }, children: [
            "ACCS uses the workspace IMS Server-to-Server credential (with the",
            " ",
            /* @__PURE__ */ jsx5("code", { children: "commerce.accs" }),
            " scope). Use the ",
            /* @__PURE__ */ jsx5("strong", { children: "api" }),
            " host",
            " ",
            "(e.g. ",
            /* @__PURE__ */ jsx5("code", { children: "na1-sandbox.api.commerce.adobe.com" }),
            "), ",
            /* @__PURE__ */ jsx5("strong", { children: "not" }),
            " the",
            " ",
            /* @__PURE__ */ jsx5("code", { children: "admin.*" }),
            " URL, and include the tenant id segment as a",
            " ",
            "path prefix. The ",
            /* @__PURE__ */ jsx5("code", { children: "OAUTH_CLIENT_ID" }),
            "/",
            /* @__PURE__ */ jsx5("code", { children: "SECRET" }),
            "/",
            /* @__PURE__ */ jsx5("code", { children: "ORG_ID" }),
            " ",
            "in ",
            /* @__PURE__ */ jsx5("code", { children: ".env" }),
            " mint the bearer token."
          ] })
        }
      ),
      fields.map((f) => /* @__PURE__ */ jsx5(
        TextField3,
        {
          label: f.label,
          placeholder: f.placeholder,
          type: f.type === "password" ? "password" : "text",
          value: values[f.key] || "",
          onChange: set(f.key),
          autoComplete: "off",
          isRequired: !f.optional,
          width: "100%"
        },
        f.key
      ))
    ] }),
    /* @__PURE__ */ jsxs5(View3, { marginTop: "size-300", children: [
      /* @__PURE__ */ jsxs5(Flex3, { alignItems: "center", gap: "size-200", wrap: true, children: [
        /* @__PURE__ */ jsxs5(ButtonGroup2, { children: [
          /* @__PURE__ */ jsx5(Button3, { variant: "secondary", onPress: handleTest, isDisabled: !allFilled || testState.status === "running", children: testState.status === "running" ? "Testing\u2026" : "Test connection" }),
          /* @__PURE__ */ jsx5(
            Button3,
            {
              variant: "cta",
              onPress: handleSave,
              isDisabled: !allFilled || testState.status === "running" || saveState.status === "running",
              children: saveState.status === "running" ? "Saving\u2026" : "Save & continue"
            }
          ),
          onCancel ? /* @__PURE__ */ jsx5(Button3, { variant: "secondary", onPress: onCancel, children: "Cancel" }) : null
        ] }),
        testState.status !== "idle" && /* @__PURE__ */ jsxs5(Flex3, { alignItems: "center", gap: "size-100", children: [
          testState.status === "running" && /* @__PURE__ */ jsx5(ProgressCircle3, { size: "S", isIndeterminate: true, "aria-label": "Testing" }),
          /* @__PURE__ */ jsx5(StatusLight2, { variant: testLight, children: testState.message })
        ] })
      ] }),
      saveState.status === "fail" && /* @__PURE__ */ jsx5(View3, { marginTop: "size-150", children: /* @__PURE__ */ jsx5(StatusLight2, { variant: "negative", children: saveState.message }) }),
      saveState.status === "ok" && /* @__PURE__ */ jsx5(View3, { marginTop: "size-150", children: /* @__PURE__ */ jsx5(StatusLight2, { variant: "positive", children: saveState.message }) })
    ] })
  ] });
}

// web/src/components/MainPage.js
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var MainPage = (props) => {
  const location = useLocation2();
  const [status, setStatus] = useState8("unknown");
  const [maskedCreds, setMaskedCreds] = useState8(null);
  const [error, setError] = useState8(null);
  const [reconfiguring, setReconfiguring] = useState8(false);
  const [decryptFailed, setDecryptFailed] = useState8(false);
  const fetchStatus = useCallback5(async () => {
    try {
      const res = await callAction(
        props,
        getActionKey("commerceConnectionStatus"),
        "",
        { fresh: true }
      );
      const body = res && res.body ? res.body : res;
      setMaskedCreds(body && body.creds ? body.creds : null);
      setDecryptFailed(!!(body && body.decryptFailed));
      setStatus(body && body.configured ? "configured" : "unconfigured");
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load Commerce connection status");
      setStatus("error");
    }
  }, [props]);
  useEffect7(() => {
    fetchStatus();
    if (props.ims.token) return;
    let cancelled = false;
    const handshake = Promise.race([
      attach({ id: getExtensionId() }).then((gc) => {
        var _a, _b;
        return {
          token: (_a = gc == null ? void 0 : gc.sharedContext) == null ? void 0 : _a.get("imsToken"),
          org: (_b = gc == null ? void 0 : gc.sharedContext) == null ? void 0 : _b.get("imsOrgId")
        };
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 2e3))
    ]);
    handshake.then((res) => {
      if (cancelled || !res) return;
      if (res.token) props.ims.token = res.token;
      if (res.org) props.ims.org = res.org;
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [fetchStatus]);
  if (status === "unknown") {
    return /* @__PURE__ */ jsx6(Flex4, { alignItems: "center", justifyContent: "center", height: "size-3000", children: /* @__PURE__ */ jsxs6(Flex4, { direction: "column", alignItems: "center", gap: "size-150", children: [
      /* @__PURE__ */ jsx6(ProgressCircle4, { size: "L", isIndeterminate: true, "aria-label": "Loading" }),
      /* @__PURE__ */ jsx6(Text4, { children: "Checking Commerce connection\u2026" })
    ] }) });
  }
  if (status === "error") {
    return /* @__PURE__ */ jsxs6(View4, { padding: "size-400", children: [
      /* @__PURE__ */ jsxs6(IllustratedMessage, { children: [
        /* @__PURE__ */ jsx6(Heading4, { children: "Could not load connection status" }),
        /* @__PURE__ */ jsx6(Text4, { children: error })
      ] }),
      /* @__PURE__ */ jsx6(Flex4, { marginTop: "size-200", justifyContent: "center", children: /* @__PURE__ */ jsx6(Button4, { variant: "cta", onPress: fetchStatus, children: "Retry" }) })
    ] });
  }
  if (status === "unconfigured" || reconfiguring) {
    return /* @__PURE__ */ jsx6(
      CommerceSetupWizard,
      {
        runtime: props.runtime,
        ims: props.ims,
        initial: maskedCreds,
        decryptFailed,
        onCompleted: () => {
          setReconfiguring(false);
          setDecryptFailed(false);
          fetchStatus();
        },
        onCancel: reconfiguring ? () => setReconfiguring(false) : void 0
      }
    );
  }
  const leaves = flattenNavItems();
  const match = leaves.find((it) => it.path === location.pathname) || leaves[0];
  const Page = match ? getPageComponent(match.id) : null;
  const pageFallback = ({ error: error2 }) => /* @__PURE__ */ jsxs6(View4, { padding: "size-400", children: [
    /* @__PURE__ */ jsx6(Heading4, { level: 3, children: "This page crashed" }),
    /* @__PURE__ */ jsxs6(Text4, { children: [
      match ? `Error in page "${match.id}": ` : "",
      error2 && error2.message ? error2.message : String(error2)
    ] })
  ] });
  const renderRightSlot = () => {
    const RoleBadge = getRoleBadgeComponent();
    return /* @__PURE__ */ jsxs6(Flex4, { gap: "size-100", alignItems: "center", children: [
      RoleBadge ? /* @__PURE__ */ jsx6(RoleBadge, { runtime: props.runtime, ims: props.ims }) : null,
      /* @__PURE__ */ jsx6(Button4, { variant: "secondary", onPress: () => setReconfiguring(true), children: "Reconfigure Commerce" })
    ] });
  };
  return /* @__PURE__ */ jsxs6(View4, { UNSAFE_style: { overflowX: "clip" }, children: [
    /* @__PURE__ */ jsx6(AppSectionNav, { rightSlot: renderRightSlot() }),
    /* @__PURE__ */ jsx6(View4, { children: Page ? /* @__PURE__ */ jsx6(ErrorBoundary, { FallbackComponent: pageFallback, children: /* @__PURE__ */ jsx6(Page, { runtime: props.runtime, ims: props.ims }) }) : /* @__PURE__ */ jsx6(View4, { padding: "size-400", children: /* @__PURE__ */ jsx6(Text4, { children: "No page registered for this route." }) }) })
  ] });
};

// web/src/components/ExtensionRegistration.js
import { useEffect as useEffect8 } from "react";
import { jsx as jsx7 } from "react/jsx-runtime";
function ExtensionRegistration(props) {
  useEffect8(() => {
    (async () => {
      await register({
        id: getExtensionId(),
        methods: {}
      });
    })();
  }, []);
  return /* @__PURE__ */ jsx7(MainPage, { ims: props.ims, runtime: props.runtime });
}

// web/src/components/App.js
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function App(props) {
  props.runtime.on("configuration", ({ imsOrg, imsToken }) => {
    console.log("configuration change", { imsOrg, imsToken });
  });
  return /* @__PURE__ */ jsx8(ErrorBoundary2, { onError, FallbackComponent: fallbackComponent, children: /* @__PURE__ */ jsx8(HashRouter, { children: /* @__PURE__ */ jsx8(
    Provider2,
    {
      theme: lightTheme2,
      colorScheme: "light",
      UNSAFE_className: "sm-provider",
      children: /* @__PURE__ */ jsx8(Routes, { children: /* @__PURE__ */ jsx8(
        Route,
        {
          path: "*",
          element: /* @__PURE__ */ jsx8(ExtensionRegistration, { runtime: props.runtime, ims: props.ims })
        }
      ) })
    }
  ) }) });
  function onError(e, componentStack) {
  }
  function fallbackComponent({ componentStack, error }) {
    return /* @__PURE__ */ jsxs7(React5.Fragment, { children: [
      /* @__PURE__ */ jsx8("h1", { style: { textAlign: "center", marginTop: "20px" }, children: "Something went wrong :(" }),
      /* @__PURE__ */ jsx8("pre", { children: componentStack + "\n" + error.message })
    ] });
  }
}
var App_default = App;
export {
  App_default as App,
  AppSectionNav,
  BUILT_IN_PAGES,
  App_default as CommerceAdminManagementApp,
  DEFAULT_ACTION_KEYS,
  ExtensionRegistration,
  FIELD_TYPES,
  FONT,
  MainPage,
  NAV_ICONS,
  PALETTE,
  RADIUS,
  SCOPES,
  SHADOW,
  SPACE,
  SystemConfig,
  SystemConfigSchemaEditor,
  THEME,
  buildStoreMappingsFromCommercePayload,
  callAction,
  coerceDefault,
  configureWeb,
  emptySchema,
  flattenFields,
  getActionKey,
  getExtensionId,
  getFieldPath,
  getNavIcon,
  getNavItems,
  getPageComponent,
  getUserRoleProvider,
  isFieldSensitive,
  isFieldVisibleAtScope,
  nextSortOrder,
  renumberSortOrder,
  resolveActor,
  sortByOrder,
  useConfirm,
  useSystemConfig,
  useSystemConfigSchema,
  validateFieldValue,
  validateSchema
};
