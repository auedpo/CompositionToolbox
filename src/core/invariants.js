import { assertIsPayloadList } from "./model.js";

export function invariant(condition, message) {
  if (condition) return;
  throw new Error(message || "Invariant failed.");
}

export function assertDraft(draft) {
  invariant(draft && typeof draft === "object", "Draft must be an object.");
  invariant(typeof draft.draftId === "string", "Draft must have a draftId.");
  invariant(typeof draft.lensInstanceId === "string", "Draft must have a lensInstanceId.");
  invariant(typeof draft.type === "string", "Draft must have a type.");
  invariant(typeof draft.summary === "string", "Draft must have a summary string.");
  assertIsPayloadList(draft.payload);
}

export function assertMaterial(material) {
  invariant(material && typeof material === "object", "Material must be an object.");
  invariant(typeof material.materialId === "string", "Material must have a materialId.");
  invariant(typeof material.type === "string", "Material must have a type.");
  invariant(typeof material.name === "string", "Material must have a name.");
  invariant(typeof material.summary === "string", "Material must have a summary string.");
  invariant(Array.isArray(material.tags), "Material must have tags array.");
  invariant(material.meta && typeof material.meta === "object", "Material must have meta object.");
  assertIsPayloadList(material.payload);
}

export function assertClip(clip) {
  invariant(clip && typeof clip === "object", "Clip must be an object.");
  invariant(typeof clip.clipId === "string", "Clip must have a clipId.");
  invariant(typeof clip.materialId === "string", "Clip must have a materialId.");
  invariant(Number.isFinite(clip.laneId), "Clip must have a laneId number.");
  invariant(Number.isFinite(clip.start), "Clip must have a start number.");
  invariant(Number.isFinite(clip.duration), "Clip must have a duration number.");
}
