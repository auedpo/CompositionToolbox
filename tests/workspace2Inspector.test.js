import assert from "node:assert/strict";
import {
  findTrackIdForLensInstance,
  getLensIndexInTrack,
  getLensLabelForTrackIndex,
  removeLensFromOrder,
  pickFocusAfterRemoval,
  insertLensAt,
  insertLensDuplicate,
  moveLensInOrder,
  clearLensOrder
} from "../src/workspace2InspectorUtils.js";

const tracks = [
  { id: "track-1", lensInstanceIds: ["lens-1", "lens-2"] },
  { id: "track-2", lensInstanceIds: ["lens-3"] }
];

assert.strictEqual(findTrackIdForLensInstance(tracks, "lens-2"), "track-1");
assert.strictEqual(findTrackIdForLensInstance(tracks, "unknown"), null);
assert.strictEqual(getLensIndexInTrack(tracks[0], "lens-2"), 1);
assert.strictEqual(getLensIndexInTrack(tracks[1], "lens-3"), 0);
assert.strictEqual(getLensLabelForTrackIndex(2, 0), "2.1");
assert.strictEqual(getLensLabelForTrackIndex(3, 2), "3L3");

const path = ["a", "b", "c"];
const removedMiddle = removeLensFromOrder(path, 1);
assert.deepStrictEqual(removedMiddle, ["a", "c"]);
assert.strictEqual(pickFocusAfterRemoval(removedMiddle, 1), 0);

const removedFirst = removeLensFromOrder(path, 0);
assert.deepStrictEqual(removedFirst, ["b", "c"]);
assert.strictEqual(pickFocusAfterRemoval(removedFirst, 0), 0);

const duplicated = insertLensDuplicate(["a", "b"], 0, "clone");
assert.deepStrictEqual(duplicated, ["a", "clone", "b"]);

assert.deepStrictEqual(moveLensInOrder(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
assert.deepStrictEqual(moveLensInOrder(["a", "b", "c"], 1, 1), ["a", "c", "b"]);

assert.deepStrictEqual(clearLensOrder(), []);

{
  const track = { id: "track-2", lensInstanceIds: ["lens-1", "lens-2"] };
  const inserted = insertLensAt(track.lensInstanceIds, 1, "lens-new");
  assert.deepStrictEqual(inserted, ["lens-1", "lens-new", "lens-2"]);
  assert.strictEqual(getLensLabelForTrackIndex(2, 1), "2L2");
  const appended = insertLensAt(inserted, inserted.length, "lens-last");
  assert.deepStrictEqual(appended, ["lens-1", "lens-new", "lens-2", "lens-last"]);
  assert.strictEqual(getLensLabelForTrackIndex(2, appended.length - 1), "2L4");
}

console.log("workspace2Inspector tests ok");
