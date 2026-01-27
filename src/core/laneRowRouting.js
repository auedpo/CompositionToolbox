function getLensInstanceById(state, lensInstanceId) {
  if (!lensInstanceId) return null;
  if (state?.lensInstancesById instanceof Map) {
    return state.lensInstancesById.get(lensInstanceId) || null;
  }
  if (state?.lensInstances && typeof state.lensInstances === "object") {
    return state.lensInstances[lensInstanceId] || null;
  }
  return null;
}

function safeRowFromInstance(instance) {
  return Number.isFinite(instance?.row) ? instance.row : Number.POSITIVE_INFINITY;
}

export function buildLaneRowIndex(state = {}) {
  const lanesById = new Map();
  const lensToLaneId = new Map();
  const lensToRow = new Map();
  const tracks = Array.isArray(state.tracks) ? state.tracks : [];

  tracks.forEach((track) => {
    if (!track || typeof track.id !== "string") return;
    const laneId = track.id;
    const lensInstanceIds = Array.isArray(track.lensInstanceIds) ? track.lensInstanceIds : [];
    const rowsByLensId = new Map();
    const entryBuffer = [];

    lensInstanceIds.forEach((lensInstanceId) => {
      if (!lensInstanceId) return;
      const instance = getLensInstanceById(state, lensInstanceId);
      const row = safeRowFromInstance(instance);
      rowsByLensId.set(lensInstanceId, row);
      lensToLaneId.set(lensInstanceId, laneId);
      lensToRow.set(lensInstanceId, row);
      entryBuffer.push({ lensInstanceId, row });
    });

    entryBuffer.sort((a, b) => {
      if (a.row < b.row) return -1;
      if (a.row > b.row) return 1;
      return 0;
    });

    const lensIdsSorted = entryBuffer.map((entry) => entry.lensInstanceId);
    lanesById.set(laneId, {
      laneId,
      lensIdsSorted,
      rowsByLensId
    });
  });

  return {
    lanesById,
    lensToLaneId,
    lensToRow
  };
}

export function findNearestUpstreamLens({ index, sourceLaneId, targetRow }) {
  if (!index || !index.lanesById || typeof sourceLaneId !== "string") return null;
  if (!Number.isFinite(targetRow)) return null;
  const lane = index.lanesById.get(sourceLaneId);
  if (!lane) return null;
  const { lensIdsSorted, rowsByLensId } = lane;
  for (let i = lensIdsSorted.length - 1; i >= 0; i -= 1) {
    const candidateId = lensIdsSorted[i];
    const row = rowsByLensId.get(candidateId);
    if (!Number.isFinite(row)) continue;
    if (row < targetRow) {
      return candidateId;
    }
  }
  return null;
}

export function resolveSourceLaneId({ index, targetLaneId, selection }) {
  if (!selection || selection === "auto") return targetLaneId;
  const lanes = index?.lanesById;
  if (lanes instanceof Map && lanes.has(selection)) {
    return selection;
  }
  return targetLaneId;
}

export function describeResolvedUpstream({ index, sourceLaneId, targetRow }) {
  const upstreamLensInstanceId = findNearestUpstreamLens({ index, sourceLaneId, targetRow });
  const upstreamRow = upstreamLensInstanceId ? index?.lensToRow?.get(upstreamLensInstanceId) : null;
  return {
    sourceLaneId: typeof sourceLaneId === "string" ? sourceLaneId : null,
    targetRow,
    upstreamLensInstanceId,
    upstreamRow: Number.isFinite(upstreamRow) ? upstreamRow : null
  };
}

export function getLaneIdForLens({ index, lensInstanceId }) {
  if (!index || !index.lensToLaneId) return null;
  return index.lensToLaneId.get(lensInstanceId) || null;
}

export function getRowForLens({ index, lensInstanceId }) {
  if (!index || !index.lensToRow) return null;
  const row = index.lensToRow.get(lensInstanceId);
  return Number.isFinite(row) ? row : null;
}
