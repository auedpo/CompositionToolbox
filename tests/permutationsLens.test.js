import assert from "node:assert/strict";
import { evaluatePermutationsLens, permutationsLens } from "../src/lenses/permutationsLens.js";

function buildContext() {
  const lensInstanceId = "permutations-test";
  return {
    context: {
      lensId: "permutations",
      lensInstanceId,
      instance: {
        lens: permutationsLens,
        lensInstanceId,
        selectedInputRefsByRole: {},
        lensInputValues: {},
        _liveInputRefs: {}
      },
      draftCatalog: [],
      getLensInstanceById: () => null,
      upstreamInstance: null
    }
  };
}

// basic typed bag produces the expected factorial number of drafts
const basic = evaluatePermutationsLens({
  params: { bag: [1, 2, 3] },
  ...buildContext()
});
assert.ok(basic.ok, basic.errors);
assert.strictEqual(basic.drafts.length, 6);
assert.deepStrictEqual(basic.drafts[0].payload.values, [1, 2, 3]);
assert.deepStrictEqual(basic.drafts[1].payload.values, [1, 3, 2]);

// nested lists are treated as single elements
const nested = evaluatePermutationsLens({
  params: { bag: [[0, 1], 2, 3] },
  ...buildContext()
});
assert.ok(nested.drafts.some((draft) => JSON.stringify(draft.payload.values) === JSON.stringify([[0, 1], 2, 3])));

// limit parameter caps the number of drafts
const limited = evaluatePermutationsLens({
  params: { bag: [0, 1, 2, 3], maxPermutations: 3 },
  ...buildContext()
});
assert.strictEqual(limited.drafts.length, 3);
const limitedKeys = new Set(limited.drafts.map((draft) => JSON.stringify(draft.payload.values)));
assert.strictEqual(limitedKeys.size, limited.drafts.length);

// deduplicate drops repeated permutations
const deduped = evaluatePermutationsLens({
  params: { bag: [1, 1, 2], removeDuplicates: true },
  ...buildContext()
});
assert.strictEqual(deduped.drafts.length, 3);

// warn when draft count exceeds 7!
const warningResult = evaluatePermutationsLens({
  params: { bag: [0, 1, 2, 3, 4, 5, 6, 7], maxPermutations: 5050 },
  ...buildContext()
});
assert.strictEqual(warningResult.drafts.length, 5050);
assert.ok(warningResult.warnings.some((message) => message.includes("7!")));

console.log("permutationsLens tests ok");
