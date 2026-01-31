import assert from "node:assert/strict";

import { createEmptyAuthoritative } from "../src/state/schema.js";
import { ACTION_TYPES, reduceAuthoritative } from "../src/state/reducer.js";
import {
  CURRENT_SCHEMA_VERSION,
  exportAuthoritativeSnapshot,
  importAuthoritativeSnapshot
} from "../src/persist/projectSchema.js";

{
  const base = createEmptyAuthoritative();
  const laneId = base.workspace.laneOrder[0];
  const seeded = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: "inputList", laneId, row: 0 }
  });
  const snapshot = exportAuthoritativeSnapshot({ authoritative: seeded });
  assert.strictEqual(snapshot.workspace.laneOrder.length, 4);
  assert.ok(snapshot.workspace.grid);
  assert.strictEqual(snapshot.persistence.schemaVersion, CURRENT_SCHEMA_VERSION);
}

{
  const base = createEmptyAuthoritative();
  const laneId = base.workspace.laneOrder[0];
  const seeded = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: "inputList", laneId, row: 0 }
  });
  const snapshot = exportAuthoritativeSnapshot({ authoritative: seeded });
  const hydrated = importAuthoritativeSnapshot(snapshot);
  assert.deepStrictEqual(hydrated.workspace.laneOrder, seeded.workspace.laneOrder);
  assert.deepStrictEqual(hydrated.workspace.grid, seeded.workspace.grid);
  assert.strictEqual(hydrated.persistence.schemaVersion, CURRENT_SCHEMA_VERSION);
}

{
  const legacySnapshot = {
    schemaVersion: 1,
    workspace: {
      tracksById: {},
      trackOrder: []
    },
    lenses: { lensInstancesById: {} },
    inventory: { itemsById: {}, itemOrder: [] },
    desk: { nodesById: {}, nodeOrder: [] },
    selection: {}
  };
  const hydrated = importAuthoritativeSnapshot(legacySnapshot);
  assert.strictEqual(hydrated.persistence.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(hydrated.workspace.laneOrder.length, 4);
}

console.log("persistence tests ok");
