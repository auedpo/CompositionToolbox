import { buildDraftKey } from "../core/draftIdentity.js";

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

function filterDraftsBySpec(drafts, spec) {
  const types = Array.isArray(spec.accepts) ? spec.accepts : [];
  const subtypes = Array.isArray(spec.acceptsSubtypes) ? spec.acceptsSubtypes : null;
  return drafts.filter((draft) => {
    if (!draft || !draft.type) return false;
    if (types.length && !types.includes(draft.type)) return false;
    if (subtypes && subtypes.length && !subtypes.includes(draft.subtype)) return false;
    return true;
  });
}

function resolveInputs(lens, instance, draftCatalog) {
  const inputSpecs = Array.isArray(lens.inputs) ? lens.inputs : [];
  const selected = instance.selectedInputDraftIdsByRole || {};
  const liveInputs = instance._liveInputs || {};
  const inputs = [];
  const errors = [];
  inputSpecs.forEach((spec) => {
    const live = liveInputs[spec.role];
    if (live) {
      inputs.push({ draftId: live.id, role: spec.role, draft: live });
      return;
    }
    const candidates = filterDraftsBySpec(draftCatalog, spec);
    const chosenId = selected[spec.role] || null;
    if (!chosenId) {
      if (spec.required) {
        errors.push(`Select input draft for ${spec.role}.`);
      }
      return;
    }
    const match = candidates.find((draft) => draft.id === chosenId);
    if (!match) {
      if (spec.required) {
        errors.push(`Selected draft missing for ${spec.role}.`);
      }
      return;
    }
    inputs.push({ draftId: match.id, role: spec.role, draft: match });
  });
  return { inputs, errors };
}

export function createLensInstance(lens, lensInstanceId) {
  const paramsValues = buildDefaults(lens.params);
  const generatorInputValues = buildDefaults(lens.generatorInputs);
  return {
    lens,
    lensInstanceId,
    paramsValues,
    generatorInputValues,
    _updateToken: 0,
    activeDraftIndex: null,
    activeDraft: null,
    selectedInputDraftIdsByRole: {},
    activeDraftId: null,
    evaluateResult: { ok: false, drafts: [] },
    currentDrafts: []
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
  generatorInput,
  context
}) {
  const drafts = (evaluateResult && Array.isArray(evaluateResult.drafts)) ? evaluateResult.drafts : [];
  const now = Date.now();
  return drafts.map((draft, idx) => {
    const keyPayload = {
      lensId: lens.meta.id,
      lensInstanceId,
      index: idx,
      type: draft.type,
      subtype: draft.subtype || null,
      payload: draft.payload
    };
    const id = buildDraftKey(keyPayload);
    return {
      id,
      lensId: lens.meta.id,
      lensInstanceId,
      createdAt: now,
      type: draft.type,
      subtype: draft.subtype,
      payload: draft.payload,
      summary: {
        title: draft.summary && draft.summary.title ? draft.summary.title : `${draft.type} draft`,
        description: draft.summary && draft.summary.description ? draft.summary.description : "",
        stats: draft.summary && draft.summary.stats ? draft.summary.stats : {}
      },
      provenance: {
        inputs: inputs.map((input) => ({ draftId: input.draftId, role: input.role })),
        params: { ...(params || {}) },
        generatorInput: { ...(generatorInput || {}) },
        context: context && typeof context === "object" ? { ...context } : {}
      }
    };
  });
}

export function scheduleLensEvaluation(instance, options) {
  const {
    getContext,
    getDraftCatalog,
    onUpdate,
    debounceMs = 80
  } = options;

  if (instance._timer) {
    clearTimeout(instance._timer);
  }
  const token = (instance._token || 0) + 1;
  instance._token = token;
  instance._timer = setTimeout(() => {
    const draftCatalog = typeof getDraftCatalog === "function" ? getDraftCatalog() : [];
    const context = typeof getContext === "function" ? getContext() : {};
    const { inputs, errors } = resolveInputs(instance.lens, instance, draftCatalog);
    if (errors.length) {
      instance.evaluateResult = { ok: false, drafts: [], errors };
      instance.currentDrafts = [];
      instance.activeDraftId = null;
      if (typeof onUpdate === "function") onUpdate(instance);
      return;
    }
    let result = null;
    try {
      result = instance.lens.evaluate({
        inputs,
        generatorInput: instance.generatorInputValues,
        params: instance.paramsValues,
        context
      });
    } catch (error) {
      instance.evaluateResult = {
        ok: false,
        drafts: [],
        errors: [error && error.message ? error.message : "Evaluation failed."]
      };
      instance.currentDrafts = [];
      instance.activeDraftId = null;
      if (typeof onUpdate === "function") onUpdate(instance);
      return;
    }
    if (instance._token !== token) return;
    instance.evaluateResult = result || { ok: false, drafts: [] };
    if (instance.evaluateResult.ok) {
      const drafts = materializeDrafts({
        lens: instance.lens,
        lensInstanceId: instance.lensInstanceId,
        evaluateResult: instance.evaluateResult,
        inputs,
        params: instance.paramsValues,
        generatorInput: instance.generatorInputValues,
        context
      });
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
      instance.activeDraftId = nextIndex !== null ? drafts[nextIndex].id : null;
      instance.activeDraft = nextIndex !== null ? drafts[nextIndex] : null;
    } else {
      instance.currentDrafts = [];
      instance.activeDraftId = null;
      instance.activeDraftIndex = null;
      instance.activeDraft = null;
    }
    instance._updateToken = (instance._updateToken || 0) + 1;
    if (typeof onUpdate === "function") onUpdate(instance);
  }, debounceMs);
}

export function collectDraftCatalog(instances) {
  return instances.flatMap((instance) => instance.currentDrafts || []);
}
