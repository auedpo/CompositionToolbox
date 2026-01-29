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
