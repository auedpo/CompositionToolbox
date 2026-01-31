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

function findUpstreamActiveDraftId({ lensInstanceId, authoritative, derivedSoFar }) {
  const workspace = authoritative && authoritative.workspace ? authoritative.workspace : {};
  const placement = workspace.lensPlacementById && workspace.lensPlacementById[lensInstanceId];
  if (!placement) return null;
  const grid = workspace.grid || {};
  const rows = Number.isFinite(grid.rows) ? grid.rows : 0;
  const cells = grid.cells || {};
  const activeByLens = derivedSoFar && derivedSoFar.drafts
    ? derivedSoFar.drafts.activeDraftIdByLensInstanceId || {}
    : {};
  const { laneId, row } = placement;
  if (typeof row !== "number" || row <= 0) return null;

  for (let currentRow = row - 1; currentRow >= 0; currentRow -= 1) {
    const cellKey = makeCellKey(laneId, currentRow);
    const upstreamLensInstanceId = cells[cellKey];
    if (!upstreamLensInstanceId) continue;
    const activeDraftId = activeByLens ? activeByLens[upstreamLensInstanceId] : undefined;
    if (activeDraftId) return activeDraftId;
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

  const upstreamDraftId = findUpstreamActiveDraftId({ lensInstanceId, authoritative, derivedSoFar });
  return upstreamDraftId ? [{ mode: "auto", sourceDraftId: upstreamDraftId }] : [];
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
