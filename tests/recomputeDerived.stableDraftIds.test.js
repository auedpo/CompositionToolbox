import assert from "node:assert/strict";
import { recomputeDerived } from "../src/core/recomputeDerived.js";

const authoritative = {
  workspace: {
    laneOrder: ["lane-1"],
    lanesById: {
      "lane-1": { laneId: "lane-1", name: "Lane 1", columnIndex: 0 }
    },
    grid: {
      rows: 10,
      cols: 1,
      cells: {
        "lane-1:0": "lens-1"
      }
    },
    lensPlacementById: {
      "lens-1": { laneId: "lane-1", row: 0 }
    }
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
