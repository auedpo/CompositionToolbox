import assert from "node:assert/strict";
import { evaluateBasicMathTransformerLens } from "../src/lenses/basicMathTransformerLens.js";

function buildDraft(payload) {
  return {
    id: "draft-math",
    type: "numeric",
    payload,
    summary: {
      title: "Numeric list"
    }
  };
}

{
  const draft = buildDraft({ steps: [0, 2, 4, 10, 12] });
  const result = evaluateBasicMathTransformerLens({
    inputs: [{ draft }],
    params: {
      operation: "add",
      operands: [1, 3, 5],
      modEnabled: true,
      modValue: 12
    }
  });
  assert.ok(result.ok, result.errors);
  assert.deepStrictEqual(result.drafts[0].payload.steps, [1, 5, 9, 11, 3]);
  assert.strictEqual(result.drafts[0].payload.meta.modApplied, true);
  assert.strictEqual(result.drafts[0].payload.meta.modValue, 12);
  assert.deepStrictEqual(result.vizModel.inputValues, [0, 2, 4, 10, 12]);
  assert.strictEqual(result.vizModel.operation, "add");
  assert.strictEqual(result.vizModel.modActive, true);
}

{
  const draft = buildDraft({ values: [9, 16, 25] });
  const result = evaluateBasicMathTransformerLens({
    inputs: [{ draft }],
    params: {
      operation: "sqrt"
    }
  });
  assert.ok(result.ok, result.errors);
  assert.deepStrictEqual(result.drafts[0].payload.steps, [3, 4, 5]);
  assert.strictEqual(result.drafts[0].payload.meta.modApplied, false);
  assert.strictEqual(result.vizModel.operation, "sqrt");
}

{
  const draft = buildDraft([2, 3, 4]);
  const result = evaluateBasicMathTransformerLens({
    inputs: [{ draft }],
    params: {
      operation: "multiply",
      operands: [2, 4]
    }
  });
  assert.ok(result.ok, result.errors);
  assert.deepStrictEqual(result.drafts[0].payload.steps, [4, 12, 8]);
  assert.deepStrictEqual(result.vizModel.operands, [2, 4]);
}

console.log("basicMathTransformerLens tests ok");
