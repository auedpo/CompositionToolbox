import assert from "node:assert/strict";

import { createEmptyAuthoritative } from "../src/state/schema.js";
import { ACTION_TYPES, reduceAuthoritative } from "../src/state/reducer.js";
import { recomputeDerived, MISSING_PINNED_INPUT_ERROR } from "../src/state/derived.js";

{
const base = createEmptyAuthoritative();
const laneId = base.workspace.laneOrder[0];
const seeded = reduceAuthoritative(base, {
  type: ACTION_TYPES.LENS_ADD_TO_CELL,
  payload: { lensId: "inputList", laneId, row: 0 }
});
const lensInstanceId = seeded.workspace.grid.cells[`${laneId}:0`];
  const withPinnedRef = reduceAuthoritative(seeded, {
    type: ACTION_TYPES.LENS_SET_INPUT,
    payload: {
      lensInstanceId,
      input: {
        mode: "ref",
        pinned: true,
        ref: { draftId: "missing-draft" }
      }
    }
  });
  const derived = recomputeDerived(withPinnedRef);
  const lastErrors = derived.errors && derived.errors.lastErrorByLensInstanceId;
  assert.strictEqual(lastErrors[lensInstanceId], MISSING_PINNED_INPUT_ERROR);
  const draftOrder = derived.drafts.draftOrderByLensInstanceId[lensInstanceId];
  assert.deepStrictEqual(draftOrder, []);
  assert.strictEqual(derived.drafts.activeDraftIdByLensInstanceId[lensInstanceId], undefined);
}

console.log("recomputeDerived missing-pinned-input test ok");
