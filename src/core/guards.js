function isDev() {
  return typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
}

let guardReporter = null;

export function setGuardReporter(handler) {
  guardReporter = typeof handler === "function" ? handler : null;
}

function report(message) {
  if (!guardReporter) return;
  guardReporter(message);
}

export function warnIfDraftHasId(draft, context) {
  if (!isDev()) return;
  if (!draft || typeof draft !== "object") return;
  if (!draft.id) return;
  const label = context ? ` (${context})` : "";
  const message = `Draft should use draftId instead of id${label}.`;
  console.warn(message, draft);
  report(message);
}

export function warnIfMaterialMissingId(material, context) {
  if (!isDev()) return;
  if (!material || typeof material !== "object") return;
  if (material.materialId) return;
  const label = context ? ` (${context})` : "";
  const message = `Material should have a materialId${label}.`;
  console.warn(message, material);
  report(message);
}

export function warnIfDraftMissingId(draft, context) {
  if (!isDev()) return;
  if (!draft || typeof draft !== "object") return;
  if (draft.draftId) return;
  const label = context ? ` (${context})` : "";
  const message = `Draft should have a draftId${label}.`;
  console.warn(message, draft);
  report(message);
}

export function warnIfInvalidMaterialId(materialId, context) {
  if (!isDev()) return;
  if (typeof materialId === "string" && materialId.trim()) return;
  const label = context ? ` (${context})` : "";
  const message = `Clip should reference a materialId${label}.`;
  console.warn(message, materialId);
  report(message);
}
