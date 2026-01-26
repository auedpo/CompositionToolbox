import assert from "node:assert/strict";
import { evaluateBasicMathTransformerLens, basicMathTransformerLens } from "../src/lenses/basicMathTransformerLens.js";
import { makeDraft } from "../src/core/invariants.js";

function buildDraft(payload) {
  return makeDraft({
    draftId: "draft-math",
    lensId: "test",
    lensInstanceId: "lens-test",
    type: "numeric",
    summary: "Numeric list",
    values: payload
  });
}

function makeContext(draft) {
  return {
    lensId: "basicMath",
    lensInstanceId: "basicMath-test",
    instance: {
      lens: basicMathTransformerLens,
      selectedInputRefsByRole: {
        input: { mode: "freeze", sourceDraftId: draft.draftId }
      },
      generatorInputValues: {},
      _liveInputRefs: {}
    },
    draftCatalog: [draft],
    getLensInstanceById: () => null,
    upstreamInstance: null
  };
}

{
  const draft = buildDraft([0, 2, 4, 10, 12]);
  const result = evaluateBasicMathTransformerLens({
    params: {
      operation: "add",
      operands: [1, 3, 5],
      modEnabled: true,
      modValue: 12
    },
    context: makeContext(draft)
  });
  assert.ok(result.ok, result.errors);
  assert.deepStrictEqual(result.drafts[0].payload.values, [1, 5, 9, 11, 3]);
  assert.deepStrictEqual(result.vizModel.inputValues, [0, 2, 4, 10, 12]);
  assert.strictEqual(result.vizModel.operation, "add");
  assert.strictEqual(result.vizModel.modActive, true);
}

{
  const draft = buildDraft([9, 16, 25]);
  const result = evaluateBasicMathTransformerLens({
    params: {
      operation: "sqrt"
    },
    context: makeContext(draft)
  });
  assert.ok(result.ok, result.errors);
  assert.deepStrictEqual(result.drafts[0].payload.values, [3, 4, 5]);
  assert.strictEqual(result.vizModel.operation, "sqrt");
}

{
  const draft = buildDraft([2, 3, 4]);
  const result = evaluateBasicMathTransformerLens({
    params: {
      operation: "multiply",
      operands: [2, 4]
    },
    context: makeContext(draft)
  });
  assert.ok(result.ok, result.errors);
  assert.deepStrictEqual(result.drafts[0].payload.values, [4, 12, 8]);
  assert.deepStrictEqual(result.vizModel.operands, [2, 4]);
}

console.log("basicMathTransformerLens tests ok");
