import { ACTION_TYPES } from "./reducer.js";

export function createActions(dispatch) {
  return {
    normalizeSchema() {
      dispatch({ type: ACTION_TYPES.NORMALIZE_SCHEMA });
    },
    addTrack(name) {
      dispatch({ type: ACTION_TYPES.WORKSPACE_ADD_TRACK, payload: { name } });
    },
    renameTrack(trackId, name) {
      dispatch({ type: ACTION_TYPES.WORKSPACE_RENAME_TRACK, payload: { trackId, name } });
    },
    removeTrack(trackId) {
      dispatch({ type: ACTION_TYPES.WORKSPACE_REMOVE_TRACK, payload: { trackId } });
    },
    addLensInstance(trackId, lensId, atIndex) {
      dispatch({ type: ACTION_TYPES.LENS_ADD_INSTANCE, payload: { trackId, lensId, atIndex } });
    },
    removeLensInstance(trackId, lensInstanceId) {
      dispatch({ type: ACTION_TYPES.LENS_REMOVE_INSTANCE, payload: { trackId, lensInstanceId } });
    },
    moveLensInstance(fromTrackId, toTrackId, lensInstanceId, toIndex) {
      dispatch({
        type: ACTION_TYPES.LENS_MOVE_INSTANCE,
        payload: { fromTrackId, toTrackId, lensInstanceId, toIndex }
      });
    },
    setLensParam(lensInstanceId, path, value) {
      dispatch({ type: ACTION_TYPES.LENS_SET_PARAM, payload: { lensInstanceId, path, value } });
    },
    replaceLensParams(lensInstanceId, params) {
      dispatch({ type: ACTION_TYPES.LENS_REPLACE_PARAMS, payload: { lensInstanceId, params } });
    },
    setLensInput(lensInstanceId, input) {
      dispatch({ type: ACTION_TYPES.LENS_SET_INPUT, payload: { lensInstanceId, input } });
    },
    setSelection(selectionPatch) {
      dispatch({ type: ACTION_TYPES.SELECTION_SET, payload: selectionPatch });
    },
    markClean() {
      dispatch({ type: ACTION_TYPES.PERSISTENCE_MARK_CLEAN, payload: {} });
    }
  };
}
