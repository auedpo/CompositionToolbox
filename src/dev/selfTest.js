import { makeMaterialFromDraft, makeClipFromMaterial } from "../core/model.js";
import {
  assertClip,
  assertDraft,
  assertMaterial,
  invariant,
  isNumericTree,
  makeDraft
} from "../core/invariants.js";
import { createLensInstance, materializeDrafts, scheduleLensEvaluation } from "../lenses/lensRuntime.js";
import { evaluateShiftSweepLens } from "../lenses/transformers/shiftSweep.js";
import { normalizeLensInstanceGridFields } from "../core/gridNormalization.js";
import {
  buildLaneRowIndex,
  describeResolvedUpstream,
  findNearestUpstreamLens,
  getLaneIdForLens,
  getRowForLens,
  resolveSourceLaneId
} from "../core/laneRowRouting.js";
import { ensureDefaultSignalFlowSelections } from "../transformerPipeline.js";

function resolveInput(ref, runtime) {
  if (!ref) return null;
  if (ref.mode === "active" && ref.sourceLensInstanceId) {
    const source = runtime.lensInstancesById.get(ref.sourceLensInstanceId);
    if (!source || !source.activeDraftId) return null;
    return runtime.draftIndex.get(source.activeDraftId) || null;
  }
  if (ref.mode === "freeze" && ref.sourceDraftId) {
    return runtime.draftIndex.get(ref.sourceDraftId) || null;
  }
  return null;
}

const fakeDraft = makeDraft({
  lensId: "selfTest",
  lensInstanceId: "lensA",
  type: "pitchlist",
  summary: "Fake draft",
  values: [[0, 1], [2, 3]],
  meta: {
    provenance: {
      lensType: "selfTest",
      paramsHash: "selfTest",
      inputRefs: [],
      createdAt: Date.now()
    }
  }
});
assertDraft(fakeDraft);

const material = makeMaterialFromDraft(fakeDraft, { name: "Fake material" });
assertMaterial(material);

const clip = makeClipFromMaterial(material.materialId, { laneId: 0, start: 0, duration: 2 });
assertClip(clip);

const runtime = {
  lensInstancesById: new Map([
    ["lensA", { lensInstanceId: "lensA", activeDraftId: fakeDraft.draftId }]
  ]),
  draftIndex: new Map([[fakeDraft.draftId, fakeDraft]])
};

const activeRef = { mode: "active", sourceLensInstanceId: "lensA" };
const freezeRef = { mode: "freeze", sourceDraftId: fakeDraft.draftId };

const activeResolved = resolveInput(activeRef, runtime);
const freezeResolved = resolveInput(freezeRef, runtime);

invariant(activeResolved && activeResolved.draftId === fakeDraft.draftId, "Active routing failed.");
invariant(freezeResolved && freezeResolved.draftId === fakeDraft.draftId, "Freeze routing failed.");

const numericPass = [1, [1, 2, 3], [[0, 1], [2, [3]]]];
numericPass.forEach((value) => {
  invariant(isNumericTree(value), "isNumericTree should accept numeric trees.");
});
const numericFail = [["1"], [1, "2"], { a: 1 }, [NaN], [Infinity], null];
numericFail.forEach((value) => {
  invariant(!isNumericTree(value), "isNumericTree should reject non-numeric trees.");
});

const fakeLens = { meta: { id: "selfTestLens", kind: "generator" } };
const wrappedDrafts = materializeDrafts({
  lens: fakeLens,
  lensInstanceId: "lensWrapped",
  evaluateResult: { ok: true, drafts: [[0, 2, 4]] },
  inputs: [],
  params: {},
  generatorInput: {},
  context: {}
});
invariant(wrappedDrafts.length === 1, "materializeDrafts should wrap value-only outputs.");
invariant(wrappedDrafts[0].payload.kind === "numericTree", "materializeDrafts should set payload.kind.");

const baselineDraft = makeDraft({
  lensId: "baseline",
  lensInstanceId: "baseline-instance",
  type: "numeric",
  values: [1, 2, 3]
});
const invalidLens = {
  meta: { id: "invalidLens", kind: "generator" },
  evaluate: () => ({
    ok: true,
    drafts: [{
      type: "numeric",
      payload: { kind: "numericTree", values: [1, "2"] },
      summary: "Bad draft"
    }]
  })
};
const invalidInstance = createLensInstance(invalidLens, "invalid-instance");
invalidInstance.currentDrafts = [baselineDraft];
invalidInstance.activeDraftId = baselineDraft.draftId;
scheduleLensEvaluation(invalidInstance, {
  getContext: () => ({
    lensId: invalidLens.meta.id,
    lensInstanceId: invalidInstance.lensInstanceId
  }),
  getDraftCatalog: () => [],
  getLensInstanceById: () => null,
  onUpdate: () => {},
  debounceMs: 0
});
setTimeout(() => {
  invariant(invalidInstance.lastError, "Invalid draft should set lastError.");
  invariant(invalidInstance.currentDrafts[0].draftId === baselineDraft.draftId, "Invalid draft should not replace currentDrafts.");
}, 0);

const transformerInput = makeDraft({
  lensId: "input",
  lensInstanceId: "input-instance",
  type: "numeric",
  values: [3, 5, 7]
});
const transformerResult = evaluateShiftSweepLens({
  inputs: [{ draft: transformerInput }],
  params: { count: 2, step: 1 },
  context: { lensId: "shiftSweep", lensInstanceId: "shiftSweep-test" }
});
invariant(transformerResult.ok, "Transformer should produce drafts.");
invariant(transformerResult.drafts[0].payload.kind === "numericTree", "Transformer drafts should use numericTree payload.");

{
  const instance = {
    row: NaN,
    selectedInputLaneByRole: {
      primary: "missing-lane"
    }
  };
  normalizeLensInstanceGridFields({
    instance,
    track: { id: "track-a" },
    indexInTrack: 0,
    lensDefinition: { inputs: [{ role: "primary" }] },
    laneIds: ["track-a"]
  });
  invariant(instance.row === 0, "Dev normalization should default row to the index.");
  invariant(instance.selectedInputLaneByRole.primary === "auto", "Dev normalization should fall back to auto for missing lanes.");
}

{
  const mockState = {
    tracks: [
      { id: "lane1", lensInstanceIds: ["lensA", "lensB"] },
      { id: "lane2", lensInstanceIds: ["lensC"] }
    ],
    lensInstancesById: new Map([
      ["lensA", { lensInstanceId: "lensA", row: 0 }],
      ["lensB", { lensInstanceId: "lensB", row: 3 }],
      ["lensC", { lensInstanceId: "lensC", row: 2 }]
    ])
  };
  const index = buildLaneRowIndex(mockState);
  invariant(getLaneIdForLens({ index, lensInstanceId: "lensC" }) === "lane2", "Lane lookup should return the correct track.");
  invariant(getRowForLens({ index, lensInstanceId: "lensA" }) === 0, "Row lookup should expose the normalized row.");
  invariant(
    findNearestUpstreamLens({ index, sourceLaneId: "lane1", targetRow: 2 }) === "lensA",
    "Should find the upstream lens strictly above row 2."
  );
  invariant(
    findNearestUpstreamLens({ index, sourceLaneId: "lane1", targetRow: 5 }) === "lensB",
    "Should find the nearest upstream lens above row 5."
  );
  invariant(
    findNearestUpstreamLens({ index, sourceLaneId: "lane2", targetRow: 2 }) === null,
    "Should not find any lens when the target row is not strictly above."
  );
  invariant(
    resolveSourceLaneId({ index, targetLaneId: "lane2", selection: "lane1" }) === "lane1",
    "Explicit lane selections stay intact."
  );
  invariant(
    resolveSourceLaneId({ index, targetLaneId: "lane2", selection: "auto" }) === "lane2",
    "Auto selections fall back to the target lane."
  );
  invariant(
    resolveSourceLaneId({ index, targetLaneId: "lane2", selection: "missing" }) === "lane2",
    "Missing lanes fall back to the target lane."
  );
  const descriptor = describeResolvedUpstream({ index, sourceLaneId: "lane1", targetRow: 5 });
  invariant(
    descriptor.upstreamLensInstanceId === "lensB" && descriptor.upstreamRow === 3,
    "Descriptor should surface the resolved candidate."
  );
}

{
  const laneADraft = makeDraft({
    lensId: "lane-source",
    lensInstanceId: "lane-source-a",
    type: "numeric",
    values: [1]
  });
  const laneBDraft = makeDraft({
    lensId: "lane-source",
    lensInstanceId: "lane-source-b",
    type: "numeric",
    values: [2]
  });
  const laneA = createLensInstance(
    { meta: { id: "generator", kind: "generator" }, evaluate: () => ({ ok: true, drafts: [] }) },
    "laneA"
  );
  laneA.currentDrafts = [laneADraft];
  laneA.activeDraft = laneADraft;
  laneA.activeDraftId = laneADraft.draftId;
  laneA._updateToken = 1;
  laneA.row = 0;
  const laneB = createLensInstance(
    { meta: { id: "generator", kind: "generator" }, evaluate: () => ({ ok: true, drafts: [] }) },
    "laneB"
  );
  laneB.currentDrafts = [laneBDraft];
  laneB.activeDraft = laneBDraft;
  laneB.activeDraftId = laneBDraft.draftId;
  laneB._updateToken = 1;
  laneB.row = 3;
  const laneTransformer = createLensInstance(
    {
      meta: { id: "transformer", kind: "transformer" },
      inputs: [{ role: "primary", required: true }],
      evaluate: () => ({ ok: true, drafts: [] })
    },
    "laneTransform"
  );
  laneTransformer.row = 2;
  laneTransformer.selectedInputLaneByRole = { primary: "lane1" };
  const tracks = [
    { id: "lane1", lensInstanceIds: [laneA.lensInstanceId, laneB.lensInstanceId] },
    { id: "lane2", lensInstanceIds: [laneTransformer.lensInstanceId] }
  ];
  const lensMap = new Map([
    [laneA.lensInstanceId, laneA],
    [laneB.lensInstanceId, laneB],
    [laneTransformer.lensInstanceId, laneTransformer]
  ]);
  const scheduleLens = () => {};
  ensureDefaultSignalFlowSelections(tracks, lensMap, scheduleLens, { workspace2: true });
  invariant(
    laneTransformer.selectedInputRefsByRole.primary.sourceLensInstanceId === laneA.lensInstanceId,
    "Lane transformer should attach to the upper lane source."
  );
  laneTransformer.row = 5;
  ensureDefaultSignalFlowSelections(tracks, lensMap, scheduleLens, { workspace2: true });
  invariant(
    laneTransformer.selectedInputRefsByRole.primary.sourceLensInstanceId === laneB.lensInstanceId,
    "Lane transformer should retarget to the next upstream after moving."
  );

  const laneNoUpstream = createLensInstance(
    {
      meta: { id: "transformer", kind: "transformer" },
      inputs: [{ role: "primary", required: true }],
      evaluate: () => ({ ok: true, drafts: [] })
    },
    "laneNoUpstream"
  );
  laneNoUpstream.row = 0;
  laneNoUpstream.selectedInputLaneByRole = { primary: "lane1" };
  tracks[1].lensInstanceIds.push(laneNoUpstream.lensInstanceId);
  lensMap.set(laneNoUpstream.lensInstanceId, laneNoUpstream);
  ensureDefaultSignalFlowSelections(tracks, lensMap, scheduleLens, { workspace2: true });
  invariant(
    Boolean(laneNoUpstream._missingUpstreamByRole?.primary?.message),
    "Missing upstream should register an error."
  );
  invariant(
    laneNoUpstream._missingUpstreamByRole.primary.message.includes("No upstream"),
    "Missing upstream message should mention the absent lane."
  );
  scheduleLensEvaluation(laneNoUpstream, {
    getContext: () => ({
      lensId: laneNoUpstream.lens.meta.id,
      lensInstanceId: laneNoUpstream.lensInstanceId
    }),
    getDraftCatalog: () => [],
    getLensInstanceById: (id) => lensMap.get(id) || null,
    getUpstreamInstance: () => null,
    onUpdate: () => {},
    debounceMs: 0
  });
  setTimeout(() => {
    invariant(
      Array.isArray(laneNoUpstream.evaluateResult.errors)
        && laneNoUpstream.evaluateResult.errors.some((msg) => msg.includes("No upstream")),
      "Evaluation should register the missing upstream error."
    );
    invariant(
      laneNoUpstream.lastError && laneNoUpstream.lastError.includes("No upstream"),
      "lastError should describe the missing upstream."
    );
  }, 0);
}

console.log("selfTest ok");
