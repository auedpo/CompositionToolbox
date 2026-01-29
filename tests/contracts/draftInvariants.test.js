import assert from "node:assert/strict";
import {
  assertNumericTree,
  DraftInvariantError,
  makeDraft,
  normalizeDraft
} from "../../src/core/invariants.js";

function expectDraftError(fn, label) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof DraftInvariantError, `${label}: not DraftInvariantError`);
    return true;
  });
}

{
  expectDraftError(() => makeDraft({
    lensInstanceId: "lens-1",
    type: "numeric",
    values: [1]
  }), "missing lensId");

  expectDraftError(() => makeDraft({
    lensId: "lens-1",
    type: "numeric",
    values: [1]
  }), "missing lensInstanceId");

  expectDraftError(() => makeDraft({
    lensId: "lens-1",
    lensInstanceId: "lens-1",
    values: [1]
  }), "missing type");

  expectDraftError(() => makeDraft({
    lensId: "lens-1",
    lensInstanceId: "lens-1",
    type: "numeric",
    values: [1, NaN]
  }), "invalid numericTree");
}

{
  assert.throws(() => assertNumericTree([1, [2, Infinity]]));
}

{
  const normalized = normalizeDraft([1, 2, 3], {
    lensId: "lens-2",
    lensInstanceId: "lens-2-instance"
  });
  assert.equal(normalized.lensId, "lens-2");
  assert.equal(normalized.lensInstanceId, "lens-2-instance");
  assert.equal(normalized.payload.kind, "numericTree");
  assert.deepStrictEqual(normalized.payload.values, [1, 2, 3]);
}

console.log("draftInvariants tests ok");
