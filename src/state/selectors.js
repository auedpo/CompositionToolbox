// Purpose: selectors.js provides exports: selectActiveDraftForLensInstance, selectActiveDraftIdByLensInstanceId, selectAuthoritative, selectDerived, selectDraftOrderByLensInstanceId... (+17 more).
// Interacts with: no imports.
// Role: state layer module within the broader app graph.
export const selectAuthoritative = (state) => state.authoritative;

export const selectWorkspace = (state) => state.authoritative.workspace;

export const selectTrackOrder = (state) => state.authoritative.workspace.trackOrder;

export const selectTracksById = (state) => state.authoritative.workspace.tracksById;

export const selectTracks = (state) => {
  const order = selectTrackOrder(state);
  const tracksById = selectTracksById(state);
  return order.map((trackId) => tracksById[trackId]).filter(Boolean);
};

export const selectSelectedTrackId = (state) => state.authoritative.selection.trackId;

export const selectSelectedLensInstanceId = (state) => state.authoritative.selection.lensInstanceId;

export const selectLensInstancesById = (state) => state.authoritative.lenses.lensInstancesById;

export const selectLensInstanceIdsForTrack = (state, trackId) => {
  if (!trackId) return [];
  const track = selectTracksById(state)[trackId];
  return Array.isArray(track && track.lensInstanceIds) ? track.lensInstanceIds : [];
};

export const selectSelectedLensInstance = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  if (!lensInstanceId) return null;
  const lensInstancesById = selectLensInstancesById(state);
  return lensInstancesById[lensInstanceId] || null;
};

export const selectSelectedLensInstanceParams = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  if (!lensInstanceId) return null;
  const lensInstancesById = selectLensInstancesById(state);
  const instance = lensInstancesById[lensInstanceId];
  return instance ? instance.params : null;
};

export const selectSelectedLensInstanceLensId = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  if (!lensInstanceId) return null;
  const lensInstancesById = selectLensInstancesById(state);
  const instance = lensInstancesById[lensInstanceId];
  return instance ? instance.lensId : null;
};

export const selectSelectedLensInstanceLabel = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  if (!lensInstanceId) return null;
  const lensInstancesById = selectLensInstancesById(state);
  const instance = lensInstancesById[lensInstanceId];
  return instance && instance.ui ? instance.ui.label : null;
};

export const selectDerived = (state) => state.derived;

export const selectDraftsById = (state) => state.derived.drafts.draftsById;

export const selectDraftOrderByLensInstanceId = (state) => state.derived.drafts.draftOrderByLensInstanceId;

export const selectActiveDraftIdByLensInstanceId = (state) => state.derived.drafts.activeDraftIdByLensInstanceId;

export const selectLastErrorByLensInstanceId = (state) => state.derived.errors.lastErrorByLensInstanceId;

export const selectDraftsForLensInstance = (state, lensInstanceId) => {
  if (!lensInstanceId) return [];
  const draftsById = selectDraftsById(state);
  const orderMap = selectDraftOrderByLensInstanceId(state);
  const order = orderMap && orderMap[lensInstanceId] ? orderMap[lensInstanceId] : [];
  return order.map((draftId) => draftsById[draftId]).filter(Boolean);
};

export const selectActiveDraftForLensInstance = (state, lensInstanceId) => {
  if (!lensInstanceId) return null;
  const draftsById = selectDraftsById(state);
  const activeMap = selectActiveDraftIdByLensInstanceId(state);
  const activeId = activeMap ? activeMap[lensInstanceId] : undefined;
  return activeId ? draftsById[activeId] || null : null;
};

export const selectSelectedLensDrafts = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  return selectDraftsForLensInstance(state, lensInstanceId);
};

export const selectSelectedLensError = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  if (!lensInstanceId) return null;
  const errorMap = selectLastErrorByLensInstanceId(state);
  return errorMap ? errorMap[lensInstanceId] || null : null;
};
