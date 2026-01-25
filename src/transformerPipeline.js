export function updateLiveInput(transformer, sourceInstance, role, scheduleLens) {
  if (!transformer || !sourceInstance || !role) return;
  const draft = sourceInstance.activeDraft || null;
  const draftId = draft ? (draft.draftId || draft.id) : null;
  const sourceToken = sourceInstance._updateToken || 0;
  const lastLiveIds = transformer._lastLiveDraftIdByRole || {};
  const lastId = lastLiveIds[role] || null;
  const lastToken = (transformer._liveSourceTokens && transformer._liveSourceTokens[role]) || null;
  const changed = lastId !== draftId || lastToken !== sourceToken;
  const sourceLensInstanceId = sourceInstance.lensInstanceId || sourceInstance.id;

  transformer._lastLiveDraftIdByRole = transformer._lastLiveDraftIdByRole || {};
  transformer._lastLiveDraftIdByRole[role] = draftId;
  transformer._liveInputRefs = transformer._liveInputRefs || {};
  transformer._liveInputRefs[role] = {
    mode: "active",
    sourceLensInstanceId
  };
  transformer._liveInputSource = transformer._liveInputSource || {};
  transformer._liveInputSource[role] = sourceLensInstanceId;
  transformer._liveSourceTokens = transformer._liveSourceTokens || {};
  transformer._liveSourceTokens[role] = sourceToken;
  transformer.selectedInputRefsByRole = transformer.selectedInputRefsByRole || {};
  transformer.selectedInputRefsByRole[role] = {
    mode: "active",
    sourceLensInstanceId
  };

  if (changed && draftId && typeof scheduleLens === "function") {
    scheduleLens(transformer);
  }
}

export function ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens) {
  if (!Array.isArray(tracks) || !tracks.length) return;
  tracks.forEach((track) => {
    let prevInstance = track.generatorInstanceId ? lensInstances.get(track.generatorInstanceId) : null;
    track.transformerInstanceIds.forEach((instanceId) => {
      const transformer = lensInstances.get(instanceId);
      if (!transformer) {
        prevInstance = null;
        return;
      }
      const inputs = Array.isArray(transformer.lens.inputs) ? transformer.lens.inputs : [];
      if (inputs.length === 1 && prevInstance) {
        updateLiveInput(transformer, prevInstance, inputs[0].role, scheduleLens);
      }
      prevInstance = transformer;
    });
  });
}
