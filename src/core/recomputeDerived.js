import { DraftInvariantError, isNumericTree, makeDraft } from "./invariants.js";
import { lensHost } from "./lensHost.js";
import { resolveInput } from "./resolveInput.js";

function normalizeLensDraft(raw, { lensId, lensInstanceId }) {
  if (isNumericTree(raw)) {
    return makeDraft({
      lensId,
      lensInstanceId,
      type: lensId || "draft",
      values: raw
    });
  }
  if (!raw || typeof raw !== "object") {
    throw new DraftInvariantError("Lens output must be a draft or numeric tree.");
  }
  const payload = raw.payload;
  if (!payload || typeof payload !== "object" || payload.kind !== "numericTree") {
    throw new DraftInvariantError("Lens output payload must be numericTree.");
  }
  const type = typeof raw.type === "string" && raw.type ? raw.type : lensId || "draft";
  return makeDraft({
    draftId: raw.draftId,
    lensId,
    lensInstanceId,
    type,
    subtype: raw.subtype,
    summary: raw.summary,
    values: payload.values,
    meta: raw.meta
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

  console.log(
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

      const inputDraft = resolveInput(lensInstanceId, authoritative, derivedSoFar);
      const lensId = instance.lensId;
      const params = instance.params && typeof instance.params === "object" ? instance.params : {};
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
        rawDrafts.forEach((raw) => {
          try {
            const draft = normalizeLensDraft(raw, { lensId, lensInstanceId });
            draftsById[draft.draftId] = draft;
            normalized.push(draft);
          } catch (err) {
            if (!error) {
              error = errorMessage(err);
            }
          }
        });
      }

      const draftIds = normalized.map((draft) => draft.draftId);
      draftOrderByLensInstanceId[lensInstanceId] = draftIds;
      activeDraftIdByLensInstanceId[lensInstanceId] = draftIds.length ? draftIds[0] : undefined;
      if (error) {
        lastErrorByLensInstanceId[lensInstanceId] = error;
        if (!draftIds.length) {
          activeDraftIdByLensInstanceId[lensInstanceId] = undefined;
        }
      }

      console.log(
        "[DRAFT REGISTER]",
        lensInstanceId,
        {
          draftIds: draftOrderByLensInstanceId[lensInstanceId] ?? [],
          error: lastErrorByLensInstanceId[lensInstanceId] ?? null
        }
      );
    });
  });

  console.log(
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
