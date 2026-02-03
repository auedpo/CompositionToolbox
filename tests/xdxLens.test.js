import assert from "node:assert/strict";
import { makeDraft } from "../src/core/invariants.js";
import { evaluateXdxLens, xdxLens } from "../src/lenses/xdxLens.js";

function buildDraft(payload) {
  return makeDraft({
    draftId: "draft-xdx",
    lensId: "source-test",
    lensInstanceId: "source-instance",
    type: "numeric",
    summary: "Source list",
    values: payload
  });
}

function makeContext(draft) {
  return {
    lensId: "xdx",
    lensInstanceId: "xdx-test",
    instance: {
      lens: xdxLens,
      lensInstanceId: "xdx-test",
      selectedInputRefsByRole: draft
        ? { source: { mode: "freeze", sourceDraftId: draft.draftId } }
        : {},
      lensInputValues: {},
      _liveInputRefs: {}
    },
    draftCatalog: draft ? [draft] : [],
    getLensInstanceById: () => null,
    upstreamInstance: null
  };
}

{
  const result = evaluateXdxLens({
    params: {
      mode: "x->dx (points to intervals)",
      values: [6000, 6700, 6900]
    },
    context: makeContext(null)
  });
  assert.ok(result.ok, result.errors);
  assert.strictEqual(result.vizModel.mode, "x->dx (points to intervals)");
  assert.deepStrictEqual(result.vizModel.inputValues, [6000, 6700, 6900]);
  assert.deepStrictEqual(result.drafts[0].payload.values, [700, 200]);
}

{
  const input = buildDraft([700, 200]);
  const result = evaluateXdxLens({
    params: {
      mode: "dx->x (intervals to points)",
      start: 6000
    },
    context: makeContext(input)
  });
  assert.ok(result.ok, result.errors);
  assert.strictEqual(result.vizModel.mode, "dx->x (intervals to points)");
  assert.strictEqual(result.vizModel.start, 6000);
  assert.deepStrictEqual(result.vizModel.inputValues, [700, 200]);
  assert.deepStrictEqual(result.drafts[0].payload.values, [6000, 6700, 6900]);
}

console.log("xdxLens tests ok");
