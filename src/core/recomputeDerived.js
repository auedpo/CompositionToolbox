// Purpose: recomputeDerived.js provides exports: recomputeDerived.
// Interacts with: imports: ./draftProvenance.js, ./invariants.js, ./lensHost.js, ./resolveInput.js.
// Role: core domain layer module within the broader app graph.
import { DraftInvariantError, makeDraft } from "./invariants.js";
import { buildInputRefs, buildParamsHash, buildStableDraftId } from "./draftProvenance.js";
import { lensHost } from "./lensHost.js";
import { resolveInput } from "./resolveInput.js";

const DEBUG_RECOMPUTE = false;
export const MISSING_PINNED_INPUT_ERROR = "Pinned input reference missing.";

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

export function recomputeDerived(authoritativeState) {
  const draftsById = {};
  const draftOrderByLensInstanceId = {};
  const activeDraftIdByLensInstanceId = {};
  const lastErrorByLensInstanceId = {};

  const authoritative = authoritativeState || {};
  const workspace = authoritative.workspace || {};
  const trackOrder = Array.isArray(workspace.trackOrder) ? workspace.trackOrder : [];
  const tracksById = workspace.tracksById || {};
  const lensInstancesById = authoritative.lenses && authoritative.lenses.lensInstancesById
    ? authoritative.lenses.lensInstancesById
    : {};

  debug(
    "[RECOMPUTE] start",
    {
      trackCount: authoritative.workspace.trackOrder.length,
      tracks: authoritative.workspace.trackOrder
    }
  );

  const derivedSoFar = {
    drafts: {
      draftsById,
      activeDraftIdByLensInstanceId
    }
  };

  trackOrder.forEach((trackId) => {
    const track = tracksById[trackId];
    if (!track || !Array.isArray(track.lensInstanceIds)) return;
    track.lensInstanceIds.forEach((lensInstanceId) => {
      const instance = lensInstancesById[lensInstanceId];
      draftOrderByLensInstanceId[lensInstanceId] = [];
      activeDraftIdByLensInstanceId[lensInstanceId] = undefined;
      lastErrorByLensInstanceId[lensInstanceId] = undefined;
      if (!instance || typeof instance !== "object") return;

      const input = instance.input || { mode: "auto", pinned: false };
      if (input.mode === "ref") {
        const pinnedDraftId = resolvePinnedDraftId(input.ref);
        if (pinnedDraftId && !Object.prototype.hasOwnProperty.call(draftsById, pinnedDraftId)) {
          lastErrorByLensInstanceId[lensInstanceId] = MISSING_PINNED_INPUT_ERROR;
          debug("[MISSING PINNED INPUT]", lensInstanceId, pinnedDraftId);
          return;
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
      const result = lensHost.apply({
        lensId,
        params,
        inputDraft,
        context: { lensInstanceId, trackId }
      });

      let error = result && result.error ? errorMessage(result.error) : null;
      const normalized = [];
      if (!error) {
        const rawDrafts = Array.isArray(result && result.drafts) ? result.drafts : [];
        rawDrafts.forEach((raw, index) => {
          try {
            const draft = normalizeLensDraft(raw, {
              lensId,
              lensInstanceId,
              paramsHash,
              inputRefs,
              index
            });
            normalized.push(draft);
          } catch (err) {
            error = errorMessage(err);
          }
        });
      }

      if (error) {
        normalized.length = 0;
      } else {
        normalized.forEach((draft) => {
          draftsById[draft.draftId] = draft;
        });
      }

      const draftIds = error ? [] : normalized.map((draft) => draft.draftId);
      draftOrderByLensInstanceId[lensInstanceId] = draftIds;
      activeDraftIdByLensInstanceId[lensInstanceId] = draftIds.length ? draftIds[0] : undefined;
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
    });
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
      activeDraftIdByLensInstanceId
    },
    errors: {
      lastErrorByLensInstanceId
    },
    meta: {
      lastDerivedAt: 0,
      lastActionType: undefined
    }
  };
}
