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

console.log("selfTest ok");
