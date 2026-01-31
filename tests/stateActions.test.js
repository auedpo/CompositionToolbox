import assert from "node:assert/strict";

import { createEmptyAuthoritative } from "../src/state/schema.js";
import { reduceAuthoritative, ACTION_TYPES } from "../src/state/reducer.js";
import { useStore } from "../src/state/store.js";

{
  const base = createEmptyAuthoritative();
  const laneId = base.workspace.laneOrder[0];
  const next = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: "inputList", laneId, row: 0 }
  });
  const cellKey = `${laneId}:0`;
  assert.strictEqual(next.workspace.grid.cells[cellKey] ? typeof next.workspace.grid.cells[cellKey] : null, "string");
  const lensInstanceId = next.workspace.grid.cells[cellKey];
  assert.ok(lensInstanceId);
  assert.strictEqual(next.lenses.lensInstancesById[lensInstanceId].lensId, "inputList");
  assert.strictEqual(next.selection.laneId, laneId);
}

{
  const base = createEmptyAuthoritative();
  const laneId = base.workspace.laneOrder[0];
  const first = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: "inputList", laneId, row: 0 }
  });
  const second = reduceAuthoritative(first, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: "inputList", laneId, row: 0 }
  });
  assert.deepStrictEqual(second, first, "Adding to an occupied cell should be ignored.");
}

{
  const base = createEmptyAuthoritative();
  const laneId = base.workspace.laneOrder[0];
  const seeded = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: "inputList", laneId, row: 0 }
  });
  const lensInstanceId = seeded.workspace.grid.cells[`${laneId}:0`];
  const moved = reduceAuthoritative(seeded, {
    type: ACTION_TYPES.LENS_MOVE_TO_CELL,
    payload: { lensInstanceId, laneId, row: 2 }
  });
  assert.strictEqual(moved.workspace.grid.cells[`${laneId}:0`], null);
  assert.strictEqual(moved.workspace.grid.cells[`${laneId}:2`], lensInstanceId);
}

{
  const base = createEmptyAuthoritative();
  const laneId = base.workspace.laneOrder[0];
  const seeded = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: "inputList", laneId, row: 0 }
  });
  const lensInstanceId = seeded.workspace.grid.cells[`${laneId}:0`];
  const removed = reduceAuthoritative(seeded, {
    type: ACTION_TYPES.LENS_REMOVE,
    payload: { lensInstanceId }
  });
  assert.strictEqual(removed.workspace.grid.cells[`${laneId}:0`], null);
  assert.strictEqual(removed.lenses.lensInstancesById[lensInstanceId], undefined);
}

{
  const actions = useStore.getState().actions;
  actions.hydrateAuthoritative(createEmptyAuthoritative());
  const laneId = useStore.getState().authoritative.workspace.laneOrder[0];
  actions.addLensToCell({ lensId: "inputList", laneId, row: 0 });
  const firstLensId = useStore.getState().authoritative.workspace.grid.cells[`${laneId}:0`];
  actions.addLensToCell({ lensId: "inputList", laneId, row: 1 });
  const secondLensId = useStore.getState().authoritative.workspace.grid.cells[`${laneId}:1`];
  actions.undo();
  const afterUndo = useStore.getState().authoritative;
  assert.strictEqual(afterUndo.workspace.grid.cells[`${laneId}:1`], null);
  assert.strictEqual(afterUndo.workspace.grid.cells[`${laneId}:0`], firstLensId);
  actions.redo();
  const afterRedo = useStore.getState().authoritative;
  assert.strictEqual(afterRedo.workspace.grid.cells[`${laneId}:1`], secondLensId);
}

console.log("state actions tests ok");
