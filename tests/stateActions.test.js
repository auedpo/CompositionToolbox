import assert from "node:assert/strict";

import { makeDraft } from "../src/core/invariants.js";
import { createEmptyAuthoritative } from "../src/state/schema.js";
import { ACTION_TYPES, reduceAuthoritative } from "../src/state/reducer.js";

{
  const base = createEmptyAuthoritative();
  const next = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_TRACK,
    payload: { lensId: "inputList" }
  });
  assert.strictEqual(next.workspace.trackOrder.length, 1);
  const trackId = next.workspace.trackOrder[0];
  const track = next.workspace.tracksById[trackId];
  assert.ok(track);
  assert.strictEqual(track.lensInstanceIds.length, 1);
  const lensInstanceId = track.lensInstanceIds[0];
  assert.strictEqual(next.lenses.lensInstancesById[lensInstanceId].lensId, "inputList");
  assert.strictEqual(next.selection.trackId, trackId);
  assert.strictEqual(next.selection.lensInstanceId, lensInstanceId);
}

{
  const base = createEmptyAuthoritative();
  const seeded = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_TRACK,
    payload: { lensId: "inputList" }
  });
  const trackId = seeded.workspace.trackOrder[0];
  const lensInstanceId = seeded.workspace.tracksById[trackId].lensInstanceIds[0];
  const updated = reduceAuthoritative(seeded, {
    type: ACTION_TYPES.LENS_REPLACE_PARAMS,
    payload: { lensInstanceId, params: { text: "1 2 3" } }
  });
  assert.deepStrictEqual(updated.lenses.lensInstancesById[lensInstanceId].params, { text: "1 2 3" });
}

{
  const base = createEmptyAuthoritative();
  const draft = makeDraft({
    lensId: "inputList",
    lensInstanceId: "lens-test",
    type: "numericTree",
    summary: "example",
    values: [1, 2, 3]
  });
  const next = reduceAuthoritative(base, {
    type: ACTION_TYPES.INVENTORY_ADD_FROM_DRAFT,
    payload: { draft }
  });
  assert.strictEqual(next.inventory.itemOrder.length, 1);
  const materialId = next.inventory.itemOrder[0];
  const material = next.inventory.itemsById[materialId];
  assert.ok(material);
  assert.strictEqual(material.type, draft.type);
  assert.strictEqual(material.provenance.sourceDraftId, draft.draftId);
  assert.deepStrictEqual(material.payload, draft.payload.values);
}

{
  const base = createEmptyAuthoritative();
  const draft = makeDraft({
    lensId: "inputList",
    lensInstanceId: "lens-test",
    type: "numericTree",
    summary: "example",
    values: [4, 5]
  });
  const next = reduceAuthoritative(base, {
    type: ACTION_TYPES.DESK_PLACE_DRAFT,
    payload: { draft }
  });
  assert.strictEqual(next.inventory.itemOrder.length, 1);
  assert.strictEqual(next.desk.nodeOrder.length, 1);
  const materialId = next.inventory.itemOrder[0];
  const clipId = next.desk.nodeOrder[0];
  const clip = next.desk.nodesById[clipId];
  assert.ok(clip);
  assert.strictEqual(clip.materialId, materialId);
}

{
  const base = createEmptyAuthoritative();
  const seeded = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_TRACK,
    payload: { lensId: "inputList" }
  });
  const trackId = seeded.workspace.trackOrder[0];
  const firstLensId = seeded.workspace.tracksById[trackId].lensInstanceIds[0];
  const updated = reduceAuthoritative(seeded, {
    type: ACTION_TYPES.LENS_ADD_INSTANCE,
    payload: { trackId, lensId: "inputList" }
  });
  const nextLensIds = updated.workspace.tracksById[trackId].lensInstanceIds;
  const secondLensId = nextLensIds.find((id) => id !== firstLensId) || nextLensIds[0];
  const afterRemoval = reduceAuthoritative(updated, {
    type: ACTION_TYPES.LENS_REMOVE_INSTANCE,
    payload: { trackId, lensInstanceId: firstLensId }
  });
  const remainingLensIds = afterRemoval.workspace.tracksById[trackId].lensInstanceIds;
  assert.strictEqual(remainingLensIds.length, 1);
  assert.strictEqual(afterRemoval.lenses.lensInstancesById[firstLensId], undefined);
  assert.strictEqual(afterRemoval.selection.trackId, trackId);
  assert.strictEqual(afterRemoval.selection.lensInstanceId, secondLensId);
}

{
  const base = createEmptyAuthoritative();
  const first = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_TRACK,
    payload: { lensId: "inputList" }
  });
  const firstTrackId = first.workspace.trackOrder[0];
  const firstLensId = first.workspace.tracksById[firstTrackId].lensInstanceIds[0];
  const second = reduceAuthoritative(first, { type: ACTION_TYPES.WORKSPACE_ADD_TRACK });
  const secondTrackId = second.workspace.trackOrder.find((id) => id !== firstTrackId);
  const withSecondLens = reduceAuthoritative(second, {
    type: ACTION_TYPES.LENS_ADD_INSTANCE,
    payload: { trackId: secondTrackId, lensId: "inputList" }
  });
  const secondLensId = withSecondLens.workspace.tracksById[secondTrackId].lensInstanceIds[0];
  const afterTrackRemoval = reduceAuthoritative(withSecondLens, {
    type: ACTION_TYPES.WORKSPACE_REMOVE_LANE,
    payload: { trackId: firstTrackId }
  });
  assert.strictEqual(afterTrackRemoval.workspace.trackOrder.length, 1);
  assert.strictEqual(afterTrackRemoval.workspace.trackOrder[0], secondTrackId);
  assert.strictEqual(afterTrackRemoval.workspace.tracksById[firstTrackId], undefined);
  assert.strictEqual(afterTrackRemoval.lenses.lensInstancesById[firstLensId], undefined);
  assert.strictEqual(afterTrackRemoval.selection.trackId, secondTrackId);
  assert.strictEqual(afterTrackRemoval.selection.lensInstanceId, secondLensId);
}

console.log("state actions tests ok");
