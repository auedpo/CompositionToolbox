import assert from "node:assert/strict";
import { makeDraft } from "../core/invariants.js";
import { makeMaterialFromDraft, makeClipFromMaterial } from "../core/model.js";

const draft = makeDraft({
  lensId: "lifecycle",
  lensInstanceId: "lifecycle-instance",
  type: "numeric",
  summary: "Lifecycle draft",
  values: [1, 2, 3]
});

assert.ok(!Object.prototype.hasOwnProperty.call(draft, "materialId"), "Draft must not carry materialId.");
assert.ok(!Object.prototype.hasOwnProperty.call(draft, "clipId"), "Draft must not carry clipId.");

const material = makeMaterialFromDraft(draft, { name: "Lifecycle material" });
assert.ok(!Object.prototype.hasOwnProperty.call(material, "draftId"), "Material must not be a Draft.");
assert.ok(typeof material.materialId === "string", "Material must have materialId.");
assert.ok(material.provenance && material.provenance.sourceDraftId === draft.draftId, "Material tracks source draft.");

const clip = makeClipFromMaterial(material.materialId, { laneId: 1, start: 0, duration: 4 });
assert.ok(!Object.prototype.hasOwnProperty.call(clip, "draftId"), "Clip must not reference draftId.");
assert.ok(clip.materialId === material.materialId, "Clip must reference materialId.");

console.log("lifecycleSeparation tests ok");
