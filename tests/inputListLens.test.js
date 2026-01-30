import assert from "node:assert/strict";
import { DraftInvariantError } from "../src/core/invariants.js";
import { evaluateInputListLens } from "../src/lenses/inputList.js";
import { parseUserList } from "../src/ui/params/parseUserList.js";

function evalLens(text) {
  const parsed = parseUserList(text);
  if (!parsed.ok) {
    throw new Error(parsed.error || "Failed to parse test input.");
  }
  return evaluateInputListLens({
    params: { values: parsed.values },
    context: { lensId: "inputList", lensInstanceId: "input-list-test" }
  });
}

const flat = evalLens("0 1 2");
assert.deepStrictEqual(flat.drafts[0].payload.values, [0, 1, 2]);

const nested = evalLens("[0, [1, 2], 3]");
assert.deepStrictEqual(nested.drafts[0].payload.values, [0, [1, 2], 3]);

assert.throws(
  () => evaluateInputListLens({
    params: { values: [0, [1, "x"]] },
    context: { lensId: "inputList", lensInstanceId: "input-list-test" }
  }),
  (error) => error instanceof DraftInvariantError
);

console.log("inputListLens checks ok");
