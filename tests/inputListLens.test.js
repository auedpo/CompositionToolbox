import assert from "node:assert/strict";
import { DraftInvariantError } from "../src/core/invariants.js";
import { evaluateInputListLens } from "../src/lenses/inputList.js";

function evalLens(text) {
  return evaluateInputListLens({
    generatorInput: { text },
    context: { lensId: "inputList", lensInstanceId: "input-list-test" }
  });
}

const flat = evalLens("0 1 2");
assert.deepStrictEqual(flat.drafts[0].payload.values, [0, 1, 2]);

const nested = evalLens("[0, [1, 2], 3]");
assert.deepStrictEqual(nested.drafts[0].payload.values, [0, [1, 2], 3]);

assert.throws(
  () => evalLens("[0, [1, \"x\"]]"),
  (error) => error instanceof DraftInvariantError
);

console.log("inputListLens checks ok");
