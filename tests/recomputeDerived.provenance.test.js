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
