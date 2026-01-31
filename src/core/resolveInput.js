// Purpose: resolveInput.js provides exports: resolveInput.
// Interacts with: imports: ../state/schema.js.
// Role: core domain layer module within the broader app graph.
import { makeCellKey } from "../state/schema.js";

export function resolveInput(lensInstanceId, authoritative, derivedSoFar) {
  if (!lensInstanceId || !authoritative) return undefined;
  const lensInstancesById = authoritative.lenses && authoritative.lenses.lensInstancesById
    ? authoritative.lenses.lensInstancesById
    : {};
  const instance = lensInstancesById[lensInstanceId];
  if (!instance) return undefined;
  const input = instance.input || { mode: "auto" };
  const draftsById = derivedSoFar && derivedSoFar.drafts && derivedSoFar.drafts.draftsById
    ? derivedSoFar.drafts.draftsById
    : {};
  const activeByLens = derivedSoFar && derivedSoFar.drafts && derivedSoFar.drafts.activeDraftIdByLensInstanceId
    ? derivedSoFar.drafts.activeDraftIdByLensInstanceId
    : {};

  if (input.mode === "ref") {
    const ref = input.ref;
    const draftId = typeof ref === "string"
      ? ref
      : (ref && (ref.draftId || ref.sourceDraftId));
    return draftId ? draftsById[draftId] : undefined;
  }

  const workspace = authoritative.workspace || {};
  const placement = workspace.lensPlacementById && workspace.lensPlacementById[lensInstanceId];
  if (!placement) return null;
  const grid = workspace.grid || {};
  const rows = Number.isFinite(grid.rows) ? grid.rows : 0;
  const cells = grid.cells || {};
  const { laneId, row } = placement;
  for (let currentRow = row - 1; currentRow >= 0; currentRow -= 1) {
    const cellKey = makeCellKey(laneId, currentRow);
    const upstreamLensInstanceId = cells[cellKey];
    if (!upstreamLensInstanceId) continue;
    const activeDraftId = activeByLens ? activeByLens[upstreamLensInstanceId] : undefined;
    if (activeDraftId) {
      return draftsById[activeDraftId] || null;
    }
  }

  return null;
}
