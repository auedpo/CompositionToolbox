import { getLens } from "../lenses/lensRegistry.js";

function formatErrorMessage(error) {
  if (!error) return "Lens evaluation failed.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Lens evaluation failed.";
  return "Lens evaluation failed.";
}

export const lensHost = {
  apply({ lensId, params, lensInput, inputDraft, context } = {}) {
    const lens = getLens(lensId);
    if (!lens || typeof lens.evaluate !== "function") {
      return { drafts: [], error: `Lens "${lensId}" missing evaluate().` };
    }
    const safeParams = params && typeof params === "object" ? params : {};
    const safeLensInput = lensInput && typeof lensInput === "object" ? lensInput : {};
    const lensInstanceId = context && context.lensInstanceId
      ? context.lensInstanceId
      : `${lensId || "lens"}-instance`;
    const instance = {
      lens,
      lensInstanceId,
      paramsValues: safeParams,
      lensInputValues: safeLensInput,
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
    const upstreamInstance = inputDraft
      ? { lensInstanceId: inputDraft.lensInstanceId, activeDraft: inputDraft }
      : null;
    const draftCatalog = inputDraft ? [inputDraft] : [];
    const lensContext = {
      lensId,
      lensInstanceId,
      instance,
      draftCatalog,
      getLensInstanceById: () => null,
      upstreamInstance,
      ...(context || {})
    };
    let result = null;
    try {
      result = lens.evaluate({
        params: safeParams,
        lensInput: safeLensInput,
        context: lensContext
      });
    } catch (error) {
      return { drafts: [], error: formatErrorMessage(error) };
    }
    if (!result || result.ok === false) {
      const errors = Array.isArray(result && result.errors) ? result.errors.filter(Boolean) : [];
      if (errors.length) {
        return { drafts: [], error: errors.join(" ") };
      }
      return { drafts: [] };
    }
    return { drafts: Array.isArray(result.drafts) ? result.drafts : [] };
  }
};

