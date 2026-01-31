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
        params: { values: [5, 8, 13] },
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
const activeId = derived.drafts.activeDraftIdByLensInstanceId[lensInstanceId];
const draft = activeId ? derived.drafts.draftsById[activeId] : null;

assert.ok(draft, "Expected active draft.");
assert.ok(draft.meta && draft.meta.provenance, "Draft should include provenance.");
assert.equal(typeof draft.meta.provenance.paramsHash, "string");
assert.ok(Array.isArray(draft.meta.provenance.inputRefs), "provenance.inputRefs should be an array.");
assert.equal(draft.meta.provenance.lensType, "inputList");

console.log("recomputeDerived.provenance tests ok");
