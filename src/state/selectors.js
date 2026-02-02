import { makeCellKey } from "./schema.js";

export const selectAuthoritative = (state) => state.authoritative;

export const selectWorkspace = (state) => state.authoritative.workspace;

export const selectLaneOrder = (state) => {
  const workspace = selectWorkspace(state);
  return Array.isArray(workspace.laneOrder) ? workspace.laneOrder : [];
};

export const selectLanesById = (state) => {
  const workspace = selectWorkspace(state);
  return workspace.lanesById || {};
};

export const selectGrid = (state) => {
  const workspace = selectWorkspace(state);
  return workspace.grid || { rows: 0, cols: 0, cells: {} };
};

export const selectGridCells = (state) => {
  const grid = selectGrid(state);
  return grid.cells || {};
};

export const selectLensPlacementById = (state) => {
  const workspace = selectWorkspace(state);
  return workspace.lensPlacementById || {};
};

export const selectGridRows = (state) => {
  const grid = selectGrid(state);
  return Number.isFinite(grid.rows) ? grid.rows : 0;
};

export const selectSelectedLaneId = (state) => state.authoritative.selection.laneId;

export const selectSelectedLensInstanceId = (state) => state.authoritative.selection.lensInstanceId;

export const selectLensInstancesById = (state) => state.authoritative.lenses.lensInstancesById;

export const selectLensOutputSelection = (state, lensInstanceId) => {
  if (!lensInstanceId) return { mode: "active", selectedIndices: [] };
  const instances = selectLensInstancesById(state);
  const inst = instances[lensInstanceId];
  const sel = inst && inst.outputSelection ? inst.outputSelection : null;
  return sel && typeof sel === "object"
    ? sel
    : { mode: "active", selectedIndices: [] };
};

export const selectLensInstanceIdsForLane = (state, laneId) => {
  if (!laneId) return [];
  const rows = selectGridRows(state);
  const cells = selectGridCells(state);
  const lensIds = [];
  for (let row = 0; row < rows; row += 1) {
    const cellKey = makeCellKey(laneId, row);
    const lensInstanceId = cells[cellKey];
    if (lensInstanceId) {
      lensIds.push(lensInstanceId);
    }
  }
  return lensIds;
};

export const selectSelectedLensInstance = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  if (!lensInstanceId) return null;
  const lensInstancesById = selectLensInstancesById(state);
  return lensInstancesById[lensInstanceId] || null;
};

export const selectSelectedLensInstanceParams = (state) => {
  const instance = selectSelectedLensInstance(state);
  return instance ? instance.params : null;
};

export const selectSelectedLensInstanceLensId = (state) => {
  const instance = selectSelectedLensInstance(state);
  return instance ? instance.lensId : null;
};

export const selectSelectedLensInstanceLabel = (state) => {
  const instance = selectSelectedLensInstance(state);
  return instance && instance.ui ? instance.ui.label : null;
};

export const selectDerived = (state) => state.derived;

export const selectDraftsById = (state) => state.derived.drafts.draftsById;

export const selectDraftOrderByLensInstanceId = (state) => state.derived.drafts.draftOrderByLensInstanceId;

export const selectActiveDraftIdByLensInstanceId = (state) => state.derived.drafts.activeDraftIdByLensInstanceId;

export const selectSelectedDraftIdsByLensInstanceId = (state) => {
  return state.derived.drafts.selectedDraftIdsByLensInstanceId || {};
};

export const selectSelectedDraftIdsForLensInstance = (state, lensInstanceId) => {
  if (!lensInstanceId) return [];
  const map = selectSelectedDraftIdsByLensInstanceId(state);
  return map && map[lensInstanceId] ? map[lensInstanceId] : [];
};

export const selectSelectedDraftsForLensInstance = (state, lensInstanceId) => {
  const draftsById = selectDraftsById(state);
  const ids = selectSelectedDraftIdsForLensInstance(state, lensInstanceId);
  return ids.map((id) => draftsById[id]).filter(Boolean);
};

export const selectLastErrorByLensInstanceId = (state) => state.derived.errors.lastErrorByLensInstanceId;

export const selectDraftsForLensInstance = (state, lensInstanceId) => {
  if (!lensInstanceId) return [];
  const draftsById = selectDraftsById(state);
  const orderMap = selectDraftOrderByLensInstanceId(state);
  const order = orderMap && orderMap[lensInstanceId] ? orderMap[lensInstanceId] : [];
  return order.map((draftId) => draftsById[draftId]).filter(Boolean);
};

export const selectActiveDraftForLensInstance = (state, lensInstanceId) => {
  if (!lensInstanceId) return null;
  const draftsById = selectDraftsById(state);
  const activeMap = selectActiveDraftIdByLensInstanceId(state);
  const activeId = activeMap ? activeMap[lensInstanceId] : undefined;
  return activeId ? draftsById[activeId] || null : null;
};

export const selectSelectedLensDrafts = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  return selectDraftsForLensInstance(state, lensInstanceId);
};

export const selectSelectedLensError = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  if (!lensInstanceId) return null;
  const errorMap = selectLastErrorByLensInstanceId(state);
  return errorMap ? errorMap[lensInstanceId] || null : null;
};

export const selectVizByLensInstanceId = (state) => {
  return state.derived.viz && state.derived.viz.vizByLensInstanceId
    ? state.derived.viz.vizByLensInstanceId
    : {};
};

export const selectVizModelForLensInstance = (state, lensInstanceId) => {
  if (!lensInstanceId) return null;
  const vizMap = selectVizByLensInstanceId(state);
  return vizMap[lensInstanceId] || null;
};

export const selectSelectedLensVizModel = (state) => {
  const lensInstanceId = selectSelectedLensInstanceId(state);
  return selectVizModelForLensInstance(state, lensInstanceId);
};

export const selectVisualizersState = (state) => {
  const ui = state.authoritative && state.authoritative.ui ? state.authoritative.ui : {};
  return ui.visualizers ? ui.visualizers : {
    typeDefaultByLensId: {},
    instanceOverrideByLensInstanceId: {}
  };
};

export const selectVisualizerTypeDefault = (state, lensId) => {
  if (!lensId) return null;
  const visualizers = selectVisualizersState(state);
  return visualizers.typeDefaultByLensId && visualizers.typeDefaultByLensId[lensId]
    ? visualizers.typeDefaultByLensId[lensId]
    : null;
};

export const selectVisualizerInstanceOverride = (state, lensInstanceId) => {
  if (!lensInstanceId) return null;
  const visualizers = selectVisualizersState(state);
  return visualizers.instanceOverrideByLensInstanceId
    ? visualizers.instanceOverrideByLensInstanceId[lensInstanceId] || null
    : null;
};
