import assert from "node:assert/strict";
import { recomputeDerived } from "../src/core/recomputeDerived.js";
import { registerLens } from "../src/lenses/lensRegistry.js";

const lensId = "invalidNumericLens";

registerLens({
  meta: { id: lensId, name: "Invalid Numeric", kind: "transformer" },
  evaluate() {
    return {
      ok: true,
      drafts: [
        {
          type: "numeric",
          payload: { kind: "numericTree", values: [1, 2, 3] }
        },
        {
          type: "numeric",
          payload: { kind: "numericTree", values: [1, NaN] }
        }
      ]
    };
  }
});

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
        lensId,
        params: {},
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

const derived = recomputeDerived(authoritative);
const lensInstanceId = "lens-1";
const draftIds = derived.drafts.draftOrderByLensInstanceId[lensInstanceId] || [];

assert.deepEqual(draftIds, [], "Invalid drafts should not be registered.");
assert.equal(Object.keys(derived.drafts.draftsById).length, 0);
assert.ok(
  derived.errors.lastErrorByLensInstanceId[lensInstanceId],
  "Expected per-lens error for invalid draft output."
);

console.log("recomputeDerived.invariants tests ok");
