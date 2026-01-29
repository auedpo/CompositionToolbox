import assert from "node:assert/strict";
import { listLenses } from "../../src/lenses/lensRegistry.js";
import { runLens } from "../../src/core/lensHost.js";
import { assertDraft, makeDraft } from "../../src/core/invariants.js";

const smokeInput = makeDraft({
  lensId: "smoke-input",
  lensInstanceId: "smoke-input-instance",
  type: "numeric",
  summary: "Smoke input",
  values: [1, 2, 3, 4]
});

listLenses().forEach((lens) => {
  const lensId = lens.meta && lens.meta.id ? lens.meta.id : "unknown";
  const lensInstanceId = `smoke-${lensId}`;
  const result = runLens({
    lens,
    lensId,
    lensInstanceId,
    params: {},
    generatorInput: {},
    inputDraft: smokeInput
  });

  if (result.error) {
    const requiresInput = Array.isArray(lens.inputs)
      && lens.inputs.some((spec) => !spec || spec.required !== false);
    assert.ok(requiresInput, `${lensId} failed without declared input requirement.`);
    assert.ok(result.error.message, `${lensId} error should have a message.`);
    return;
  }

  assert.ok(Array.isArray(result.drafts), `${lensId} drafts should be an array.`);
  result.drafts.forEach((draft) => {
    assertDraft(draft);
  });
});

console.log("lensRegistrySmoke tests ok");
