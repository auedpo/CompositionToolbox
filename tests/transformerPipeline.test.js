import assert from "node:assert/strict";
import { ensureDefaultSignalFlowSelections } from "../src/transformerPipeline.js";
import { makeDraft } from "../src/core/invariants.js";

function buildDraft(id) {
  return makeDraft({
    draftId: id,
    lensId: "test",
    lensInstanceId: "lens-test",
    type: "numeric",
    values: [id.length]
  });
}

function buildGenerator(id, draft, token = 1) {
  return {
    lensInstanceId: id,
    lens: { meta: { id: "source" } },
    currentDrafts: [draft],
    activeDraft: draft,
    activeDraftId: draft ? draft.draftId : null,
    activeDraftIndex: 0,
    _updateToken: token
    ,
    path: [1]
  };
}

function buildLensInstance(id, inputs = [], path = [2]) {
  return {
    lensInstanceId: id,
    lens: {
      meta: { id: "passthrough" },
      inputs
    },
    selectedInputRefsByRole: {},
    _liveInputRefs: {},
    _liveInputSource: {},
    _liveSourceTokens: {},
    _lastLiveDraftIdByRole: {}
    ,
    path
  };
}

function buildTrack(lensIds) {
  return {
    id: `track_${lensIds.join("_")}`,
    lensInstanceIds: lensIds.slice()
  };
}

{
  const firstDraft = buildDraft("draftA");
  const generator = buildGenerator("gen", firstDraft, 1);
  const transformer = buildLensInstance("trans", [{ role: "input", required: true }]);
  const tracks = [buildTrack([generator.lensInstanceId, transformer.lensInstanceId])];
  const lensInstances = new Map([
    [generator.lensInstanceId, generator],
    [transformer.lensInstanceId, transformer]
  ]);
  const scheduleCalls = [];
  const scheduleLens = (instance) => scheduleCalls.push(instance.lensInstanceId);

  ensureDefaultSignalFlowSelections(tracks, lensInstances, scheduleLens);
  assert.deepStrictEqual(transformer.selectedInputRefsByRole.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
  assert.deepStrictEqual(transformer._liveInputRefs.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
  assert.deepStrictEqual(scheduleCalls, [transformer.lensInstanceId]);

  const secondDraft = buildDraft("draftB");
  generator.currentDrafts = [secondDraft];
  generator.activeDraft = secondDraft;
  generator.activeDraftId = secondDraft.draftId;
  generator._updateToken = 2;

  ensureDefaultSignalFlowSelections(tracks, lensInstances, scheduleLens);
  assert.deepStrictEqual(scheduleCalls, [transformer.lensInstanceId, transformer.lensInstanceId]);
}

{
  const generator = buildGenerator("gen2", buildDraft("draftSame"), 5);
  const transformer = buildLensInstance("trans2", [{ role: "input", required: true }]);
  transformer.selectedInputRefsByRole.input = { mode: "freeze", sourceDraftId: "legacy" };
  const tracks = [buildTrack([generator.lensInstanceId, transformer.lensInstanceId])];
  const lensInstances = new Map([
    [generator.lensInstanceId, generator],
    [transformer.lensInstanceId, transformer]
  ]);
  const scheduleCalls = [];
  const scheduleLens = (instance) => scheduleCalls.push(instance.lensInstanceId);

  ensureDefaultSignalFlowSelections(tracks, lensInstances, scheduleLens);
  assert.deepStrictEqual(scheduleCalls, []);
  assert.deepStrictEqual(transformer.selectedInputRefsByRole.input, { mode: "freeze", sourceDraftId: "legacy" });
}

{
  const firstDraft = buildDraft("draftA");
  const generator = buildGenerator("gen-multi", firstDraft, 1);
  const transformerA = buildLensInstance("transA", [{ role: "input", required: true }]);
  const transformerB = buildLensInstance("transB", [{ role: "input", required: true }]);
  const tracks = [buildTrack([generator.lensInstanceId, transformerA.lensInstanceId, transformerB.lensInstanceId])];
  const lensInstances = new Map([
    [generator.lensInstanceId, generator],
    [transformerA.lensInstanceId, transformerA],
    [transformerB.lensInstanceId, transformerB]
  ]);
  const scheduleCalls = [];
  const scheduleLens = (instance) => scheduleCalls.push(instance.lensInstanceId);

  transformerA.currentDrafts = [buildDraft("draftTransA")];
  transformerA.activeDraft = transformerA.currentDrafts[0];
  transformerA.activeDraftId = transformerA.activeDraft.draftId;
  ensureDefaultSignalFlowSelections(tracks, lensInstances, scheduleLens);
  assert.deepStrictEqual(transformerA.selectedInputRefsByRole.input, {
    mode: "active",
    sourceLensInstanceId: generator.lensInstanceId
  });
  assert.deepStrictEqual(transformerB.selectedInputRefsByRole.input, {
    mode: "active",
    sourceLensInstanceId: transformerA.lensInstanceId
  });
  assert.deepStrictEqual(scheduleCalls, [transformerA.lensInstanceId, transformerB.lensInstanceId]);
}

console.log("transformerPipeline tests ok");
