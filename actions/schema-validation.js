"use strict";
/*
Copyright 2025 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0
*/
Object.defineProperty(exports, "__esModule", { value: true });
// CommonJS twin of web/src/schema/systemConfigSchema.js validateFieldValue.
// Kept deliberately small — actions run in OpenWhisk with a strict cold-start
// budget, so we don't want to drag in the whole web schema module here.
//
// Keep the two implementations behaviourally identical. The browser form
// catches violations early; this layer is the authoritative gate that
// refuses bad writes regardless of which client (UI, CLI, webhook) sent them.
function fieldLabel(field) {
    return (field && (field.label || field.id)) || 'field';
}
function isEmpty(value) {
    return value == null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
}
function validateFieldValue(field, value) {
    if (!field)
        return null;
    const v = field.validation || {};
    if (v.required && isEmpty(value)) {
        return `${fieldLabel(field)} is required`;
    }
    if (isEmpty(value))
        return null;
    if (field.type === 'number') {
        const n = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(n))
            return `${fieldLabel(field)} must be a number`;
        if (v.min != null && n < v.min)
            return `${fieldLabel(field)} must be ≥ ${v.min}`;
        if (v.max != null && n > v.max)
            return `${fieldLabel(field)} must be ≤ ${v.max}`;
    }
    else if (typeof value === 'string') {
        if (v.minLength != null && value.length < v.minLength) {
            return `${fieldLabel(field)} must be at least ${v.minLength} characters`;
        }
        if (v.maxLength != null && value.length > v.maxLength) {
            return `${fieldLabel(field)} must be at most ${v.maxLength} characters`;
        }
        if (v.pattern) {
            try {
                const re = new RegExp(v.pattern);
                if (!re.test(value)) {
                    return v.patternMessage || `${fieldLabel(field)} does not match the required pattern`;
                }
            }
            catch (_) {
                /* malformed regex in schema — skip */
            }
        }
    }
    if (Array.isArray(v.enum) && v.enum.length && !v.enum.includes(value)) {
        return `${fieldLabel(field)} must be one of: ${v.enum.join(', ')}`;
    }
    const acceptsJsonFormat = field.type === 'text' || field.type === 'textarea' || field.type === 'password';
    if (v.format === 'json' && acceptsJsonFormat && typeof value === 'string') {
        try {
            JSON.parse(value);
        }
        catch (_) {
            return `${fieldLabel(field)} must be valid JSON`;
        }
    }
    return null;
}
/**
 * Build a `path → field` index from a schema document so the save action
 * can validate without traversing the schema for every incoming path.
 */
function indexSchemaByPath(schema) {
    const idx = new Map();
    if (!schema || !Array.isArray(schema.sections))
        return idx;
    for (const section of schema.sections) {
        for (const group of (section.groups || [])) {
            for (const field of (group.fields || [])) {
                idx.set(`${section.id}/${group.id}/${field.id}`, field);
            }
        }
    }
    return idx;
}
module.exports = {
    validateFieldValue,
    indexSchemaByPath
};
