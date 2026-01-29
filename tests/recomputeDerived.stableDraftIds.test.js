import assert from "node:assert/strict";
import { recomputeDerived } from "../src/core/recomputeDerived.js";

const authoritative = {
  workspace: {
    tracksById: {
      "track-1": {
        trackId: "track-1",
        name: "Track 1",
        lensInstanceIds: ["lens-1"]
      }
    },
    trackOrder: ["track-1"]
  },
  lenses: {
    lensInstancesById: {
      "lens-1": {
        lensInstanceId: "lens-1",
        lensId: "inputList",
        params: { values: [1, 2, 3] },
        input: { mode: "auto", pinned: false },
        ui: {}
      }
    }
  },
  inventory: { itemsById: {}, itemOrder: [] },
  desk: { nodesById: {}, nodeOrder: [] },
  selection: {},
  persistence: { schemaVersion: 1, dirty: false }
};

const first = recomputeDerived(authoritative);
const second = recomputeDerived(authoritative);

const lensInstanceId = "lens-1";
const firstIds = first.drafts.draftOrderByLensInstanceId[lensInstanceId] || [];
const secondIds = second.drafts.draftOrderByLensInstanceId[lensInstanceId] || [];

assert.ok(firstIds.length > 0, "Expected at least one draft.");
assert.deepEqual(firstIds, secondIds, "Draft IDs should be stable across recompute.");
assert.equal(
  first.drafts.activeDraftIdByLensInstanceId[lensInstanceId],
  second.drafts.activeDraftIdByLensInstanceId[lensInstanceId]
);

console.log("recomputeDerived.stableDraftIds tests ok");
