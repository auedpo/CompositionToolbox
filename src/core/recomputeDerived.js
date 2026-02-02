// Purpose: recomputeDerived.js provides exports: recomputeDerived.
// Interacts with: imports: ./draftProvenance.js, ./invariants.js, ./lensHost.js, ./resolveInput.js.
// Role: core domain layer module within the broader app graph.
import { DraftInvariantError, makeDraft } from "./invariants.js";
import { buildInputRefs, buildParamsHash, buildStableDraftId } from "./draftProvenance.js";
import { lensHost } from "./lensHost.js";
import { resolveInput } from "./resolveInput.js";
import { makeCellKey } from "../state/schema.js";

const DEBUG_RECOMPUTE = false;
export const MISSING_PINNED_INPUT_ERROR = "Pinned input reference missing.";

function normalizeVizModel(raw, { lensId, lensInstanceId }) {
  if (!raw) return null;
  if (raw.kind && raw.meta && raw.payload) {
    return {
      kind: String(raw.kind),
      version: Number.isFinite(raw.version) ? raw.version : 1,
      meta: {
        lensId,
        lensInstanceId,
        ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {})
      },
      payload: raw.payload
    };
  }
  if (raw.pattern) {
    const pattern = raw.pattern;
    const domain = pattern.domain && typeof pattern.domain === "object" ? pattern.domain : {};
    const stepsValue = domain.steps ?? domain.n ?? domain.N;
    const normalizedSteps = Number.isFinite(stepsValue) ? stepsValue : undefined;
    const pulsesValue = Number.isFinite(domain.pulses) ? domain.pulses : domain.pulses;
    const rotationValue = Number.isFinite(domain.rotation) ? domain.rotation : (domain.rotation ?? 0);
    const activeKind = typeof pattern.kind === "string" ? pattern.kind : "binaryMask";
    return {
      kind: "euclidean",
      version: 1,
      meta: {
        lensId,
        lensInstanceId,
        domain: {
          steps: normalizedSteps,
          pulses: pulsesValue,
          rotation: rotationValue
        }
      },
      payload: {
        steps: normalizedSteps,
        active: {
          kind: activeKind,
          values: pattern.values
        }
      }
    };
  }
  return {
    kind: "unknown",
    version: 1,
    meta: { lensId, lensInstanceId },
    payload: raw
  };
}

function debug(...args) {
  if (!DEBUG_RECOMPUTE || !import.meta.env || !import.meta.env.DEV) return;
  console.log(...args);
}

function resolvePinnedDraftId(ref) {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref !== "object") return null;
  return ref.draftId || ref.sourceDraftId || null;
}

function normalizeLensDraft(raw, {
  lensId,
  lensInstanceId,
  paramsHash,
  inputRefs,
  index
}) {
  let values = undefined;
  let type = lensId || "draft";
  let subtype = undefined;
  let summary = undefined;
  let rawMeta = null;

  if (Array.isArray(raw) || typeof raw === "number") {
    values = raw;
  } else if (raw && typeof raw === "object") {
    const payload = raw.payload;
    if (!payload || typeof payload !== "object" || payload.kind !== "numericTree") {
      throw new DraftInvariantError("Lens output payload must be numericTree.");
    }
    values = payload.values;
    if (typeof raw.type === "string" && raw.type) type = raw.type;
    if (typeof raw.subtype === "string" && raw.subtype) subtype = raw.subtype;
    if (typeof raw.summary === "string") summary = raw.summary;
    if (raw.meta && typeof raw.meta === "object") rawMeta = raw.meta;
  } else {
    throw new DraftInvariantError("Lens output must be a draft or numeric tree.");
  }

  const provenance = {
    lensType: lensId,
    paramsHash,
    inputRefs,
    createdAt: 0
  };
  const nextMeta = rawMeta ? { ...rawMeta } : {};
  const prevProv = nextMeta.provenance && typeof nextMeta.provenance === "object"
    ? nextMeta.provenance
    : {};
  nextMeta.provenance = { ...prevProv, ...provenance };

  const stableDraftId = buildStableDraftId({
    lensId,
    lensInstanceId,
    type,
    subtype,
    index,
    paramsHash,
    inputRefs
  });

  return makeDraft({
    draftId: stableDraftId,
    lensId,
    lensInstanceId,
    type,
    subtype,
    summary,
    values,
    meta: nextMeta
  });
}

function errorMessage(error) {
  if (!error) return "Lens evaluation failed.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Lens evaluation failed.";
  return "Lens evaluation failed.";
}

function isPackedCarrierDraft(draft) {
  if (!draft || typeof draft !== "object") return false;
  const meta = draft.meta;
  if (!meta || typeof meta !== "object") return false;
  const carrier = meta.carrier;
  if (carrier && typeof carrier === "object" && carrier.kind === "packDrafts") {
    return true;
  }
  const provenance = meta.provenance;
  if (provenance && typeof provenance === "object" && provenance.packaging === "packDrafts") {
    return true;
  }
  return false;
}

function buildFrameInputDraft({ values, frameIndex, sourceDraftId, fallbackLensInstanceId }) {
  return makeDraft({
    lensId: "batchFrame",
    lensInstanceId: fallbackLensInstanceId,
    type: "batchFrame",
    values,
    meta: {
      provenance: {
        sourceDraftId,
        frameIndex
      }
    }
  });
}

function applyLensWithBatching({ lensId, params, inputDraft, context } = {}) {
  if (!inputDraft || !isPackedCarrierDraft(inputDraft)) {
    const result = lensHost.apply({ lensId, params, inputDraft, context });
    return { ...result, isBatched: false };
  }

  const payload = inputDraft.payload && typeof inputDraft.payload === "object"
    ? inputDraft.payload
    : null;
  if (!payload) {
    return { drafts: [], isBatched: true };
  }

  const frames = Array.isArray(payload.values) ? payload.values : null;
  if (!frames) {
    return { drafts: [], isBatched: true };
  }

  const sourceDraftId = typeof inputDraft.draftId === "string" ? inputDraft.draftId : null;
  const fallbackLensInstanceId = inputDraft.lensInstanceId
    || (context && context.lensInstanceId)
    || `${lensId || "lens"}-batchFrame`;

  const aggregated = [];
  const warnings = [];
  let vizModel;
  let aggregatedError = null;

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    let frameDraft;
    try {
      frameDraft = buildFrameInputDraft({
        values: frames[frameIndex],
        frameIndex,
        sourceDraftId,
        fallbackLensInstanceId
      });
    } catch (draftError) {
      if (!aggregatedError) aggregatedError = errorMessage(draftError);
      continue;
    }

    const frameResult = lensHost.apply({
      lensId,
      params,
      inputDraft: frameDraft,
      context
    });

    if (vizModel === undefined && frameResult && Object.prototype.hasOwnProperty.call(frameResult, "vizModel")) {
      vizModel = frameResult.vizModel;
    }

    if (frameResult && Array.isArray(frameResult.warnings) && frameResult.warnings.length) {
      warnings.push(...frameResult.warnings);
    }

    if (frameResult && frameResult.error) {
      if (!aggregatedError) aggregatedError = frameResult.error;
      continue;
    }

    if (frameResult && Array.isArray(frameResult.drafts) && frameResult.drafts.length) {
      aggregated.push(...frameResult.drafts);
    }
  }

  return {
    drafts: aggregated,
    vizModel,
    warnings: warnings.length ? warnings : undefined,
    error: aggregatedError,
    isBatched: true
  };
}

export function recomputeDerived(authoritativeState) {
  const draftsById = {};
  const draftOrderByLensInstanceId = {};
  const activeDraftIdByLensInstanceId = {};
  const selectedDraftIdsByLensInstanceId = {};
  const lastErrorByLensInstanceId = {};
  const vizByLensInstanceId = {};

  const authoritative = authoritativeState || {};
  const workspace = authoritative.workspace || {};
  const laneOrder = Array.isArray(workspace.laneOrder) ? workspace.laneOrder : [];
  const grid = workspace.grid || {};
  const rows = Number.isFinite(grid.rows) ? grid.rows : 0;
  const cells = grid.cells || {};
  const lensInstancesById = authoritative.lenses && authoritative.lenses.lensInstancesById
    ? authoritative.lenses.lensInstancesById
    : {};

  debug(
    "[RECOMPUTE] start",
    {
      laneCount: laneOrder.length,
      rows,
      lanes: laneOrder
    }
  );

  const derivedSoFar = {
    drafts: {
      draftsById,
      activeDraftIdByLensInstanceId,
      selectedDraftIdsByLensInstanceId
    },
    viz: {
      vizByLensInstanceId
    }
  };

  laneOrder.forEach((laneId) => {
    for (let row = 0; row < rows; row += 1) {
      const cellKey = makeCellKey(laneId, row);
      const lensInstanceId = cells[cellKey];
      if (!lensInstanceId) continue;
      vizByLensInstanceId[lensInstanceId] = null;
      draftOrderByLensInstanceId[lensInstanceId] = [];
      activeDraftIdByLensInstanceId[lensInstanceId] = undefined;
      selectedDraftIdsByLensInstanceId[lensInstanceId] = [];
      lastErrorByLensInstanceId[lensInstanceId] = undefined;
      const instance = lensInstancesById[lensInstanceId];
      if (!instance || typeof instance !== "object") continue;

      const input = instance.input || { mode: "auto", pinned: false };
      if (input.mode === "ref") {
        const pinnedDraftId = resolvePinnedDraftId(input.ref);
        if (pinnedDraftId && !Object.prototype.hasOwnProperty.call(draftsById, pinnedDraftId)) {
          lastErrorByLensInstanceId[lensInstanceId] = MISSING_PINNED_INPUT_ERROR;
          debug("[MISSING PINNED INPUT]", lensInstanceId, pinnedDraftId);
          continue;
        }
      }

      const inputDraft = resolveInput(lensInstanceId, authoritative, derivedSoFar);
      const lensId = instance.lensId;
      const params = instance.params && typeof instance.params === "object" ? instance.params : {};
      const lensInput = instance.lensInput && typeof instance.lensInput === "object"
        ? instance.lensInput
        : {};
      const paramsHash = buildParamsHash({ params, lensInput });
      const inputRefs = buildInputRefs({ lensInstanceId, authoritative, derivedSoFar });
      const result = applyLensWithBatching({
        lensId,
        params,
        inputDraft,
        context: { lensInstanceId, laneId, row }
      });
      const isBatched = Boolean(result && result.isBatched);

      vizByLensInstanceId[lensInstanceId] = normalizeVizModel(result && result.vizModel, {
        lensId,
        lensInstanceId
      });

      let error = result && result.error ? errorMessage(result.error) : null;
      const normalized = [];
      const rawDrafts = Array.isArray(result && result.drafts) ? result.drafts : [];
      if (!error || isBatched) {
        for (let rawIndex = 0; rawIndex < rawDrafts.length; rawIndex += 1) {
          const raw = rawDrafts[rawIndex];
          try {
            const draft = normalizeLensDraft(raw, {
              lensId,
              lensInstanceId,
              paramsHash,
              inputRefs,
              index: rawIndex
            });
            normalized.push(draft);
          } catch (err) {
            error = errorMessage(err);
            normalized.length = 0;
            break;
          }
        }
      }

      if (!(error && !isBatched)) {
        normalized.forEach((draft) => {
          draftsById[draft.draftId] = draft;
        });
      }

      const draftIds = (error && !isBatched) ? [] : normalized.map((draft) => draft.draftId);
      draftOrderByLensInstanceId[lensInstanceId] = draftIds;
      const outputSelection = instance.outputSelection && typeof instance.outputSelection === "object"
        ? instance.outputSelection
        : { mode: "active", selectedIndices: [] };
      const indices = Array.isArray(outputSelection.selectedIndices)
        ? outputSelection.selectedIndices
        : [];
      const selectedIds = [];
      indices.forEach((idx) => {
        if (!Number.isInteger(idx) || idx < 0) return;
        const draftId = draftIds[idx];
        if (draftId) selectedIds.push(draftId);
      });
      selectedDraftIdsByLensInstanceId[lensInstanceId] = error ? [] : selectedIds;
      const selectionMap = authoritative.selection && authoritative.selection.activeDraftIdByLensInstanceId
        ? authoritative.selection.activeDraftIdByLensInstanceId
        : {};
      const preferredIdle = selectionMap[lensInstanceId];
      const nextActiveId = preferredIdle && draftIds.includes(preferredIdle)
        ? preferredIdle
        : (draftIds.length ? draftIds[0] : undefined);
      activeDraftIdByLensInstanceId[lensInstanceId] = nextActiveId;
      if (error) {
        lastErrorByLensInstanceId[lensInstanceId] = error;
        activeDraftIdByLensInstanceId[lensInstanceId] = undefined;
      }

      debug(
        "[DRAFT REGISTER]",
        lensInstanceId,
        {
          draftIds: draftOrderByLensInstanceId[lensInstanceId] ?? [],
          error: lastErrorByLensInstanceId[lensInstanceId] ?? null
        }
      );
    }
  });

  debug(
    "[RECOMPUTE] done",
    {
      lensCount: Object.keys(draftOrderByLensInstanceId).length,
      totalDrafts: Object.keys(draftsById).length
    }
  );

  return {
    drafts: {
      draftsById,
      draftOrderByLensInstanceId,
      activeDraftIdByLensInstanceId,
      selectedDraftIdsByLensInstanceId
    },
    errors: {
      lastErrorByLensInstanceId
    },
    viz: {
      vizByLensInstanceId
    },
    meta: {
      lastDerivedAt: 0,
      lastActionType: undefined
    }
  };
}
