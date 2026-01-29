import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createInitialState } from "./schema.js";
import { reduceAuthoritative, ACTION_TYPES } from "./reducer.js";
import { recomputeDerived } from "./derived.js";
import { createActions } from "./actions.js";
import { persistConfig } from "./persistence.js";

const initialState = createInitialState();

function computeDerivedStamp(authoritative) {
  const text = JSON.stringify(authoritative);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }
  return hash >>> 0;
}

export const useStore = create(
  persist((set, get) => {
    const dispatch = (action) => {
      set((state) => {
        const nextAuthoritative = reduceAuthoritative(state.authoritative, action);
        const nextDerived = recomputeDerived(nextAuthoritative);
        console.log(
          "[STORE DERIVED SET]",
          {
            drafts: Object.keys(nextDerived.drafts.draftsById).length,
            active: nextDerived.drafts.activeDraftIdByLensInstanceId
          }
        );
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
  }, {
    ...persistConfig,
    onRehydrateStorage: () => (state, error) => {
      if (error || !state || !state.dispatch) return;
      state.dispatch({ type: ACTION_TYPES.NORMALIZE_SCHEMA });
    }
  })
);
