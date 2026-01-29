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
  const trackOrder = Array.isArray(workspace.trackOrder) ? workspace.trackOrder : [];
  const tracksById = workspace.tracksById || {};
  for (let i = 0; i < trackOrder.length; i += 1) {
    const trackId = trackOrder[i];
    const track = tracksById[trackId];
    if (!track || !Array.isArray(track.lensInstanceIds)) continue;
    const index = track.lensInstanceIds.indexOf(lensInstanceId);
    if (index <= 0) continue;
    const prevLensId = track.lensInstanceIds[index - 1];
    const activeDraftId = activeByLens ? activeByLens[prevLensId] : undefined;
    return activeDraftId ? draftsById[activeDraftId] : undefined;
  }

  return undefined;
}
