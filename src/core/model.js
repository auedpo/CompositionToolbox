// Purpose: model.js provides exports: hashParams, makeClipFromMaterial, makeMaterialFromDraft.
// Interacts with: imports: ./ids.js, ./invariants.js.
// Role: core domain layer module within the broader app graph.
import { newId } from "./ids.js";
import { assertNumericTree } from "./invariants.js";

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

export function hashParams(obj) {
  return stableStringify(obj || {});
}

export function makeMaterialFromDraft(draft, { name, tags, meta } = {}) {
  const createdAt = Date.now();
  const safeTags = Array.isArray(tags) ? tags.slice() : [];
  const safeMeta = meta && typeof meta === "object" ? { ...meta } : {};
  const summary = typeof draft.summary === "string" ? draft.summary : "";
  const materialName = name || summary || `${draft.type} material`;
  const values = draft && draft.payload ? draft.payload.values : undefined;
  assertNumericTree(values, `material:${materialName}`);
  const metaProvenance = draft.meta && typeof draft.meta === "object"
    && draft.meta.provenance && typeof draft.meta.provenance === "object"
    ? { ...draft.meta.provenance }
    : {};
  return {
    materialId: newId("mat"),
    type: draft.type,
    subtype: draft.subtype || undefined,
    name: materialName,
    payload: values,
    summary,
    tags: safeTags,
    meta: safeMeta,
    provenance: {
      ...metaProvenance,
      sourceDraftId: draft.draftId,
      lensId: draft.lensId,
      lensInstanceId: draft.lensInstanceId
    },
    createdAt
  };
}

export function makeClipFromMaterial(materialId, { laneId, start, duration, clipLocalTransforms } = {}) {
  const createdAt = Date.now();
  return {
    clipId: newId("clip"),
    materialId,
    laneId: Number.isFinite(laneId) ? laneId : 0,
    start: Number.isFinite(start) ? start : 0,
    duration: Number.isFinite(duration) ? duration : 1,
    clipLocalTransforms: clipLocalTransforms || null,
    createdAt
  };
}
