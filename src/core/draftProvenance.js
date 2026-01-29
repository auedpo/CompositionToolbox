// Purpose: draftProvenance.js provides exports: buildInputRefs, buildParamsHash, buildStableDraftId.
// Interacts with: imports: ./draftIdentity.js, ./model.js.
// Role: core domain layer module within the broader app graph.
import { buildDraftKey } from "./draftIdentity.js";
import { hashParams } from "./model.js";

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
  const trackOrder = Array.isArray(workspace.trackOrder) ? workspace.trackOrder : [];
  const tracksById = workspace.tracksById || {};
  const activeByLens = derivedSoFar && derivedSoFar.drafts
    ? derivedSoFar.drafts.activeDraftIdByLensInstanceId || {}
    : {};

  for (let i = 0; i < trackOrder.length; i += 1) {
    const trackId = trackOrder[i];
    const track = tracksById[trackId];
    if (!track || !Array.isArray(track.lensInstanceIds)) continue;
    const index = track.lensInstanceIds.indexOf(lensInstanceId);
    if (index <= 0) continue;
    const prevLensId = track.lensInstanceIds[index - 1];
    const activeDraftId = activeByLens ? activeByLens[prevLensId] : undefined;
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
