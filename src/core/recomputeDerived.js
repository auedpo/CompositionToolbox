// Purpose: recomputeDerived.js provides exports: recomputeDerived.
// Interacts with: imports: ./draftProvenance.js, ./invariants.js, ./lensHost.js, ./resolveInput.js.
// Role: core domain layer module within the broader app graph.
import { DraftInvariantError, makeDraft } from "./invariants.js";
import { DEFAULT_BATCH_CAPS } from "./batchingCaps.js";
import { buildInputRefs, buildParamsHash, buildStableDraftId } from "./draftProvenance.js";
import { lensHost } from "./lensHost.js";
import { resolveInput } from "./resolveInput.js";
import { makeCellKey } from "../state/schema.js";

const DEBUG_RECOMPUTE = false;
let batchSequenceCounter = 0;

function createBatchId() {
  batchSequenceCounter += 1;
  return `batch-${batchSequenceCounter}`;
}

let resolveInputOverride = null;
export function setResolveInputOverride(fn) {
  resolveInputOverride = typeof fn === "function" ? fn : null;
}
export function resetResolveInputOverride() {
  resolveInputOverride = null;
}

function extractPackedCarrierSourceDraftIds(draft) {
  if (!draft || typeof draft !== "object") return null;
  const meta = draft.meta;
  if (!meta || typeof meta !== "object") return null;
  const provenance = meta.provenance;
  if (!provenance || typeof provenance !== "object") return null;
  const sourceDraftIds = provenance.sourceDraftIds;
  return Array.isArray(sourceDraftIds) ? sourceDraftIds : null;
}

function attachBatchMetaToDraft(rawDraft, batchMeta) {
  if (!batchMeta || typeof batchMeta !== "object") {
    return rawDraft;
  }

  if (Array.isArray(rawDraft)) {
    const nextMeta = rawDraft.meta && typeof rawDraft.meta === "object"
      ? { ...rawDraft.meta }
      : {};
    nextMeta.batch = batchMeta;
    const nextDraft = rawDraft.slice ? rawDraft.slice() : [];
    nextDraft.meta = nextMeta;
    return nextDraft;
  }

  if (rawDraft && typeof rawDraft === "object") {
    const nextMeta = rawDraft.meta && typeof rawDraft.meta === "object"
      ? { ...rawDraft.meta }
      : {};
    nextMeta.batch = batchMeta;
    return { ...rawDraft, meta: nextMeta };
  }

  return {
    payload: {
      kind: "numericTree",
      values: rawDraft
    },
    meta: {
      batch: batchMeta
    }
  };
}
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
  if (raw && typeof raw === "object" && raw.meta && typeof raw.meta === "object") {
    rawMeta = raw.meta;
  }

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

function applyLensWithBatching({ lensId, params, inputDraft, context, caps = DEFAULT_BATCH_CAPS } = {}) {
  if (!inputDraft || !isPackedCarrierDraft(inputDraft)) {
    const result = lensHost.apply({ lensId, params, inputDraft, context });
    return { ...result, isBatched: false };
  }

  const runtimeWarnings = [];
  const addRuntimeWarning = (warning) => {
    if (warning && typeof warning === "object") {
      runtimeWarnings.push(warning);
    }
  };
  const addFrameWarnings = (warnings) => {
    if (!Array.isArray(warnings) || !warnings.length) return;
    warnings.forEach((warning) => addRuntimeWarning(warning));
  };

  const payload = inputDraft.payload && typeof inputDraft.payload === "object"
    ? inputDraft.payload
    : null;
  const batchId = createBatchId();
  if (!payload) {
    addRuntimeWarning({
      kind: "malformedCarrier",
      message: "Packed carrier payload is missing.",
      batchId,
      details: { reason: "missingPayload" }
    });
    return {
      drafts: [],
      isBatched: true,
      warnings: runtimeWarnings.length ? runtimeWarnings : undefined
    };
  }

  const frames = Array.isArray(payload.values) ? payload.values : null;
  if (!frames) {
    addRuntimeWarning({
      kind: "malformedCarrier",
      message: "Packed carrier payload.values must be an array.",
      batchId,
      details: {
        valuesType: payload.values === undefined ? "undefined" : typeof payload.values
      }
    });
    return {
      drafts: [],
      isBatched: true,
      warnings: runtimeWarnings.length ? runtimeWarnings : undefined
    };
  }

  const frameLimit = Number.isFinite(caps.maxFramesEvaluated) && caps.maxFramesEvaluated >= 0
    ? caps.maxFramesEvaluated
    : Infinity;
  const framesToEvaluate = frameLimit < frames.length
    ? frames.slice(0, Math.max(0, frameLimit))
    : frames;
  if (frames.length > framesToEvaluate.length) {
    addRuntimeWarning({
      kind: "truncatedFrames",
      message: `Batch truncated to ${framesToEvaluate.length} frames (cap ${caps.maxFramesEvaluated}).`,
      batchId,
      details: {
        requestedFrames: frames.length,
        evaluatedFrames: framesToEvaluate.length,
        cap: caps.maxFramesEvaluated
      }
    });
  }

  const maxBatchDraftCap = Number.isFinite(caps.maxTotalDraftsPerBatch) && caps.maxTotalDraftsPerBatch >= 0
    ? caps.maxTotalDraftsPerBatch
    : Infinity;
  const maxFrameDraftCap = Number.isFinite(caps.maxDraftsEmittedPerFrame) && caps.maxDraftsEmittedPerFrame >= 0
    ? caps.maxDraftsEmittedPerFrame
    : Infinity;

  const frameSourceDraftIds = extractPackedCarrierSourceDraftIds(inputDraft);
  const sourceDraftId = typeof inputDraft.draftId === "string" ? inputDraft.draftId : null;
  const fallbackLensInstanceId = inputDraft.lensInstanceId
    || (context && context.lensInstanceId)
    || `${lensId || "lens"}-batchFrame`;

  const aggregated = [];
  let vizModel;
  let aggregatedError = null;
  let batchDraftCount = 0;

  for (let frameIndex = 0; frameIndex < framesToEvaluate.length; frameIndex += 1) {
    const remainingForBatch = maxBatchDraftCap - batchDraftCount;
    if (remainingForBatch <= 0) {
      addRuntimeWarning({
        kind: "truncatedBatchOutputs",
        message: `Batch stopped after ${batchDraftCount} drafts (cap ${maxBatchDraftCap}).`,
        batchId,
        details: {
          cap: maxBatchDraftCap,
          emitted: batchDraftCount,
          frameIndex,
          framesRemaining: framesToEvaluate.length - frameIndex
        }
      });
      break;
    }

    const frameSourceDraftId = frameSourceDraftIds && frameSourceDraftIds[frameIndex]
      ? frameSourceDraftIds[frameIndex]
      : null;

    let frameDraft;
    try {
      frameDraft = buildFrameInputDraft({
        values: framesToEvaluate[frameIndex],
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
      addFrameWarnings(frameResult.warnings);
    }

    if (frameResult && frameResult.error) {
      if (!aggregatedError) aggregatedError = frameResult.error;
      continue;
    }

    let frameDrafts = Array.isArray(frameResult && frameResult.drafts) ? frameResult.drafts : [];
    if (maxFrameDraftCap < frameDrafts.length) {
      const requested = frameDrafts.length;
      frameDrafts = frameDrafts.slice(0, maxFrameDraftCap);
      addRuntimeWarning({
        kind: "truncatedFrameOutputs",
        message: `Frame ${frameIndex} limited to ${frameDrafts.length} variants (cap ${maxFrameDraftCap}).`,
        batchId,
        details: {
          frameIndex,
          cap: maxFrameDraftCap,
          requested,
          emitted: frameDrafts.length
        }
      });
    }

    const batchRoom = Number.isFinite(remainingForBatch) ? remainingForBatch : Infinity;
    if (frameDrafts.length > batchRoom) {
      const requested = frameDrafts.length;
      frameDrafts = batchRoom > 0 ? frameDrafts.slice(0, batchRoom) : [];
      addRuntimeWarning({
        kind: "truncatedBatchOutputs",
        message: `Batch cap ${maxBatchDraftCap} limited frame ${frameIndex} outputs to ${frameDrafts.length}.`,
        batchId,
        details: {
          frameIndex,
          cap: maxBatchDraftCap,
          requested,
          emitted: frameDrafts.length
        }
      });
    }

    if (frameDrafts.length) {
      const decorated = frameDrafts.map((draft, variantIndex) => attachBatchMetaToDraft(draft, {
        kind: "mapFrames",
        batchId,
        frameIndex,
        frameSourceDraftId,
        variantIndex
      }));
      aggregated.push(...decorated);
      batchDraftCount += decorated.length;
    }
  }

  return {
    drafts: aggregated,
    vizModel,
    warnings: runtimeWarnings.length ? runtimeWarnings : undefined,
    error: aggregatedError,
    isBatched: true
  };
}

export function recomputeDerived(authoritativeState) {
  batchSequenceCounter = 0;
  const draftsById = {};
  const draftOrderByLensInstanceId = {};
  const activeDraftIdByLensInstanceId = {};
  const selectedDraftIdsByLensInstanceId = {};
  const lastErrorByLensInstanceId = {};
  const vizByLensInstanceId = {};
  const runtimeWarningsByLensInstanceId = {};
  const globalDraftCap = Number.isFinite(DEFAULT_BATCH_CAPS.maxTotalDraftsPerRecompute)
    && DEFAULT_BATCH_CAPS.maxTotalDraftsPerRecompute >= 0
    ? DEFAULT_BATCH_CAPS.maxTotalDraftsPerRecompute
    : Infinity;
  let totalDraftsAddedThisRecompute = 0;
  const deterministicLensInstanceIds = [];
  const deterministicLensInstanceIdSet = new Set();

  function pushRuntimeWarning(lensInstanceId, warning) {
    if (!lensInstanceId || !warning || typeof warning !== "object") return;
    if (!runtimeWarningsByLensInstanceId[lensInstanceId]) {
      runtimeWarningsByLensInstanceId[lensInstanceId] = [];
    }
    runtimeWarningsByLensInstanceId[lensInstanceId].push(warning);
  }

  function applyGlobalDraftCap(lensInstanceId, drafts) {
    if (!Array.isArray(drafts) || !drafts.length) return drafts;
    if (!Number.isFinite(globalDraftCap)) {
      totalDraftsAddedThisRecompute += drafts.length;
      return drafts;
    }
    const remainingGlobal = globalDraftCap - totalDraftsAddedThisRecompute;
    if (remainingGlobal <= 0) {
      pushRuntimeWarning(lensInstanceId, {
        kind: "truncatedRecomputeOutputs",
        message: `Recompute cap ${globalDraftCap} already reached; additional drafts dropped.`,
        details: {
          cap: globalDraftCap,
          requested: drafts.length,
          emitted: 0
        }
      });
      return [];
    }
    if (drafts.length > remainingGlobal) {
      const truncated = drafts.slice(0, remainingGlobal);
      pushRuntimeWarning(lensInstanceId, {
        kind: "truncatedRecomputeOutputs",
        message: `Recompute cap ${globalDraftCap} limits lens output to ${remainingGlobal} drafts.`,
        details: {
          cap: globalDraftCap,
          requested: drafts.length,
          emitted: remainingGlobal
        }
      });
      totalDraftsAddedThisRecompute = globalDraftCap;
      return truncated;
    }
    totalDraftsAddedThisRecompute += drafts.length;
    return drafts;
  }

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
      if (!deterministicLensInstanceIdSet.has(lensInstanceId)) {
        deterministicLensInstanceIdSet.add(lensInstanceId);
        deterministicLensInstanceIds.push(lensInstanceId);
      }
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

      const resolver = resolveInputOverride || resolveInput;
      const inputDraft = resolver(lensInstanceId, authoritative, derivedSoFar);
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

      if (result && Array.isArray(result.warnings) && result.warnings.length) {
        result.warnings.forEach((warning) => pushRuntimeWarning(lensInstanceId, warning));
      }

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

      let registeredDrafts = [];
      if (!(error && !isBatched)) {
        registeredDrafts = applyGlobalDraftCap(lensInstanceId, normalized);
        registeredDrafts.forEach((draft) => {
          draftsById[draft.draftId] = draft;
        });
      }

      const draftIds = (error && !isBatched) ? [] : registeredDrafts.map((draft) => draft.draftId);
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

  const lensIterationOrder = deterministicLensInstanceIds.length
    ? deterministicLensInstanceIds
    : Object.keys(draftOrderByLensInstanceId).sort();
  const draftIdsByBatchId = {};
  const draftIdsByBatchFrame = {};
  const batchSummaryByBatchId = {};
  const batchAcc = {};
  const truncatedWarningKinds = new Set([
    "truncatedFrames",
    "truncatedBatchOutputs",
    "truncatedFrameOutputs"
  ]);

  for (let idx = 0; idx < lensIterationOrder.length; idx += 1) {
    const lensInstanceId = lensIterationOrder[idx];
    const orderedIds = Array.isArray(draftOrderByLensInstanceId[lensInstanceId])
      ? draftOrderByLensInstanceId[lensInstanceId]
      : [];
    for (let draftIdx = 0; draftIdx < orderedIds.length; draftIdx += 1) {
      const draftId = orderedIds[draftIdx];
      const draft = draftsById[draftId];
      if (!draft) continue;
      const batch = draft.meta && typeof draft.meta === "object" ? draft.meta.batch : null;
      if (!batch || batch.kind !== "mapFrames" || !batch.batchId) continue;
      const batchId = batch.batchId;
      const frameIndex = Number.isInteger(batch.frameIndex) ? batch.frameIndex : 0;

      if (!draftIdsByBatchId[batchId]) {
        draftIdsByBatchId[batchId] = [];
      }
      draftIdsByBatchId[batchId].push(draftId);

      if (!draftIdsByBatchFrame[batchId]) {
        draftIdsByBatchFrame[batchId] = {};
      }
      if (!draftIdsByBatchFrame[batchId][frameIndex]) {
        draftIdsByBatchFrame[batchId][frameIndex] = [];
      }
      draftIdsByBatchFrame[batchId][frameIndex].push(draftId);

      let acc = batchAcc[batchId];
      if (!acc) {
        acc = {
          lensInstanceId,
          lensId: draft.lensId || null,
          outputsPerFrame: {},
          maxFrameIndex: -1,
          outputs: 0
        };
        batchAcc[batchId] = acc;
      }

      acc.outputs += 1;
      acc.outputsPerFrame[frameIndex] = (acc.outputsPerFrame[frameIndex] || 0) + 1;
      if (frameIndex > acc.maxFrameIndex) {
        acc.maxFrameIndex = frameIndex;
      }
    }
  }

  const lensWarningsLookup = {};
  Object.keys(runtimeWarningsByLensInstanceId).forEach((lensInstanceId) => {
    const warnings = runtimeWarningsByLensInstanceId[lensInstanceId];
    if (Array.isArray(warnings) && warnings.length) {
      lensWarningsLookup[lensInstanceId] = warnings;
    }
  });

  Object.keys(batchAcc).forEach((batchId) => {
    const acc = batchAcc[batchId];
    const frames = acc.maxFrameIndex >= 0 ? acc.maxFrameIndex + 1 : 0;
    const outputsPerFrame = [];
    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      outputsPerFrame[frameIndex] = acc.outputsPerFrame[frameIndex] || 0;
    }
    const summary = {
      frames,
      outputs: acc.outputs,
      outputsPerFrame,
      lensInstanceId: acc.lensInstanceId,
      lensId: acc.lensId
    };
    const warnings = lensWarningsLookup[acc.lensInstanceId] || [];
    const batchWarnings = warnings.filter((warning) => warning && warning.batchId === batchId);
    if (batchWarnings.length) {
      summary.warnings = batchWarnings;
      const truncated = batchWarnings.some((warning) => warning && truncatedWarningKinds.has(warning.kind));
      if (truncated) summary.truncated = true;
    }
    batchSummaryByBatchId[batchId] = summary;
  });

  return {
    drafts: {
      draftsById,
      draftOrderByLensInstanceId,
      activeDraftIdByLensInstanceId,
      selectedDraftIdsByLensInstanceId,
      batchIndex: {
        draftIdsByBatchId,
        draftIdsByBatchFrame,
        batchSummaryByBatchId
      }
    },
    errors: {
      lastErrorByLensInstanceId
    },
    viz: {
      vizByLensInstanceId
    },
    runtimeWarningsByLensInstanceId,
    meta: {
      lastDerivedAt: 0,
      lastActionType: undefined
    }
  };
}
