// Purpose: invariants.js provides exports: assertClip, assertDraft, assertDraftKeys, assertMaterial, assertNumericTree... (+6 more).
// Interacts with: imports: ./ids.js.
// Role: core domain layer module within the broader app graph.
import { newId } from "./ids.js";

export class DraftInvariantError extends Error {
  constructor(message) {
    super(message);
    this.name = "DraftInvariantError";
  }
}

export function invariant(condition, message) {
  if (condition) return;
  throw new Error(message || "Invariant failed.");
}

function formatContext(contextString) {
  return contextString ? ` Context: ${contextString}` : "";
}

function describeValue(value) {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return String(value);
}

function valueTypeLabel(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function findNumericTreeError(value, path) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const child = value[i];
      const childPath = `${path}[${i}]`;
      const err = findNumericTreeError(child, childPath);
      if (err) return err;
    }
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { path, value, reason: "non-finite" };
    }
    return null;
  }
  return { path, value, reason: "type" };
}

export function isNumericTree(value) {
  return !findNumericTreeError(value, "values");
}

export function assertNumericTree(value, contextString) {
  const err = findNumericTreeError(value, "values");
  if (!err) return;
  const typeLabel = valueTypeLabel(err.value);
  const valueLabel = describeValue(err.value);
  const message = `Invalid numeric tree at ${err.path}: expected finite number or array, got ${typeLabel} ${valueLabel}.${formatContext(contextString)}`;
  throw new DraftInvariantError(message);
}

export function normalizeToNumericTree(value, contextString) {
  assertNumericTree(value, contextString);
  return value;
}

export function makeDraft({
  draftId,
  lensId,
  lensInstanceId,
  type,
  subtype,
  summary,
  values,
  meta
} = {}) {
  if (!lensId || typeof lensId !== "string") {
    throw new DraftInvariantError(`Draft must have a lensId.${formatContext(lensId)}`);
  }
  if (!lensInstanceId || typeof lensInstanceId !== "string") {
    throw new DraftInvariantError(`Draft must have a lensInstanceId.${formatContext(lensInstanceId)}`);
  }
  if (!type || typeof type !== "string") {
    throw new DraftInvariantError(`Draft must have a type.${formatContext(lensId)}`);
  }
  const valuesNormalized = normalizeToNumericTree(values, `lensId=${lensId}`);
  const draft = {
    draftId: typeof draftId === "string" && draftId ? draftId : newId("draft"),
    lensId,
    lensInstanceId,
    type,
    payload: {
      kind: "numericTree",
      values: valuesNormalized
    }
  };
  if (typeof subtype === "string" && subtype) {
    draft.subtype = subtype;
  }
  if (typeof summary === "string") {
    draft.summary = summary;
  }
  if (meta && typeof meta === "object") {
    draft.meta = { ...meta };
  }
  return draft;
}

export function normalizeDraft(raw, { lensId, lensInstanceId } = {}) {
  if (!lensId || typeof lensId !== "string") {
    throw new DraftInvariantError("normalizeDraft requires a lensId string.");
  }
  if (!lensInstanceId || typeof lensInstanceId !== "string") {
    throw new DraftInvariantError("normalizeDraft requires a lensInstanceId string.");
  }
  if (isNumericTree(raw)) {
    return makeDraft({
      lensId,
      lensInstanceId,
      type: lensId,
      values: raw
    });
  }
  if (!raw || typeof raw !== "object") {
    throw new DraftInvariantError(`Draft must be an object or numeric tree.${formatContext(`lensId=${lensId}`)}`);
  }
  const payload = raw.payload;
  if (!payload || typeof payload !== "object") {
    throw new DraftInvariantError(`Draft payload must be an object.${formatContext(`lensId=${lensId}`)}`);
  }
  if (payload.kind !== "numericTree") {
    throw new DraftInvariantError(`Draft payload.kind must be "numericTree".${formatContext(`lensId=${lensId}`)}`);
  }
  if (typeof raw.type !== "string") {
    throw new DraftInvariantError(`Draft must have a type.${formatContext(`lensId=${lensId}`)}`);
  }
  return makeDraft({
    draftId: raw.draftId,
    lensId,
    lensInstanceId,
    type: raw.type,
    subtype: raw.subtype,
    summary: raw.summary,
    values: payload.values,
    meta: raw.meta
  });
}

export function assertDraft(draft) {
  if (!draft || typeof draft !== "object") {
    throw new DraftInvariantError("Draft must be an object.");
  }
  if (typeof draft.draftId !== "string") {
    throw new DraftInvariantError("Draft must have a draftId.");
  }
  if (typeof draft.lensId !== "string") {
    throw new DraftInvariantError("Draft must have a lensId.");
  }
  if (typeof draft.lensInstanceId !== "string") {
    throw new DraftInvariantError("Draft must have a lensInstanceId.");
  }
  if (typeof draft.type !== "string") {
    throw new DraftInvariantError("Draft must have a type.");
  }
  if (Object.prototype.hasOwnProperty.call(draft, "summary") && typeof draft.summary !== "string") {
    throw new DraftInvariantError("Draft summary must be a string if provided.");
  }
  const payload = draft.payload;
  if (!payload || typeof payload !== "object") {
    throw new DraftInvariantError("Draft payload must be an object.");
  }
  if (payload.kind !== "numericTree") {
    throw new DraftInvariantError("Draft payload.kind must be numericTree.");
  }
  assertNumericTree(payload.values, `lensId=${draft.lensId}`);
  if (Object.prototype.hasOwnProperty.call(draft, "meta") && (draft.meta === null || typeof draft.meta !== "object")) {
    throw new DraftInvariantError("Draft meta must be an object if provided.");
  }
}

export function assertDraftKeys(draft) {
  const allowed = new Set([
    "draftId",
    "lensId",
    "lensInstanceId",
    "type",
    "subtype",
    "summary",
    "payload",
    "meta"
  ]);
  const keys = Object.keys(draft || {});
  const extra = keys.filter((key) => !allowed.has(key));
  if (extra.length) {
    throw new DraftInvariantError(`Draft has unexpected keys: ${extra.join(", ")}.`);
  }
}

export function assertMaterial(material) {
  invariant(material && typeof material === "object", "Material must be an object.");
  invariant(typeof material.materialId === "string", "Material must have a materialId.");
  invariant(typeof material.type === "string", "Material must have a type.");
  invariant(typeof material.name === "string", "Material must have a name.");
  invariant(typeof material.summary === "string", "Material must have a summary string.");
  invariant(Array.isArray(material.tags), "Material must have tags array.");
  invariant(material.meta && typeof material.meta === "object", "Material must have meta object.");
  assertNumericTree(material.payload, "material.payload");
}

export function assertClip(clip) {
  invariant(clip && typeof clip === "object", "Clip must be an object.");
  invariant(typeof clip.clipId === "string", "Clip must have a clipId.");
  invariant(typeof clip.materialId === "string", "Clip must have a materialId.");
  invariant(Number.isFinite(clip.laneId), "Clip must have a laneId number.");
  invariant(Number.isFinite(clip.start), "Clip must have a start number.");
  invariant(Number.isFinite(clip.duration), "Clip must have a duration number.");
}
