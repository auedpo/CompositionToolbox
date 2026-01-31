// Purpose: store.js provides exports: useStore, getAuthoritativeSnapshot, restoreAuthoritativeSnapshot.
// Interacts with: imports: ./actions.js, ./derived.js, ./reducer.js, ./schema.js.
// Role: state layer module within the broader app graph.
import { create } from "zustand";

import { createInitialState } from "./schema.js";
import { reduceAuthoritative, ACTION_TYPES } from "./reducer.js";
import { recomputeDerived } from "./derived.js";
import { createActions } from "./actions.js";

const HISTORY_LIMIT = 50;
const DEBUG_STORE = false;

const baseInitialState = createInitialState();
const initialState = {
  ...baseInitialState,
  history: {
    past: [],
    future: []
  }
};

function computeDerivedStamp(authoritative) {
  const text = JSON.stringify(authoritative);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }
  return hash >>> 0;
}

function cloneAuthoritative(authoritative) {
  if (!authoritative) return null;
  if (typeof structuredClone === "function") {
    return structuredClone(authoritative);
  }
  return JSON.parse(JSON.stringify(authoritative));
}

export function getAuthoritativeSnapshot(stateOrAuthoritative) {
  if (!stateOrAuthoritative) return null;
  const authoritative = stateOrAuthoritative.authoritative
    ? stateOrAuthoritative.authoritative
    : stateOrAuthoritative;
  return cloneAuthoritative(authoritative);
}

export function restoreAuthoritativeSnapshot(snapshot) {
  if (!snapshot) return cloneAuthoritative(baseInitialState.authoritative);
  return cloneAuthoritative(snapshot);
}

function addToPast(past, snapshot) {
  const next = [...past, snapshot];
  if (next.length > HISTORY_LIMIT) {
    next.shift();
  }
  return next;
}

function shouldRecordHistory(actionType) {
  return actionType === ACTION_TYPES.LENS_ADD_TO_CELL
    || actionType === ACTION_TYPES.LENS_MOVE_TO_CELL
    || actionType === ACTION_TYPES.LENS_REMOVE;
}

function handleUndo(state) {
  const { history, authoritative } = state;
  const { past, future } = history;
  if (!past.length) return state;
  const previousSnapshot = past[past.length - 1];
  const nextPast = past.slice(0, -1);
  const nextFuture = [cloneAuthoritative(authoritative), ...future];
  const target = cloneAuthoritative(previousSnapshot);
  const nextDerived = recomputeDerived(target);
  const derivedStamp = computeDerivedStamp(target);
  return {
    ...state,
    authoritative: target,
    derived: {
      ...nextDerived,
      meta: {
        ...nextDerived.meta,
        lastActionType: ACTION_TYPES.UNDO,
        lastDerivedAt: derivedStamp
      }
    },
    history: {
      past: nextPast,
      future: nextFuture
    }
  };
}

function handleRedo(state) {
  const { history, authoritative } = state;
  const { past, future } = history;
  if (!future.length) return state;
  const nextSnapshot = future[0];
  const nextPast = addToPast(past, cloneAuthoritative(authoritative));
  const nextFuture = future.slice(1);
  const target = cloneAuthoritative(nextSnapshot);
  const nextDerived = recomputeDerived(target);
  const derivedStamp = computeDerivedStamp(target);
  return {
    ...state,
    authoritative: target,
    derived: {
      ...nextDerived,
      meta: {
        ...nextDerived.meta,
        lastActionType: ACTION_TYPES.REDO,
        lastDerivedAt: derivedStamp
      }
    },
    history: {
      past: nextPast,
      future: nextFuture
    }
  };
}

export const useStore = create((set, get) => {
  const dispatch = (action) => {
    if (!action || !action.type) return;
    if (action.type === ACTION_TYPES.UNDO) {
      set((state) => handleUndo(state), false, `dispatch/${action.type}`);
      return;
    }
    if (action.type === ACTION_TYPES.REDO) {
      set((state) => handleRedo(state), false, `dispatch/${action.type}`);
      return;
    }
    set((state) => {
      const nextAuthoritative = reduceAuthoritative(state.authoritative, action);
      const nextDerived = recomputeDerived(nextAuthoritative);
      if (DEBUG_STORE && import.meta.env && import.meta.env.DEV) {
        console.log("[STORE DERIVED SET]", {
          drafts: Object.keys(nextDerived.drafts.draftsById).length,
          active: nextDerived.drafts.activeDraftIdByLensInstanceId
        });
      }
      const derivedStamp = computeDerivedStamp(nextAuthoritative);
      const record = shouldRecordHistory(action.type);
      const snapshot = record ? cloneAuthoritative(state.authoritative) : null;
      const past = (record && snapshot)
        ? addToPast(state.history.past, snapshot)
        : state.history.past;
      return {
        ...state,
        authoritative: nextAuthoritative,
        derived: {
          ...nextDerived,
          meta: {
            ...nextDerived.meta,
            lastActionType: action.type,
            lastDerivedAt: derivedStamp
          }
        },
        history: {
          past,
          future: []
        }
      };
    }, false, `dispatch/${action.type}`);
  };

  return {
    ...initialState,
    dispatch,
    actions: createActions(dispatch, get)
  };
});
