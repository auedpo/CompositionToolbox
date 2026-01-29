// Purpose: draftIdentity.js provides exports: buildDraftKey, stableStringifyPayload.
// Interacts with: no imports.
// Role: core domain layer module within the broader app graph.
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function fnv1aHash(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildDraftKey(payload) {
  const serialized = stableStringify(payload);
  return `draft_${fnv1aHash(serialized)}`;
}

export function stableStringifyPayload(payload) {
  return stableStringify(payload);
}
