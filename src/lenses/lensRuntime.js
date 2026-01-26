import { hashParams } from "../core/model.js";
import { assertDraft, assertDraftKeys, DraftInvariantError, normalizeDraft } from "../core/invariants.js";

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

function normalizeInputRef(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    return { mode: "pinned", sourceDraftId: raw };
  }
  if (raw && typeof raw === "object") {
    if (!raw.mode && raw.sourceLensInstanceId) {
      return { mode: "active", sourceLensInstanceId: raw.sourceLensInstanceId };
    }
    if (!raw.mode && raw.sourceDraftId) {
      return { mode: "pinned", sourceDraftId: raw.sourceDraftId };
    }
    if (raw.mode === "active" && raw.sourceLensInstanceId) {
      return { mode: "active", sourceLensInstanceId: raw.sourceLensInstanceId };
    }
    if (raw.mode === "pinned" && raw.sourceDraftId) {
      return { mode: "pinned", sourceDraftId: raw.sourceDraftId };
    }
    if (raw.draftId) {
      return { mode: "pinned", sourceDraftId: raw.draftId };
    }
  }
  return null;
}

function getDraftId(draft) {
  if (!draft || typeof draft !== "object") return null;
  return draft.draftId || draft.id || null;
}

function buildDraftIndex(draftCatalog) {
  const index = new Map();
  draftCatalog.forEach((draft) => {
    const id = getDraftId(draft);
    if (!id) return;
    index.set(id, draft);
  });
  return index;
}

function resolveInputs(lens, instance, draftCatalog, draftIndex, getInstanceById) {
  const inputSpecs = Array.isArray(lens.inputs) ? lens.inputs : [];
  const selected = instance.selectedInputRefsByRole || {};
  const liveRefs = instance._liveInputRefs || {};
  const inputs = [];
  const errors = [];
  inputSpecs.forEach((spec) => {
    const live = normalizeInputRef(liveRefs[spec.role]);
    const chosenRef = live || normalizeInputRef(selected[spec.role]);
    const candidates = filterDraftsBySpec(draftCatalog, spec);
    if (!chosenRef) {
      if (spec.required) {
        errors.push(`Select input draft for ${spec.role}.`);
      }
      return;
    }
    if (chosenRef.mode === "active") {
      const source = typeof getInstanceById === "function"
        ? getInstanceById(chosenRef.sourceLensInstanceId)
        : null;
      if (!source || !source.activeDraftId) {
        if (spec.required) {
          errors.push(`Active draft missing for ${spec.role}.`);
        }
        return;
      }
      const match = candidates.find((draft) => getDraftId(draft) === source.activeDraftId);
      if (!match) {
        if (spec.required) {
          errors.push(`Active draft missing for ${spec.role}.`);
        }
        return;
      }
      inputs.push({ draftId: match.draftId, role: spec.role, draft: match, ref: chosenRef });
      return;
    }
    if (chosenRef.mode === "pinned") {
      const match = draftIndex.get(chosenRef.sourceDraftId) || null;
      if (!match || !candidates.some((draft) => getDraftId(draft) === chosenRef.sourceDraftId)) {
        if (spec.required) {
          errors.push(`Selected draft missing for ${spec.role}.`);
        }
        return;
      }
      inputs.push({ draftId: match.draftId, role: spec.role, draft: match, ref: chosenRef });
      return;
    }
    if (spec.required) {
      errors.push(`Select input draft for ${spec.role}.`);
    }
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
    selectedInputRefsByRole: {},
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
  generatorInput,
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
      ...(input.ref || { mode: "pinned", sourceDraftId: input.draftId })
    }));
    const provenance = {
      lensType: lens.meta.id,
      paramsHash: hashParams({ params: params || {}, generatorInput: generatorInput || {} }),
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
    const draftIndex = buildDraftIndex(draftCatalog);
    const context = typeof getContext === "function" ? getContext() : {};
    const { inputs, errors } = resolveInputs(instance.lens, instance, draftCatalog, draftIndex, getLensInstanceById);
    if (errors.length) {
      instance.evaluateResult = { ok: false, drafts: [], errors };
      instance.lastError = errors.join(" ");
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
      instance.lastError = instance.evaluateResult.errors.join(" ");
      if (typeof onUpdate === "function") onUpdate(instance);
      return;
    }
    if (instance._token !== token) return;
    instance.evaluateResult = result || { ok: false, drafts: [] };
    // INVARIANT: All drafts must be canonical Draft with payload.kind="numericTree" and numeric-tree values.
    // Do not assign instance.currentDrafts anywhere else.
    if (instance.evaluateResult.ok) {
      let drafts = [];
      try {
        drafts = materializeDrafts({
          lens: instance.lens,
          lensInstanceId: instance.lensInstanceId,
          evaluateResult: instance.evaluateResult,
          inputs,
          params: instance.paramsValues,
          generatorInput: instance.generatorInputValues,
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
