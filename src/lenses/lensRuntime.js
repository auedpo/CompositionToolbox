import { hashParams } from "../core/model.js";
import { assertDraft, assertDraftKeys, DraftInvariantError, normalizeDraft } from "../core/invariants.js";
import { resolveValuesForRole } from "./inputResolution.js";

function buildDefaults(specs) {
  const values = {};
  (specs || []).forEach((spec) => {
    values[spec.key] = Array.isArray(spec.default) ? spec.default.slice() : spec.default;
  });
  return values;
}

function normalizeListInput(value, kind) {
  if (Array.isArray(value)) return value.slice();
  if (typeof value === "string") {
    const parts = value.split(/[,\s]+/).filter(Boolean);
    if (kind === "list:int") {
      return parts.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v));
    }
    if (kind === "list:number") {
      return parts.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    }
  }
  return [];
}

function normalizeSpecValue(spec, value) {
  if (spec.kind === "list:int" || spec.kind === "list:number") {
    return normalizeListInput(value, spec.kind);
  }
  if (spec.kind === "int") {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return spec.default;
    return parsed;
  }
  if (spec.kind === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return spec.default;
    return parsed;
  }
  if (spec.kind === "bool") {
    return Boolean(value);
  }
  return value;
}

function gatherResolvedInputs({
  lens,
  instance,
  draftCatalog,
  getLensInstanceById,
  upstreamInstance
}) {
  const inputSpecs = Array.isArray(lens.inputs) ? lens.inputs : [];
  return inputSpecs.map((spec) => {
    const result = resolveValuesForRole({
      instance,
      roleSpec: spec,
      upstreamInstance,
      getLensInstanceById,
      draftCatalog
    });
    if (!result.ok || !result.draft) return null;
    return {
      role: spec.role,
      draft: result.draft,
      draftId: result.draft.draftId,
      ref: result.ref
    };
  }).filter(Boolean);
}

function handleMissingUpstream(instance, onUpdate) {
  if (!instance || !instance._missingUpstreamByRole) return false;
  const entries = Object.values(instance._missingUpstreamByRole).filter(Boolean);
  if (!entries.length) return false;
  const messages = entries
    .map((entry) => entry && entry.message)
    .filter(Boolean);
  if (!messages.length) return false;
  const combined = messages.join(" ");
  instance.evaluateResult = { ok: false, drafts: [], errors: messages };
  instance.lastError = combined;
  instance.currentDrafts = [];
  instance.activeDraftIndex = null;
  instance.activeDraftId = null;
  instance.activeDraft = null;
  if (typeof onUpdate === "function") onUpdate(instance);
  return true;
}

export function createLensInstance(lens, lensInstanceId) {
  const paramsValues = buildDefaults(lens.params);
  const lensInputValues = buildDefaults(lens.lensInputs);
    return {
      lens,
      lensInstanceId,
      paramsValues,
      lensInputValues,
      _updateToken: 0,
      activeDraftIndex: null,
      activeDraft: null,
      selectedInputRefsByRole: {},
      selectedInputLaneByRole: {},
      row: null,
      activeDraftId: null,
      vizCollapsed: false,
      evaluateResult: { ok: false, drafts: [] },
      currentDrafts: [],
      lastError: null
    };
  }

export function updateSpecValue(state, specs, key, value) {
  const spec = (specs || []).find((entry) => entry.key === key);
  if (!spec) return;
  state[key] = normalizeSpecValue(spec, value);
}

export function materializeDrafts({
  lens,
  lensInstanceId,
  evaluateResult,
  inputs,
  params,
  lensInput,
  context
}) {
  const drafts = (evaluateResult && Array.isArray(evaluateResult.drafts)) ? evaluateResult.drafts : [];
  const now = Date.now();
  return drafts.map((draft, idx) => {
    const rawSummary = draft && typeof draft === "object" && typeof draft.summary === "string"
      ? draft.summary
      : null;
    const rawType = draft && typeof draft === "object" && typeof draft.type === "string"
      ? draft.type
      : lens.meta.id;
    const summary = rawSummary || `${rawType} draft`;
    const inputRefs = inputs.map((input) => ({
      role: input.role,
      ...(input.ref || { mode: "freeze", sourceDraftId: input.draftId })
    }));
    const provenance = {
      lensType: lens.meta.id,
      paramsHash: hashParams({ params: params || {}, lensInput: lensInput || {} }),
      inputRefs,
      createdAt: now,
      ...(draft && draft.meta && typeof draft.meta === "object"
        && draft.meta.provenance && typeof draft.meta.provenance === "object"
        ? draft.meta.provenance
        : {})
    };
    const normalized = normalizeDraft(draft, {
      lensId: lens.meta.id,
      lensInstanceId
    });
    const nextMeta = normalized.meta && typeof normalized.meta === "object"
      ? { ...normalized.meta }
      : {};
    nextMeta.provenance = provenance;
    return {
      ...normalized,
      summary: typeof normalized.summary === "string" ? normalized.summary : summary,
      meta: nextMeta
    };
  });
}

export function scheduleLensEvaluation(instance, options) {
  const {
    getContext,
    getDraftCatalog,
    getLensInstanceById,
    getUpstreamInstance,
    onUpdate,
    debounceMs = 80
  } = options;

  if (instance._timer) {
    clearTimeout(instance._timer);
  }
  const token = (instance._token || 0) + 1;
  instance._token = token;
  instance._timer = setTimeout(() => {
    if (handleMissingUpstream(instance, onUpdate)) {
      return;
    }
    const draftCatalog = typeof getDraftCatalog === "function" ? getDraftCatalog() : [];
    const context = typeof getContext === "function" ? getContext() : {};
    const upstreamInstance = typeof getUpstreamInstance === "function"
      ? getUpstreamInstance(instance)
      : null;
    context.draftCatalog = draftCatalog;
    context.getLensInstanceById = getLensInstanceById;
    context.upstreamInstance = upstreamInstance;
    context.instance = instance;
    let result = null;
    try {
      result = instance.lens.evaluate({
        lensInput: instance.lensInputValues,
        params: instance.paramsValues,
        context
      });
    } catch (error) {
      instance.evaluateResult = {
        ok: false,
        drafts: [],
        errors: [error && error.message ? error.message : "Evaluation failed."]
      };
      instance.lastError = instance.evaluateResult.errors.join(" ");
      if (typeof onUpdate === "function") onUpdate(instance);
      return;
    }
    if (instance._token !== token) return;
    instance.evaluateResult = result || { ok: false, drafts: [] };
    // INVARIANT: All drafts must be canonical Draft with payload.kind="numericTree" and numeric-tree values.
    // Do not assign instance.currentDrafts anywhere else.
    if (instance.evaluateResult.ok) {
      const resolvedInputs = gatherResolvedInputs({
        lens: instance.lens,
        instance,
        draftCatalog,
        getLensInstanceById,
        upstreamInstance
      });
      let drafts = [];
      try {
        drafts = materializeDrafts({
          lens: instance.lens,
          lensInstanceId: instance.lensInstanceId,
          evaluateResult: instance.evaluateResult,
          inputs: resolvedInputs,
          params: instance.paramsValues,
          lensInput: instance.lensInputValues,
          context
        });
        drafts.forEach((draft) => {
          assertDraft(draft);
          if (import.meta.env && import.meta.env.DEV) {
            assertDraftKeys(draft);
          }
        });
      } catch (error) {
        const message = error instanceof DraftInvariantError
          ? error.message
          : (error && error.message ? error.message : "Draft normalization failed.");
        instance.lastError = message;
        instance.evaluateResult = { ok: false, drafts: [], errors: [message] };
        if (typeof onUpdate === "function") onUpdate(instance);
        return;
      }
      instance.lastError = null;
      instance.currentDrafts = drafts;
      const prevIndex = Number.isFinite(instance.activeDraftIndex)
        ? instance.activeDraftIndex
        : null;
      let nextIndex = null;
      if (prevIndex !== null && prevIndex >= 0 && prevIndex < drafts.length) {
        nextIndex = prevIndex;
      } else if (drafts.length) {
        nextIndex = 0;
      }
      instance.activeDraftIndex = nextIndex;
      instance.activeDraftId = nextIndex !== null ? drafts[nextIndex].draftId : null;
      instance.activeDraft = nextIndex !== null ? drafts[nextIndex] : null;
    } else {
      instance.lastError = Array.isArray(instance.evaluateResult.errors)
        ? instance.evaluateResult.errors.join(" ")
        : null;
    }
    instance._updateToken = (instance._updateToken || 0) + 1;
    if (typeof onUpdate === "function") onUpdate(instance);
  }, debounceMs);
}

export function collectDraftCatalog(instances) {
  return instances.flatMap((instance) => instance.currentDrafts || []);
}

