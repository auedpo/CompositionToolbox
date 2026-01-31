// Purpose: actions.js provides exports: createActions.
// Interacts with: imports: ./reducer.js, ./selectors.js?
// Role: state layer module within the broader app graph.
import { ACTION_TYPES } from "./reducer.js";

export function createActions(dispatch, get) {
  return {
    normalizeSchema() {
      dispatch({ type: ACTION_TYPES.NORMALIZE_SCHEMA });
    },
    addLensToCell({ lensId, laneId, row }) {
      dispatch({ type: ACTION_TYPES.LENS_ADD_TO_CELL, payload: { lensId, laneId, row } });
    },
    moveLensToCell({ lensInstanceId, laneId, row }) {
      dispatch({ type: ACTION_TYPES.LENS_MOVE_TO_CELL, payload: { lensInstanceId, laneId, row } });
    },
    removeLens(lensInstanceId) {
      dispatch({ type: ACTION_TYPES.LENS_REMOVE, payload: { lensInstanceId } });
    },
    setLensParam(lensInstanceId, path, value) {
      dispatch({ type: ACTION_TYPES.LENS_SET_PARAM, payload: { lensInstanceId, path, value } });
    },
    replaceLensParams(lensInstanceId, params) {
      dispatch({ type: ACTION_TYPES.LENS_REPLACE_PARAMS, payload: { lensInstanceId, params } });
    },
    patchLensParams(lensInstanceId, patch) {
      if (!lensInstanceId) return;
      if (!patch || typeof patch !== "object") return;
      const state = typeof get === "function" ? get() : null;
      const instance = state && state.authoritative && state.authoritative.lenses
        ? state.authoritative.lenses.lensInstancesById[lensInstanceId]
        : null;
      if (!instance) return;
      const prevParams = instance.params && typeof instance.params === "object" ? instance.params : {};
      const nextParams = { ...prevParams, ...(patch || {}) };
      dispatch({
        type: ACTION_TYPES.LENS_REPLACE_PARAMS,
        payload: { lensInstanceId, params: nextParams }
      });
    },
    setLensInput(lensInstanceId, input) {
      dispatch({ type: ACTION_TYPES.LENS_SET_INPUT, payload: { lensInstanceId, input } });
    },
    setSelection(selectionPatch) {
      dispatch({ type: ACTION_TYPES.SELECTION_SET, payload: selectionPatch });
    },
    selectLane(laneId) {
      dispatch({
        type: ACTION_TYPES.SELECTION_SET,
        payload: { laneId, lensInstanceId: undefined, draftId: undefined }
      });
    },
    selectLens(lensInstanceId) {
      dispatch({
        type: ACTION_TYPES.SELECTION_SET,
        payload: { lensInstanceId }
      });
    },
    selectDraft(draftId) {
      dispatch({ type: ACTION_TYPES.SELECTION_SET, payload: { draftId } });
    },
    promoteDraftToInventory(draftId, options = {}) {
      const state = typeof get === "function" ? get() : null;
      const draft = state && state.derived && state.derived.drafts
        ? state.derived.drafts.draftsById[draftId]
        : null;
      if (!draft) return;
      dispatch({
        type: ACTION_TYPES.INVENTORY_ADD_FROM_DRAFT,
        payload: { draft, options }
      });
    },
    placeDraftOnDesk(draftId, position = {}) {
      const state = typeof get === "function" ? get() : null;
      const draft = state && state.derived && state.derived.drafts
        ? state.derived.drafts.draftsById[draftId]
        : null;
      if (!draft) return;
      dispatch({
        type: ACTION_TYPES.DESK_PLACE_DRAFT,
        payload: { draft, position }
      });
    },
    markClean() {
      dispatch({ type: ACTION_TYPES.PERSISTENCE_MARK_CLEAN, payload: {} });
    },
    setPersistenceError(error) {
      dispatch({
        type: ACTION_TYPES.PERSISTENCE_SET_ERROR,
        payload: { error }
      });
    },
    hydrateAuthoritative(authoritative) {
      dispatch({
        type: ACTION_TYPES.HYDRATE_AUTHORITATIVE,
        payload: authoritative
      });
    },
    undo() {
      dispatch({ type: ACTION_TYPES.UNDO });
    },
    redo() {
      dispatch({ type: ACTION_TYPES.REDO });
    }
  };
}
