import { isFreezeRef } from "./lenses/inputResolution.js";

export function updateLivePortRef(instance, sourceInstance, role, scheduleLens) {
  if (!instance || !sourceInstance || !role) return;
  const draft = sourceInstance.activeDraft || null;
  const draftId = draft ? (draft.draftId || draft.id || null) : null;
  const sourceLensInstanceId = sourceInstance.lensInstanceId || sourceInstance.id || null;
  const sourceToken = sourceInstance._updateToken || 0;
  const lastLiveIds = instance._lastLiveDraftIdByRole || {};
  const lastId = lastLiveIds[role] || null;
  const lastToken = (instance._liveSourceTokens && instance._liveSourceTokens[role]) || null;
  const changed = lastId !== draftId || lastToken !== sourceToken;

  instance._lastLiveDraftIdByRole = instance._lastLiveDraftIdByRole || {};
  instance._lastLiveDraftIdByRole[role] = draftId;
  instance._liveInputRefs = instance._liveInputRefs || {};
  instance._liveInputRefs[role] = {
    mode: "active",
    sourceLensInstanceId
  };
  instance._liveInputSource = instance._liveInputSource || {};
  instance._liveInputSource[role] = sourceLensInstanceId;
  instance._liveSourceTokens = instance._liveSourceTokens || {};
  instance._liveSourceTokens[role] = sourceToken;
  instance.selectedInputRefsByRole = instance.selectedInputRefsByRole || {};
  instance.selectedInputRefsByRole[role] = {
    mode: "active",
    sourceLensInstanceId
  };

  if (changed && draftId && typeof scheduleLens === "function") {
    scheduleLens(instance);
  }
}

export function ensureDefaultSignalFlowSelections(tracks, lensInstances, scheduleLens) {
  if (!Array.isArray(tracks)) return;
  tracks.forEach((track) => {
    const lensIds = Array.isArray(track && track.lensInstanceIds)
      ? track.lensInstanceIds
      : [];
    lensIds.forEach((instanceId) => {
      const instance = lensInstances.get(instanceId);
      if (!instance) return;
      const inputSpecs = Array.isArray(instance.lens && instance.lens.inputs)
        ? instance.lens.inputs
        : [];
      if (!inputSpecs.length) return;
      const upstream = findPreviousSibling(track, instance, lensInstances);
      if (!upstream) return;
      inputSpecs.forEach((spec) => {
        const role = spec && spec.role;
        if (!role || spec.allowUpstream === false) return;
        const selected = instance.selectedInputRefsByRole
          ? instance.selectedInputRefsByRole[role]
          : null;
        if (isFreezeRef(selected)) return;
        const activeSourceId = selected && selected.sourceLensInstanceId
          ? selected.sourceLensInstanceId
          : null;
        const isActiveOther = upstream && activeSourceId && activeSourceId !== upstream.lensInstanceId;
        if (isActiveOther) return;
        updateLivePortRef(instance, upstream, role, scheduleLens);
      });
    });
  });
}

function getParentPath(path) {
  if (!Array.isArray(path) || !path.length) return [];
  return path.slice(0, -1);
}

function hasSameParentPath(pathA, pathB) {
  const parentA = getParentPath(pathA);
  const parentB = getParentPath(pathB);
  if (parentA.length !== parentB.length) return false;
  return parentA.every((value, index) => value === parentB[index]);
}

function findPreviousSibling(track, instance, lensInstances) {
  if (!track || !instance) return null;
  const ordered = Array.isArray(track.lensInstanceIds) ? track.lensInstanceIds : [];
  const targetPath = Array.isArray(instance.path) ? instance.path : [];
  let previous = null;
  for (const lensId of ordered) {
    const candidate = lensInstances.get(lensId);
    if (!candidate) continue;
    const candidatePath = Array.isArray(candidate.path) ? candidate.path : [];
    if (!hasSameParentPath(candidatePath, targetPath)) continue;
    if (candidate.lensInstanceId === instance.lensInstanceId) {
      return previous;
    }
    previous = candidate;
  }
  return null;
}
