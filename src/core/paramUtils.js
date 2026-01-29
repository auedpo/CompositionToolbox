// Purpose: paramUtils.js provides exports: updateSpecValue.
// Interacts with: no imports.
// Role: core domain layer module within the broader app graph.
function normalizeListInput(value, kind) {
  if (Array.isArray(value)) return value.slice();
  if (typeof value === "string") {
    const parts = value.split(/[,\s]+/).filter(Boolean);
    if (kind === "list:int") {
      return parts.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v));
    }
    if (kind === "list:number") {
      return parts.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    }
  }
  return [];
}

function normalizeSpecValue(spec, value) {
  if (spec.kind === "list:int" || spec.kind === "list:number") {
    return normalizeListInput(value, spec.kind);
  }
  if (spec.kind === "int") {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return spec.default;
    return parsed;
  }
  if (spec.kind === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return spec.default;
    return parsed;
  }
  if (spec.kind === "bool") {
    return Boolean(value);
  }
  return value;
}

export function updateSpecValue(state, specs, key, value) {
  const spec = (specs || []).find((entry) => entry.key === key);
  if (!spec) return;
  state[key] = normalizeSpecValue(spec, value);
}
