import { ACTION_TYPES } from "./reducer.js";
import { createEmptyDerived } from "./schema.js";

function ensureKeyedMap(source, lensInstanceIds, createValue) {
  const next = { ...(source || {}) };
  lensInstanceIds.forEach((lensInstanceId) => {
    if (!(lensInstanceId in next)) {
      next[lensInstanceId] = createValue();
    }
  });
  Object.keys(next).forEach((lensInstanceId) => {
    if (!lensInstanceIds.includes(lensInstanceId)) {
      delete next[lensInstanceId];
    }
  });
  return next;
}

export function recomputeStub(state, action) {
  const current = state && state.derived ? state.derived : createEmptyDerived();
  const lensInstancesById = state && state.authoritative && state.authoritative.lenses
    ? state.authoritative.lenses.lensInstancesById
    : {};
  const lensInstanceIds = Object.keys(lensInstancesById || {});

  const draftOrderByLensInstanceId = ensureKeyedMap(
    current.drafts && current.drafts.draftOrderByLensInstanceId,
    lensInstanceIds,
    () => []
  );
  const activeDraftIdByLensInstanceId = ensureKeyedMap(
    current.drafts && current.drafts.activeDraftIdByLensInstanceId,
    lensInstanceIds,
    () => undefined
  );
  const lastErrorByLensInstanceId = ensureKeyedMap(
    current.errors && current.errors.lastErrorByLensInstanceId,
    lensInstanceIds,
    () => undefined
  );

  if (action && (action.type === ACTION_TYPES.LENS_SET_PARAM || action.type === ACTION_TYPES.LENS_SET_INPUT)) {
    const lensInstanceId = action.payload && action.payload.lensInstanceId;
    if (lensInstanceId && lensInstanceId in lastErrorByLensInstanceId) {
      lastErrorByLensInstanceId[lensInstanceId] = undefined;
    }
  }

  return {
    drafts: {
      draftsById: current.drafts ? current.drafts.draftsById : {},
      draftOrderByLensInstanceId,
      activeDraftIdByLensInstanceId
    },
    errors: {
      lastErrorByLensInstanceId
    },
    meta: {
      ...current.meta
    }
  };
}
