// Purpose: lensHost.js provides exports: lensHost.
// Interacts with: imports: ../lenses/lensRegistry.js.
// Role: core domain layer module within the broader app graph.
import { getLens } from "../lenses/lensRegistry.js";

const DEBUG_LENS_HOST = false;

function formatErrorMessage(error) {
  if (!error) return "Lens evaluation failed.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Lens evaluation failed.";
  return "Lens evaluation failed.";
}

function debug(...args) {
  if (!DEBUG_LENS_HOST || !import.meta.env || !import.meta.env.DEV) return;
  console.log(...args);
}

export const lensHost = {
  apply({ lensId, params, inputDraft, context } = {}) {
    const lens = getLens(lensId);
    if (!lens || typeof lens.evaluate !== "function") {
      return { drafts: [], error: `Lens "${lensId}" missing evaluate().` };
    }
    const safeParams = params && typeof params === "object" ? params : {};
    const lensInstanceId = context && context.lensInstanceId
      ? context.lensInstanceId
      : `${lensId || "lens"}-instance`;
    const instance = {
      lens,
      lensInstanceId,
      paramsValues: safeParams,
      lensInputValues: {},
      selectedInputRefsByRole: {},
      _liveInputRefs: {}
    };
    const upstreamDraft = inputDraft || null;
    const upstreamInstance = upstreamDraft
      ? { lensInstanceId: upstreamDraft.lensInstanceId, activeDraft: upstreamDraft }
      : null;
    const draftCatalog = upstreamDraft ? [upstreamDraft] : [];
    const lensContext = {
      lensId,
      lensInstanceId,
      trackId: context && context.trackId ? context.trackId : undefined,
      draftCatalog,
      upstreamDraft,
      instance,
      upstreamInstance
    };
    let result = null;
    try {
      debug(
        "[LENS APPLY]",
        lensId,
        {
          params,
          hasInput: !!upstreamDraft,
          inputPreview: upstreamDraft?.numericTree ?? upstreamDraft?.values ?? null
        }
      );
      result = lens.evaluate({
        params: safeParams,
        lensInput: {},
        context: lensContext
      });
      debug(
        "[LENS OUTPUT]",
        lensId,
        result
      );
    } catch (error) {
      return { drafts: [], error: formatErrorMessage(error) };
    }
    if (result && result.error) {
      return { drafts: [], error: formatErrorMessage(result.error) };
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
