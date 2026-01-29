// Purpose: gridNormalization.js provides exports: normalizeLensInstanceGridFields.
// Interacts with: no imports.
// Role: core domain layer module within the broader app graph.
export function normalizeLensInstanceGridFields({
  instance,
  track,
  indexInTrack,
  lensDefinition,
  laneIds
} = {}) {
  if (!instance) return;
  const sanitizedIndex = Number.isFinite(indexInTrack) && indexInTrack >= 0
    ? Math.floor(indexInTrack)
    : 0;
  if (!Number.isFinite(instance.row) || !Number.isInteger(instance.row) || instance.row < 0) {
    instance.row = sanitizedIndex;
  } else {
    instance.row = Math.max(0, Math.floor(instance.row));
  }
  const roleSpecs = Array.isArray(lensDefinition?.inputs) ? lensDefinition.inputs : [];
  const laneIdSet = new Set(
    Array.isArray(laneIds)
      ? laneIds.filter((value) => typeof value === "string" && value.length)
      : []
  );
  const currentSelection =
    instance.selectedInputLaneByRole && typeof instance.selectedInputLaneByRole === "object"
      ? { ...instance.selectedInputLaneByRole }
      : {};
  const nextSelection = {};
  roleSpecs.forEach((spec) => {
    const role = spec && typeof spec.role === "string" ? spec.role : null;
    if (!role) return;
    const candidate = currentSelection[role];
    if (candidate === "auto") {
      nextSelection[role] = "auto";
      return;
    }
    if (typeof candidate === "string" && laneIdSet.has(candidate)) {
      nextSelection[role] = candidate;
      return;
    }
    nextSelection[role] = "auto";
  });
  instance.selectedInputLaneByRole = nextSelection;
}
