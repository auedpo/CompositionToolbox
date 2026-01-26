export function findTrackIdForLensInstance(tracks, instanceId) {
  if (!instanceId || !Array.isArray(tracks)) return null;
  for (const track of tracks) {
    if (!track || !Array.isArray(track.lensInstanceIds)) continue;
    if (track.lensInstanceIds.includes(instanceId)) {
      return track.id;
    }
  }
  return null;
}

export function getLensIndexInTrack(track, instanceId) {
  if (!track || !Array.isArray(track.lensInstanceIds)) return -1;
  return track.lensInstanceIds.indexOf(instanceId);
}

export function getLensLabelForTrackIndex(trackNumber, index) {
  if (!Number.isFinite(trackNumber) || trackNumber <= 0 || index < 0) return "?";
  if (index === 0) {
    return `${trackNumber}.1`;
  }
  return `${trackNumber}L${index + 1}`;
}

export function removeLensFromOrder(order, index) {
  if (!Array.isArray(order)) return [];
  if (index < 0 || index >= order.length) {
    return order.slice();
  }
  const next = order.slice();
  next.splice(index, 1);
  return next;
}

export function pickFocusAfterRemoval(order, removedIndex) {
  if (!Array.isArray(order) || !order.length) return -1;
  if (removedIndex > 0) {
    return Math.min(removedIndex - 1, order.length - 1);
  }
  return 0;
}

export function insertLensDuplicate(order, index, newLensId) {
  const next = Array.isArray(order) ? order.slice() : [];
  const targetIndex = Math.min(Math.max(index + 1, 0), next.length);
  next.splice(targetIndex, 0, newLensId);
  return next;
}

export function moveLensInOrder(order, index, delta) {
  if (!Array.isArray(order)) return [];
  const target = index + delta;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return order.slice();
  }
  const next = order.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function clearLensOrder() {
  return [];
}
