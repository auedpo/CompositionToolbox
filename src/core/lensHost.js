import {
  assertDraft,
  assertDraftKeys,
  DraftInvariantError,
  isNumericTree,
  makeDraft,
  normalizeDraft
} from "./invariants.js";

function coerceDraft(raw, { lensId, lensInstanceId }) {
  if (isNumericTree(raw)) {
    return makeDraft({
      lensId,
      lensInstanceId,
      type: lensId,
      values: raw
    });
  }
  if (!raw || typeof raw !== "object") {
    throw new DraftInvariantError("Lens output must be a draft or numeric tree.");
  }
  const payload = raw.payload;
  const hasPayload = payload && typeof payload === "object" && payload.kind === "numericTree";
  if (!hasPayload) {
    throw new DraftInvariantError("Lens output payload must be numericTree.");
  }
  const hasDraftIdentity = Boolean(
    raw.draftId && raw.lensId && raw.lensInstanceId && raw.type
  );
  if (hasDraftIdentity) {
    assertDraft(raw);
    if (import.meta.env && import.meta.env.DEV) {
      assertDraftKeys(raw);
    }
    return raw;
  }
  return normalizeDraft(raw, { lensId, lensInstanceId });
}

export function runLens({
  lens,
  lensId,
  lensInstanceId,
  params,
  inputDraft,
  generatorInput,
  context
} = {}) {
  if (!lens || typeof lens.evaluate !== "function") {
    return { drafts: [], error: new Error("LensHost requires a lens with evaluate().") };
  }
  const resolvedLensId = lensId || (lens.meta && lens.meta.id) || "unknown";
  const resolvedInstanceId = lensInstanceId || `${resolvedLensId}-instance`;
  const instance = {
    lens,
    lensInstanceId: resolvedInstanceId,
    paramsValues: params || {},
    generatorInputValues: generatorInput || {},
    selectedInputRefsByRole: {},
    _liveInputRefs: {}
  };
  if (inputDraft && Array.isArray(lens.inputs) && lens.inputs.length) {
    lens.inputs.forEach((spec) => {
      if (!spec || !spec.role) return;
      instance.selectedInputRefsByRole[spec.role] = {
        mode: "freeze",
        sourceDraftId: inputDraft.draftId
      };
    });
  }
  const draftCatalog = inputDraft ? [inputDraft] : [];
  const lensContext = {
    lensId: resolvedLensId,
    lensInstanceId: resolvedInstanceId,
    instance,
    draftCatalog,
    getLensInstanceById: () => null,
    upstreamInstance: null,
    ...(context || {})
  };
  let result = null;
  try {
    result = lens.evaluate({
      params: params || {},
      generatorInput: generatorInput || {},
      context: lensContext
    });
  } catch (error) {
    return { drafts: [], error };
  }
  if (!result || !result.ok) {
    const errorMessage = result && Array.isArray(result.errors) && result.errors.length
      ? result.errors.join(" ")
      : (result && result.message ? result.message : "Lens evaluation failed.");
    return { drafts: [], error: new Error(errorMessage) };
  }
  try {
    const rawDrafts = Array.isArray(result.drafts) ? result.drafts : [];
    const drafts = rawDrafts.map((draft) => coerceDraft(draft, {
      lensId: resolvedLensId,
      lensInstanceId: resolvedInstanceId
    }));
    return { drafts };
  } catch (error) {
    return { drafts: [], error };
  }
}
