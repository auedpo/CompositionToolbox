// Purpose: draftProvenance.js provides exports: buildInputRefs, buildParamsHash, buildStableDraftId.
// Interacts with: imports: ./draftIdentity.js, ./model.js.
// Role: core domain layer module within the broader app graph.
import { buildDraftKey } from "./draftIdentity.js";
import { hashParams } from "./model.js";
import { makeCellKey } from "../state/schema.js";

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function resolveRefDraftId(ref) {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref !== "object") return null;
  return ref.draftId || ref.sourceDraftId || null;
}

function findUpstreamLensInstanceId({ lensInstanceId, authoritative }) {
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
    const upstreamLensInstanceId = cells[cellKey];
    if (!upstreamLensInstanceId) continue;
    return upstreamLensInstanceId;
  }

  return null;
}

export function buildParamsHash({ params, lensInput } = {}) {
  return hashParams({
    params: safeObject(params),
    lensInput: safeObject(lensInput)
  });
}

export function buildInputRefs({ lensInstanceId, authoritative, derivedSoFar } = {}) {
  if (!lensInstanceId || !authoritative) return [];
  const lensInstancesById = authoritative.lenses && authoritative.lenses.lensInstancesById
    ? authoritative.lenses.lensInstancesById
    : {};
  const instance = lensInstancesById[lensInstanceId];
  if (!instance) return [];
  const input = instance.input || { mode: "auto" };

  if (input.mode === "ref") {
    const sourceDraftId = resolveRefDraftId(input.ref);
    return sourceDraftId ? [{ mode: "ref", sourceDraftId }] : [];
  }

  const upstreamLensInstanceId = findUpstreamLensInstanceId({ lensInstanceId, authoritative });
  if (!upstreamLensInstanceId) return [];

  const pick = input.pick === "selected" ? "selected" : "active";
  const packaging = input.packaging === "packDrafts" ? "packDrafts" : "single";
  const activeByLens = derivedSoFar && derivedSoFar.drafts
    ? derivedSoFar.drafts.activeDraftIdByLensInstanceId || {}
    : {};
  const selectedByLens = derivedSoFar && derivedSoFar.drafts
    ? derivedSoFar.drafts.selectedDraftIdsByLensInstanceId || {}
    : {};
  const selectedIds = Array.isArray(selectedByLens[upstreamLensInstanceId])
    ? selectedByLens[upstreamLensInstanceId]
    : [];
  const activeDraftId = activeByLens[upstreamLensInstanceId];

  let sourceDraftIds = [];
  if (pick === "selected" && selectedIds.length > 0) {
    sourceDraftIds = selectedIds.slice();
  } else if (activeDraftId) {
    sourceDraftIds = [activeDraftId];
  }

  if (packaging === "single") {
    if (!sourceDraftIds[0]) return [];
    if (pick === "active") {
      return [{ mode: "auto", sourceDraftId: sourceDraftIds[0] }];
    }
    return [{
      mode: "auto",
      pick,
      packaging: "single",
      sourceDraftId: sourceDraftIds[0]
    }];
  }

  return [{
    mode: "auto",
    pick,
    packaging: "packDrafts",
    sourceDraftIds: sourceDraftIds.slice()
  }];
}

export function buildStableDraftId({
  lensId,
  lensInstanceId,
  paramsHash,
  inputRefs,
  index,
  type,
  subtype
} = {}) {
  return buildDraftKey({
    lensId,
    lensInstanceId,
    type,
    subtype,
    index: Number.isFinite(index) ? index : 0,
    paramsHash,
    inputRefs: Array.isArray(inputRefs) ? inputRefs : []
  });
}
