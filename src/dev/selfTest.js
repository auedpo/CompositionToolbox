import { makeDraft, makeMaterialFromDraft, makeClipFromMaterial } from "../core/model.js";
import { assertClip, assertDraft, assertMaterial, invariant } from "../core/invariants.js";

function resolveInput(ref, runtime) {
  if (!ref) return null;
  if (ref.mode === "active" && ref.sourceLensInstanceId) {
    const source = runtime.lensInstancesById.get(ref.sourceLensInstanceId);
    if (!source || !source.activeDraftId) return null;
    return runtime.draftIndex.get(source.activeDraftId) || null;
  }
  if (ref.mode === "pinned" && ref.sourceDraftId) {
    return runtime.draftIndex.get(ref.sourceDraftId) || null;
  }
  return null;
}

const fakeDraft = makeDraft({
  lensType: "pitchlist",
  lensInstanceId: "lensA",
  payload: [[0, 1], [2, 3]],
  summary: "Fake draft",
  provenance: {
    lensType: "selfTest",
    paramsHash: "selfTest",
    inputRefs: [],
    createdAt: Date.now()
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
const pinnedRef = { mode: "pinned", sourceDraftId: fakeDraft.draftId };

const activeResolved = resolveInput(activeRef, runtime);
const pinnedResolved = resolveInput(pinnedRef, runtime);

invariant(activeResolved && activeResolved.draftId === fakeDraft.draftId, "Active routing failed.");
invariant(pinnedResolved && pinnedResolved.draftId === fakeDraft.draftId, "Pinned routing failed.");

console.log("selfTest ok");
