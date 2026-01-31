import assert from "node:assert/strict";

import { recomputeDerived } from "../src/core/recomputeDerived.js";
import { registerLens } from "../src/lenses/lensRegistry.js";
import { createEmptyAuthoritative } from "../src/state/schema.js";
import { ACTION_TYPES, reduceAuthoritative } from "../src/state/reducer.js";

const workflowLensId = "phase5-workflow-lens";
registerLens({
  meta: { id: workflowLensId, name: "Phase 5 Workflow Lens", kind: "transformer" },
  defaultParams: { value: 1 },
  evaluate({ params }) {
    const value = Number.isFinite(params.value) ? params.value : 0;
    return {
      ok: true,
      drafts: [
        {
          payload: {
            kind: "numericTree",
            values: [value]
          }
        }
      ]
    };
  }
});

const baseAuthoritative = createEmptyAuthoritative();
const primaryLane = baseAuthoritative.workspace.laneOrder[0];
const seeded = reduceAuthoritative(baseAuthoritative, {
  type: ACTION_TYPES.LENS_ADD_TO_CELL,
  payload: { lensId: workflowLensId, laneId: primaryLane, row: 0 }
});
const firstLensInstanceId = seeded.workspace.grid.cells[`${primaryLane}:0`];

const derivedInitial = recomputeDerived(seeded);
const activeDraftIdInitial = derivedInitial.drafts.activeDraftIdByLensInstanceId[firstLensInstanceId];
assert.ok(activeDraftIdInitial, "Initial lens should produce an active draft.");
const initialDraft = derivedInitial.drafts.draftsById[activeDraftIdInitial];
assert.deepStrictEqual(initialDraft.payload.values, [1], "Default param value should appear in the first draft.");

const updated = reduceAuthoritative(seeded, {
  type: ACTION_TYPES.LENS_REPLACE_PARAMS,
  payload: { lensInstanceId: firstLensInstanceId, params: { value: 7 } }
});
const derivedUpdated = recomputeDerived(updated);
const activeDraftIdUpdated = derivedUpdated.drafts.activeDraftIdByLensInstanceId[firstLensInstanceId];
assert.ok(activeDraftIdUpdated, "Lens should still produce an active draft after param change.");
const updatedDraft = derivedUpdated.drafts.draftsById[activeDraftIdUpdated];
assert.notStrictEqual(activeDraftIdInitial, activeDraftIdUpdated, "Draft IDs should refresh when params mutate.");
assert.deepStrictEqual(updatedDraft.payload.values, [7], "New param value should appear in the recomputed draft.");

const errorLensId = "phase5-error-lens";
registerLens({
  meta: { id: errorLensId, name: "Phase 5 Error Lens", kind: "transformer" },
  defaultParams: {},
  evaluate() {
    return {
      ok: true,
      drafts: [
        {
          payload: {
            kind: "numericTree",
            values: [NaN]
          }
        }
      ]
    };
  }
});

const errorState = reduceAuthoritative(baseAuthoritative, {
  type: ACTION_TYPES.LENS_ADD_TO_CELL,
  payload: { lensId: errorLensId, laneId: primaryLane, row: 0 }
});
const errorInstanceId = errorState.workspace.grid.cells[`${primaryLane}:0`];
const derivedError = recomputeDerived(errorState);
const errorDraftIds = derivedError.drafts.draftOrderByLensInstanceId[errorInstanceId] || [];
assert.deepStrictEqual(errorDraftIds, [], "Invalid drafts are not queued.");
const errorMessage = derivedError.errors.lastErrorByLensInstanceId[errorInstanceId];
assert.ok(errorMessage && typeof errorMessage === "string", "Errors are surfaced when draft validation fails.");

console.log("recomputeDerived.workflow tests ok");
