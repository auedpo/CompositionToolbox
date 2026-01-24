import assert from "node:assert/strict";
import { ensureSingleInputTransformerSelections } from "../src/transformerPipeline.js";

function buildDraft(id) {
  return {
    id,
    type: "pitchList",
    payload: { label: id }
  };
}

function buildGenerator(id, draft, token = 1) {
  return {
    id,
    lens: { meta: { id: "intervalPlacement", kind: "generator" } },
    currentDrafts: [draft],
    activeDraft: draft,
    activeDraftId: draft.id,
    activeDraftIndex: 0,
    _updateToken: token
  };
}

function buildTransformer(id) {
  return {
    id,
    lens: {
      meta: { id: "passthrough", kind: "transformer" },
      inputs: [{ role: "input", required: true }]
    },
    selectedInputDraftIdsByRole: {},
    _liveInputs: {},
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
  const tracks = [buildTrack(generator.id, transformer.id)];
  const lensInstances = new Map([
    [generator.id, generator],
    [transformer.id, transformer]
  ]);
  const scheduleCalls = [];
  const scheduleLens = (instance) => scheduleCalls.push(instance.id);

  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.strictEqual(transformer._liveInputs.input, firstDraft);
  assert.strictEqual(transformer.selectedInputDraftIdsByRole.input, firstDraft.id);
  assert.deepStrictEqual(scheduleCalls, [transformer.id]);

  const secondDraft = buildDraft("draftB");
  generator.currentDrafts = [secondDraft];
  generator.activeDraft = secondDraft;
  generator.activeDraftId = secondDraft.id;
  generator._updateToken = 2;

  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.strictEqual(transformer._liveInputs.input, secondDraft);
  assert.strictEqual(transformer.selectedInputDraftIdsByRole.input, secondDraft.id);
  assert.deepStrictEqual(scheduleCalls, [transformer.id, transformer.id]);
}

{
  const draft = buildDraft("draftSame");
  const generator = buildGenerator("gen2", draft, 5);
  const transformer = buildTransformer("trans2");
  const tracks = [buildTrack(generator.id, transformer.id)];
  const lensInstances = new Map([
    [generator.id, generator],
    [transformer.id, transformer]
  ]);
  const scheduleCalls = [];
  const scheduleLens = (instance) => scheduleCalls.push(instance.id);

  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.strictEqual(scheduleCalls.length, 1);

  generator._updateToken = 6;
  ensureSingleInputTransformerSelections(tracks, lensInstances, scheduleLens);
  assert.strictEqual(scheduleCalls.length, 2);
  assert.strictEqual(transformer.selectedInputDraftIdsByRole.input, draft.id);
}

console.log("transformerPipeline tests ok");
