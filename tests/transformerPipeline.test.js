import assert from "node:assert/strict";
import { ensureSingleInputTransformerSelections } from "../src/transformerPipeline.js";

function buildDraft(id) {
  return {
    draftId: id,
    type: "pitchList",
    payload: [id.length]
  };
}

function buildGenerator(id, draft, token = 1) {
  return {
    lensInstanceId: id,
    lens: { meta: { id: "intervalPlacement", kind: "generator" } },
    currentDrafts: [draft],
    activeDraft: draft,
    activeDraftId: draft.draftId,
    activeDraftIndex: 0,
    _updateToken: token
  };
}

function buildTransformer(id) {
  return {
    lensInstanceId: id,
    lens: {
      meta: { id: "passthrough", kind: "transformer" },
      inputs: [{ role: "input", required: true }]
    },
    selectedInputRefsByRole: {},
    _liveInputRefs: {},
    _liveInputSource: {},
    _lastLiveDraftIdByRole: {},
    _liveSourceTokens: {}
  };
}

function buildTrack(generatorId, transformerId) {
  return {
    id: `track_${generatorId}`,
    generatorInstanceId: generatorId,
    transformerInstanceIds: [transformerId]
  };
}

{
  const firstDraft = buildDraft("draftA");
  const generator = buildGenerator("gen", firstDraft, 1);
  const transformer = buildTransformer("trans");
  const tracks = [buildTrack(generator.lensInstanceId, transformer.lensInstanceId)];
  const lensInstances = new Map([
    [generator.lensInstanceId, generator],
    [transformer.lensInstanceId, transformer]
  ]);
  const scheduleCalls = [];
  const scheduleLens = (instance) => scheduleCalls.push(instance.lensInstanceId);

  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.deepStrictEqual(transformer._liveInputRefs.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
  assert.deepStrictEqual(transformer.selectedInputRefsByRole.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
  assert.deepStrictEqual(scheduleCalls, [transformer.lensInstanceId]);

  const secondDraft = buildDraft("draftB");
  generator.currentDrafts = [secondDraft];
  generator.activeDraft = secondDraft;
  generator.activeDraftId = secondDraft.draftId;
  generator._updateToken = 2;

  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.deepStrictEqual(transformer._liveInputRefs.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
  assert.deepStrictEqual(transformer.selectedInputRefsByRole.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
  assert.deepStrictEqual(scheduleCalls, [transformer.lensInstanceId, transformer.lensInstanceId]);
}

{
  const draft = buildDraft("draftSame");
  const generator = buildGenerator("gen2", draft, 5);
  const transformer = buildTransformer("trans2");
  const tracks = [buildTrack(generator.lensInstanceId, transformer.lensInstanceId)];
  const lensInstances = new Map([
    [generator.lensInstanceId, generator],
    [transformer.lensInstanceId, transformer]
  ]);
  const scheduleCalls = [];
  const scheduleLens = (instance) => scheduleCalls.push(instance.lensInstanceId);

  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.strictEqual(scheduleCalls.length, 1);

  generator._updateToken = 6;
  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.strictEqual(scheduleCalls.length, 2);
  assert.deepStrictEqual(transformer.selectedInputRefsByRole.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
}

console.log("transformerPipeline tests ok");
