// Purpose: resolveInput.js provides exports: resolveInput.
// Interacts with: imports: ../state/schema.js.
// Role: core domain layer module within the broader app graph.
import { makeCellKey } from "../state/schema.js";

function normalizePick(input) {
  return input === "selected" ? "selected" : "active";
}

function normalizePackaging(input) {
  return input === "packDrafts" ? "packDrafts" : "single";
}

function getUpstreamLensInstanceId(lensInstanceId, authoritative) {
  if (!lensInstanceId || !authoritative) return null;
  const workspace = authoritative.workspace || {};
  const placement = workspace.lensPlacementById && workspace.lensPlacementById[lensInstanceId];
  if (!placement) return null;
  const grid = workspace.grid || {};
  const cells = grid.cells || {};
  const { laneId, row } = placement;
  if (typeof row !== "number" || row <= 0) return null;

  for (let currentRow = row - 1; currentRow >= 0; currentRow -= 1) {
    const cellKey = makeCellKey(laneId, currentRow);
    const upstream = cells[cellKey];
    if (!upstream) continue;
    return upstream;
  }
  return null;
}

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
  const selectedIdsByLens = derivedSoFar && derivedSoFar.drafts && derivedSoFar.drafts.selectedDraftIdsByLensInstanceId
    ? derivedSoFar.drafts.selectedDraftIdsByLensInstanceId
    : {};

  if (input.mode === "ref") {
    const ref = input.ref;
    const draftId = typeof ref === "string"
      ? ref
      : (ref && (ref.draftId || ref.sourceDraftId));
    return draftId ? draftsById[draftId] : undefined;
  }

  const upstreamLensInstanceId = getUpstreamLensInstanceId(lensInstanceId, authoritative);
  if (!upstreamLensInstanceId) return null;

  const pick = normalizePick(input.pick);
  const packaging = normalizePackaging(input.packaging);
  const activeDraftId = activeByLens ? activeByLens[upstreamLensInstanceId] : undefined;
  const selectedIds = Array.isArray(selectedIdsByLens[upstreamLensInstanceId])
    ? selectedIdsByLens[upstreamLensInstanceId]
    : [];

  let candidateIds = [];
  if (pick === "selected" && selectedIds.length > 0) {
    candidateIds = selectedIds.slice();
  } else if (activeDraftId) {
    candidateIds = [activeDraftId];
  }

  const upstreamDrafts = candidateIds
    .map((id) => draftsById[id])
    .filter(Boolean);

  if (packaging === "single") {
    return upstreamDrafts[0] || null;
  }

  const packedValues = upstreamDrafts
    .map((draft) => draft.payload && draft.payload.values)
    .filter((values) => values !== undefined);

  return {
    draftId: `virtual_pack_${lensInstanceId}_${upstreamLensInstanceId || "none"}`,
    lensId: "packDrafts",
    lensInstanceId: upstreamLensInstanceId || null,
    type: "packedInput",
    subtype: undefined,
    summary: "Packed drafts",
    payload: { kind: "numericTree", values: packedValues },
    meta: {
      provenance: {
        kind: "virtual",
        mode: "auto",
        pick,
        packaging: "packDrafts",
        sourceDraftIds: upstreamDrafts.map((draft) => draft.draftId),
        sourceLensIds: upstreamDrafts.map((draft) => draft.lensId)
      }
    }
  };
}
