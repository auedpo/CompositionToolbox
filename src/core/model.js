import { newId } from "./ids.js";

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

function coerceSummary(summary) {
  if (typeof summary === "string") return summary;
  if (summary && typeof summary === "object") {
    const title = summary.title ? String(summary.title) : "";
    const description = summary.description ? String(summary.description) : "";
    if (title && description) return `${title} - ${description}`;
    if (title) return title;
    if (description) return description;
  }
  return "";
}

export function assertIsPayloadList(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Payload must be an array.");
  }
}

export function normalizePayload(payload) {
  if (payload === undefined) {
    console.warn("Payload was undefined; defaulting to empty list.");
    return [];
  }
  if (payload === null) {
    console.warn("Payload was null; defaulting to empty list.");
    return [];
  }
  if (Array.isArray(payload)) return payload;
  console.warn("Payload was not an array; wrapping in list.", payload);
  return [payload];
}

export function hashParams(obj) {
  return stableStringify(obj || {});
}

export function makeDraft({ lensType, lensInstanceId, payload, summary, provenance, subtype }) {
  const createdAt = provenance && Number.isFinite(provenance.createdAt)
    ? provenance.createdAt
    : Date.now();
  const normalized = normalizePayload(payload);
  return {
    draftId: newId("draft"),
    lensInstanceId,
    type: lensType,
    subtype: subtype || undefined,
    payload: normalized,
    summary: coerceSummary(summary),
    provenance: provenance && typeof provenance === "object" ? { ...provenance } : {},
    createdAt
  };
}

export function makeMaterialFromDraft(draft, { name, tags, meta } = {}) {
  const createdAt = Date.now();
  const safeTags = Array.isArray(tags) ? tags.slice() : [];
  const safeMeta = meta && typeof meta === "object" ? { ...meta } : {};
  const summary = typeof draft.summary === "string" ? draft.summary : "";
  const materialName = name || summary || `${draft.type} material`;
  return {
    materialId: newId("mat"),
    type: draft.type,
    subtype: draft.subtype || undefined,
    name: materialName,
    payload: normalizePayload(draft.payload),
    summary,
    tags: safeTags,
    meta: safeMeta,
    provenance: {
      ...(draft.provenance && typeof draft.provenance === "object" ? draft.provenance : {}),
      sourceDraftId: draft.draftId
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
