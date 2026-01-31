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
  const seeded = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_TRACK,
    payload: { lensId: "inputList" }
  });
  const snapshot = exportAuthoritativeSnapshot({ authoritative: seeded });
  assert.strictEqual(snapshot.derived, undefined);
  assert.strictEqual(snapshot.drafts, undefined);
  assert.strictEqual(snapshot.activeDraftIdByLensInstanceId, undefined);
  assert.strictEqual(snapshot.workspace.trackOrder.length, 1);
  assert.strictEqual(snapshot.persistence.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(snapshot.meta && typeof snapshot.meta.updatedAt === "string");
}

{
  const base = createEmptyAuthoritative();
  const seededA = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_TRACK,
    payload: { lensId: "inputList" }
  });
  const seededB = reduceAuthoritative(seededA, {
    type: ACTION_TYPES.LENS_ADD_INSTANCE,
    payload: { trackId: seededA.workspace.trackOrder[0], lensId: "inputList" }
  });
  const snapshot = exportAuthoritativeSnapshot({ authoritative: seededB });
  const hydrated = importAuthoritativeSnapshot(snapshot);
  assert.deepStrictEqual(hydrated.workspace, seededB.workspace);
  assert.deepStrictEqual(hydrated.lenses, seededB.lenses);
  assert.deepStrictEqual(hydrated.desk, seededB.desk);
  assert.deepStrictEqual(hydrated.inventory, seededB.inventory);
  assert.deepStrictEqual(hydrated.selection, seededB.selection);
  assert.strictEqual(hydrated.persistence.schemaVersion, CURRENT_SCHEMA_VERSION);
}

{
  const legacySnapshot = {
    schemaVersion: 0,
    workspace: { tracksById: {}, trackOrder: [] },
    lenses: { lensInstancesById: {} },
    inventory: { itemsById: {}, itemOrder: [] },
    desk: { nodesById: {}, nodeOrder: [] },
    selection: {}
  };
  const hydrated = importAuthoritativeSnapshot(legacySnapshot);
  assert.strictEqual(hydrated.persistence.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepStrictEqual(hydrated.workspace.trackOrder, []);
  assert.strictEqual(typeof hydrated.workspace.tracksById, "object");
  assert.deepStrictEqual(hydrated.selection, createEmptyAuthoritative().selection);
}

console.log("persistence tests ok");
