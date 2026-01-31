// Purpose: store.js provides exports: useStore.
// Interacts with: imports: ./actions.js, ./derived.js, ./persistence.js, ./reducer.js, ./schema.js... (+2 more).
// Role: state layer module within the broader app graph.
import { create } from "zustand";

import { createInitialState } from "./schema.js";
import { reduceAuthoritative, ACTION_TYPES } from "./reducer.js";
import { recomputeDerived } from "./derived.js";
import { createActions } from "./actions.js";

const initialState = createInitialState();
const DEBUG_STORE = false;

function computeDerivedStamp(authoritative) {
  const text = JSON.stringify(authoritative);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }
  return hash >>> 0;
}

export const useStore = create((set, get) => {
  const dispatch = (action) => {
    set((state) => {
      const nextAuthoritative = reduceAuthoritative(state.authoritative, action);
      const nextDerived = recomputeDerived(nextAuthoritative);
      if (DEBUG_STORE && import.meta.env && import.meta.env.DEV) {
        console.log(
          "[STORE DERIVED SET]",
          {
            drafts: Object.keys(nextDerived.drafts.draftsById).length,
            active: nextDerived.drafts.activeDraftIdByLensInstanceId
          }
        );
      }
      const derivedStamp = computeDerivedStamp(nextAuthoritative);
      return {
        ...state,
        authoritative: nextAuthoritative,
        derived: {
          ...nextDerived,
          meta: {
            ...nextDerived.meta,
            lastActionType: action && action.type ? action.type : undefined,
            lastDerivedAt: derivedStamp
          }
        }
      };
    }, false, action && action.type ? `dispatch/${action.type}` : "dispatch");
  };

  return {
    ...initialState,
    dispatch,
    actions: createActions(dispatch, get)
  };
});
