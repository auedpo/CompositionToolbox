// Purpose: paramSchemaTypes.js provides exports: booleanField, createParamSchema, enumField, numberField, SCHEMA_VERSION... (+1 more).
// Interacts with: no imports.
// Role: lens domain layer module within the broader app graph.
const SCHEMA_VERSION = 1;

export { SCHEMA_VERSION };

export function createParamSchema(fields = []) {
  return {
    version: SCHEMA_VERSION,
    fields: Array.isArray(fields) ? fields.slice() : []
  };
}

export function booleanField({ key, label, help } = {}) {
  return { key, type: "boolean", label, help };
}

export function numberField({ key, label, min, max, step, help } = {}) {
  const field = { key, type: "number", label, help };
  if (Number.isFinite(min)) field.min = min;
  if (Number.isFinite(max)) field.max = max;
  if (Number.isFinite(step)) field.step = step;
  return field;
}

export function enumField({ key, label, options, help } = {}) {
  return {
    key,
    type: "enum",
    label,
    help,
    options: Array.isArray(options) ? options.slice() : []
  };
}

export function typedListField({
  label,
  sourceKey,
  targetKey,
  parserId,
  commit,
  debounceMs,
  help
} = {}) {
  const field = {
    type: "typedList",
    label,
    sourceKey,
    targetKey,
    parserId,
    commit,
    help
  };
  if (Number.isFinite(debounceMs)) field.debounceMs = debounceMs;
  return field;
}
