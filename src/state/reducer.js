// Purpose: reducer.js provides exports: ACTION_TYPES, normalizeAuthoritativeState, reduceAuthoritative.
// Interacts with: imports: ../lenses/lensRegistry.js, ./ids.js, ./schema.js.
// Role: state layer module within the broader app graph.
import { getLens } from "../lenses/lensRegistry.js";
import { makeClipFromMaterial, makeMaterialFromDraft } from "../core/model.js";
import {
  createEmptyAuthoritative,
  makeCellKey,
  parseCellKey,
  DEFAULT_ROW_COUNT,
  DEFAULT_LANE_COUNT,
  SCHEMA_VERSION
} from "./schema.js";
import { makeLensInstanceId } from "./ids.js";

export const ACTION_TYPES = {
  NORMALIZE_SCHEMA: "NORMALIZE_SCHEMA",
  LENS_ADD_TO_CELL: "LENS_ADD_TO_CELL",
  LENS_MOVE_TO_CELL: "LENS_MOVE_TO_CELL",
  LENS_REMOVE: "LENS_REMOVE",
  LENS_SET_PARAM: "LENS_SET_PARAM",
  LENS_REPLACE_PARAMS: "LENS_REPLACE_PARAMS",
  LENS_SET_INPUT: "LENS_SET_INPUT",
  SELECTION_SET: "SELECTION_SET",
  INVENTORY_ADD_FROM_DRAFT: "INVENTORY_ADD_FROM_DRAFT",
  DESK_PLACE_DRAFT: "DESK_PLACE_DRAFT",
  PERSISTENCE_MARK_CLEAN: "PERSISTENCE_MARK_CLEAN",
  PERSISTENCE_SET_ERROR: "PERSISTENCE_SET_ERROR",
  HYDRATE_AUTHORITATIVE: "HYDRATE_AUTHORITATIVE",
  VISUALIZER_SET_TYPE_DEFAULT: "VISUALIZER_SET_TYPE_DEFAULT",
  VISUALIZER_SET_INSTANCE_OVERRIDE: "VISUALIZER_SET_INSTANCE_OVERRIDE",
  UNDO: "UNDO",
  REDO: "REDO"
};

const DEFAULT_VIEW = "workspace";
const ALLOWED_VIEWS = new Set(["workspace", "inventory", "desk"]);

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeLensInput(input) {
  const base = { mode: "auto", pinned: false };
  const next = { ...base, ...(input || {}) };
  if (next.mode !== "auto" && next.mode !== "ref") {
    next.mode = "auto";
  }
  if (typeof next.pinned !== "boolean") {
    next.pinned = Boolean(next.pinned);
  }
  if (next.mode !== "ref") {
    delete next.ref;
  }
  return next;
}

function cloneParamsForLens(lensId) {
  const lens = getLens(lensId);
  if (lens && lens.defaultParams && typeof lens.defaultParams === "object") {
    return { ...lens.defaultParams };
  }
  if (!lens || !Array.isArray(lens.params)) return {};
  return lens.params.reduce((acc, param) => {
    if (param && typeof param.key === "string") {
      acc[param.key] = param.default;
    }
    return acc;
  }, {});
}

function normalizeLensInstances(instances = {}) {
  const normalized = {};
  Object.entries(instances).forEach(([lensInstanceId, instance]) => {
    if (!instance || typeof instance !== "object") return;
    normalized[lensInstanceId] = {
      ...instance,
      lensInstanceId,
      input: normalizeLensInput(instance.input)
    };
  });
  return normalized;
}

function buildNormalizedLanes(incomingLanesById = {}, incomingLaneOrder = []) {
  const baseWorkspace = createEmptyAuthoritative().workspace;
  const lanesById = {};
  const laneOrder = [];
  const seen = new Set();

  (Array.isArray(incomingLaneOrder) ? incomingLaneOrder : []).forEach((laneId) => {
    if (!laneId || seen.has(laneId)) return;
    const lane = incomingLanesById[laneId];
    if (!lane) return;
    seen.add(laneId);
    laneOrder.push(laneId);
    lanesById[laneId] = {
      laneId,
      name: typeof lane.name === "string" && lane.name.trim() ? lane.name.trim() : laneId,
      columnIndex: 0
    };
  });

  Object.keys(incomingLanesById).forEach((laneId) => {
    if (seen.has(laneId)) return;
    seen.add(laneId);
    laneOrder.push(laneId);
    const lane = incomingLanesById[laneId];
    lanesById[laneId] = {
      laneId,
      name: typeof lane.name === "string" && lane.name.trim() ? lane.name.trim() : laneId,
      columnIndex: 0
    };
  });

  baseWorkspace.laneOrder.forEach((laneId) => {
    if (laneOrder.length >= DEFAULT_LANE_COUNT) return;
    if (seen.has(laneId)) return;
    seen.add(laneId);
    laneOrder.push(laneId);
    lanesById[laneId] = {
      laneId,
      name: `Lane ${laneOrder.length}`,
      columnIndex: 0
    };
  });

  while (laneOrder.length < DEFAULT_LANE_COUNT) {
    const laneId = `lane-${laneOrder.length + 1}`;
    if (seen.has(laneId)) {
      laneOrder.push(laneId);
      continue;
    }
    seen.add(laneId);
    laneOrder.push(laneId);
    lanesById[laneId] = {
      laneId,
      name: `Lane ${laneOrder.length}`,
      columnIndex: 0
    };
  }

  const trimmed = laneOrder.slice(0, DEFAULT_LANE_COUNT);
  trimmed.forEach((laneId, index) => {
    const lane = lanesById[laneId] || {};
    lanesById[laneId] = {
      laneId,
      name: typeof lane.name === "string" && lane.name.trim() ? lane.name : `Lane ${index + 1}`,
      columnIndex: index
    };
  });

  return {
    lanesById,
    laneOrder: trimmed
  };
}

function normalizeGridCells(grid = {}, laneOrder = []) {
  const rows = DEFAULT_ROW_COUNT;
  const incomingCells = ensureObject(grid.cells);
  const cells = {};
  laneOrder.forEach((laneId) => {
    for (let row = 0; row < rows; row += 1) {
      const cellKey = makeCellKey(laneId, row);
      const value = Object.prototype.hasOwnProperty.call(incomingCells, cellKey)
        ? incomingCells[cellKey]
        : null;
      cells[cellKey] = value || null;
    }
  });
  return cells;
}

function normalizeWorkspace(workspace = {}, lensInstancesById = {}) {
  const baseWorkspace = createEmptyAuthoritative().workspace;
  const incoming = ensureObject(workspace);
  const normalizedLanes = buildNormalizedLanes(incoming.lanesById, incoming.laneOrder);
  const normalizedCells = normalizeGridCells(incoming.grid, normalizedLanes.laneOrder);
  const filteredCells = { ...normalizedCells };

  Object.entries(filteredCells).forEach(([cellKey, lensInstanceId]) => {
    if (!lensInstanceId) return;
    if (!Object.prototype.hasOwnProperty.call(lensInstancesById, lensInstanceId)) {
      filteredCells[cellKey] = null;
    }
  });

  const lensPlacementById = {};
  Object.entries(filteredCells).forEach(([cellKey, lensInstanceId]) => {
    if (!lensInstanceId) return;
    const coords = parseCellKey(cellKey);
    if (!coords) return;
    lensPlacementById[lensInstanceId] = coords;
  });

  return {
    ...normalizedLanes,
    grid: {
      rows: DEFAULT_ROW_COUNT,
      cols: normalizedLanes.laneOrder.length,
      cells: filteredCells
    },
    lensPlacementById
  };
}

function normalizeSelection(selection = {}, laneOrder = [], lensInstancesById = {}) {
  const baseSelection = createEmptyAuthoritative().selection;
  const incoming = ensureObject(selection);
  const candidateLane = incoming.laneId;
  const resolvedLane = laneOrder.includes(candidateLane) ? candidateLane : laneOrder[0];
  const candidateLensId = incoming.lensInstanceId;
  const resolvedLensId = candidateLensId && lensInstancesById[candidateLensId]
    ? candidateLensId
    : undefined;
  const draftId = resolvedLensId ? incoming.draftId : undefined;
  return {
    ...baseSelection,
    ...incoming,
    laneId: resolvedLane,
    lensInstanceId: resolvedLensId,
    draftId
  };
}

export function normalizeAuthoritativeState(authoritative) {
  const base = createEmptyAuthoritative();
  const incoming = authoritative || {};
  const lensesSection = ensureObject(incoming.lenses);
  const uiSection = ensureObject(incoming.ui);
  const visualizersSection = ensureObject(uiSection.visualizers);
  const typeDefaultByLensId = ensureObject(visualizersSection.typeDefaultByLensId);
  const instanceOverrideByLensInstanceId = ensureObject(visualizersSection.instanceOverrideByLensInstanceId);
  const normalizedLensInstances = normalizeLensInstances(lensesSection.lensInstancesById || {});
  const workspace = normalizeWorkspace(incoming.workspace, normalizedLensInstances);
  const selection = normalizeSelection(incoming.selection, workspace.laneOrder, normalizedLensInstances);
  const inventory = ensureObject(incoming.inventory);
  const desk = ensureObject(incoming.desk);
  const persistence = ensureObject(incoming.persistence);

  return {
    workspace,
    lenses: {
      ...base.lenses,
      lensInstancesById: normalizedLensInstances
    },
    inventory: {
      ...base.inventory,
      itemsById: ensureObject(inventory.itemsById),
      itemOrder: Array.isArray(inventory.itemOrder) ? inventory.itemOrder.slice() : base.inventory.itemOrder.slice()
    },
    desk: {
      ...base.desk,
      nodesById: ensureObject(desk.nodesById),
      nodeOrder: Array.isArray(desk.nodeOrder) ? desk.nodeOrder.slice() : base.desk.nodeOrder.slice()
    },
    selection,
    persistence: {
      ...base.persistence,
      ...persistence,
      schemaVersion: SCHEMA_VERSION
    },
    ui: {
      ...base.ui,
      visualizers: {
        ...base.ui.visualizers,
        typeDefaultByLensId: {
          ...typeDefaultByLensId
        },
        instanceOverrideByLensInstanceId: {
          ...instanceOverrideByLensInstanceId
        }
      }
    }
  };
}

function createLensInstance(lensId) {
  const lensInstanceId = makeLensInstanceId();
  const params = cloneParamsForLens(lensId);
  return {
    lensInstanceId,
    lensId,
    params,
    input: { mode: "auto", pinned: false },
    ui: {}
  };
}

function markDirty(state) {
  return {
    ...state,
    persistence: {
      ...state.persistence,
      dirty: true
    }
  };
}

function updateTypeDefaultVisualizer(current, payload) {
  if (!payload) return current;
  const { lensId, visualizerKey } = payload;
  if (!lensId) return current;
  const nextTypeDefaults = { ...current.ui.visualizers.typeDefaultByLensId };
  if (visualizerKey == null) {
    delete nextTypeDefaults[lensId];
  } else {
    nextTypeDefaults[lensId] = visualizerKey;
  }
  return {
    ...markDirty(current),
    ui: {
      ...current.ui,
      visualizers: {
        ...current.ui.visualizers,
        typeDefaultByLensId: nextTypeDefaults
      }
    }
  };
}

function updateInstanceOverrideVisualizer(current, payload) {
  if (!payload) return current;
  const { lensInstanceId, visualizerKey } = payload;
  if (!lensInstanceId) return current;
  const nextOverrides = { ...current.ui.visualizers.instanceOverrideByLensInstanceId };
  if (visualizerKey == null) {
    delete nextOverrides[lensInstanceId];
  } else {
    nextOverrides[lensInstanceId] = visualizerKey;
  }
  return {
    ...markDirty(current),
    ui: {
      ...current.ui,
      visualizers: {
        ...current.ui.visualizers,
        instanceOverrideByLensInstanceId: nextOverrides
      }
    }
  };
}

function handleAddLens(current, payload) {
  if (!payload) return current;
  const { laneId, row, lensId } = payload;
  if (!laneId || !lensId || typeof row !== "number") return current;
  const { workspace, lenses } = current;
  const lane = workspace.lanesById[laneId];
  if (!lane) return current;
  if (row < 0 || row >= workspace.grid.rows) return current;
  const cellKey = makeCellKey(laneId, row);
  if (workspace.grid.cells[cellKey]) return current;
  const instance = createLensInstance(lensId);
  const nextCells = { ...workspace.grid.cells, [cellKey]: instance.lensInstanceId };
  const nextPlacement = {
    ...workspace.lensPlacementById,
    [instance.lensInstanceId]: { laneId, row }
  };
  const nextWorkspace = {
    ...workspace,
    grid: { ...workspace.grid, cells: nextCells },
    lensPlacementById: nextPlacement
  };
  return {
    ...markDirty(current),
    workspace: nextWorkspace,
    lenses: {
      ...lenses,
      lensInstancesById: {
        ...lenses.lensInstancesById,
        [instance.lensInstanceId]: instance
      }
    },
    selection: {
      ...current.selection,
      laneId,
      lensInstanceId: instance.lensInstanceId,
      draftId: undefined
    }
  };
}

function handleMoveLens(current, payload) {
  if (!payload) return current;
  const { lensInstanceId, laneId, row } = payload;
  if (!lensInstanceId || !laneId || typeof row !== "number") return current;
  const { workspace } = current;
  const placement = workspace.lensPlacementById[lensInstanceId];
  if (!placement) return current;
  if (placement.laneId === laneId && placement.row === row) return current;
  if (row < 0 || row >= workspace.grid.rows) return current;
  if (!workspace.lanesById[laneId]) return current;
  const destinationKey = makeCellKey(laneId, row);
  if (workspace.grid.cells[destinationKey]) return current;
  const sourceKey = makeCellKey(placement.laneId, placement.row);
  const nextCells = {
    ...workspace.grid.cells,
    [sourceKey]: null,
    [destinationKey]: lensInstanceId
  };
  const nextPlacement = {
    ...workspace.lensPlacementById,
    [lensInstanceId]: { laneId, row }
  };
  return {
    ...markDirty(current),
    workspace: {
      ...workspace,
      grid: { ...workspace.grid, cells: nextCells },
      lensPlacementById: nextPlacement
    },
    selection: {
      ...current.selection,
      laneId,
      lensInstanceId,
      draftId: undefined
    }
  };
}

function handleRemoveLens(current, payload) {
  if (!payload) return current;
  const { lensInstanceId } = payload;
  if (!lensInstanceId) return current;
  const { workspace, lenses } = current;
  const placement = workspace.lensPlacementById[lensInstanceId];
  if (!placement) return current;
  const cellKey = makeCellKey(placement.laneId, placement.row);
  const nextCells = { ...workspace.grid.cells, [cellKey]: null };
  const nextPlacement = { ...workspace.lensPlacementById };
  delete nextPlacement[lensInstanceId];
  const nextLensInstances = { ...lenses.lensInstancesById };
  delete nextLensInstances[lensInstanceId];
  const nextSelection = { ...current.selection };
  if (nextSelection.lensInstanceId === lensInstanceId) {
    nextSelection.lensInstanceId = undefined;
    nextSelection.draftId = undefined;
  }
  return {
    ...markDirty(current),
    workspace: {
      ...workspace,
      grid: { ...workspace.grid, cells: nextCells },
      lensPlacementById: nextPlacement
    },
    lenses: {
      ...lenses,
      lensInstancesById: nextLensInstances
    },
    selection: nextSelection
  };
}

function updateLensParams(current, payload, replace = false) {
  if (!payload) return current;
  const { lensInstanceId } = payload;
  if (!lensInstanceId) return current;
  const instance = current.lenses.lensInstancesById[lensInstanceId];
  if (!instance) return current;
  const nextParams = replace
    ? payload.params
    : setAtPath(instance.params || {}, payload.path, payload.value);
  return {
    ...markDirty(current),
    lenses: {
      ...current.lenses,
      lensInstancesById: {
        ...current.lenses.lensInstancesById,
        [lensInstanceId]: {
          ...instance,
          params: nextParams
        }
      }
    }
  };
}

function setAtPath(source, path, value) {
  if (!Array.isArray(path) || path.length === 0) return source;
  const next = Array.isArray(source) ? source.slice() : { ...(source || {}) };
  let cursor = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const prev = cursor[key];
    const clone = Array.isArray(prev) ? prev.slice() : (prev && typeof prev === "object" ? { ...prev } : {});
    cursor[key] = clone;
    cursor = clone;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

function handleSetLensInput(current, payload) {
  if (!payload) return current;
  const { lensInstanceId, input } = payload;
  if (!lensInstanceId || !input) return current;
  const instance = current.lenses.lensInstancesById[lensInstanceId];
  if (!instance) return current;
  const nextInput = normalizeLensInput(input);
  return {
    ...markDirty(current),
    lenses: {
      ...current.lenses,
      lensInstancesById: {
        ...current.lenses.lensInstancesById,
        [lensInstanceId]: {
          ...instance,
          input: nextInput
        }
      }
    }
  };
}

function handleSelectionSet(current, payload) {
  if (!payload) return current;
  const laneOrder = current.workspace.laneOrder;
  const nextSelection = {
    ...current.selection,
    ...payload
  };
  const incomingView = nextSelection.view;
  const resolvedView = ALLOWED_VIEWS.has(incomingView)
    ? incomingView
    : (ALLOWED_VIEWS.has(current.selection.view) ? current.selection.view : DEFAULT_VIEW);
  const lensInstanceId = nextSelection.lensInstanceId;
  const placement = lensInstanceId ? current.workspace.lensPlacementById[lensInstanceId] : undefined;
  const laneCandidate = placement ? placement.laneId : nextSelection.laneId;
  const resolvedLane = laneOrder.includes(laneCandidate) ? laneCandidate : laneOrder[0];
  const resolvedLensInstanceId = lensInstanceId && current.lenses.lensInstancesById[lensInstanceId]
    ? lensInstanceId
    : undefined;
  return {
    ...current,
    selection: {
      ...nextSelection,
      view: resolvedView,
      laneId: resolvedLane,
      lensInstanceId: resolvedLensInstanceId,
      draftId: resolvedLensInstanceId ? nextSelection.draftId : undefined
    }
  };
}

export function reduceAuthoritative(authoritative, action) {
  const current = normalizeAuthoritativeState(authoritative);
  const type = action && action.type ? action.type : null;
  const payload = action && action.payload ? action.payload : {};

  switch (type) {
    case ACTION_TYPES.NORMALIZE_SCHEMA:
      return current;
    case ACTION_TYPES.LENS_ADD_TO_CELL:
      return handleAddLens(current, payload);
    case ACTION_TYPES.LENS_MOVE_TO_CELL:
      return handleMoveLens(current, payload);
    case ACTION_TYPES.LENS_REMOVE:
      return handleRemoveLens(current, payload);
    case ACTION_TYPES.LENS_SET_PARAM:
      return updateLensParams(current, payload, false);
    case ACTION_TYPES.LENS_REPLACE_PARAMS:
      return updateLensParams(current, payload, true);
    case ACTION_TYPES.LENS_SET_INPUT:
      return handleSetLensInput(current, payload);
    case ACTION_TYPES.SELECTION_SET:
      return handleSelectionSet(current, payload);
    case ACTION_TYPES.INVENTORY_ADD_FROM_DRAFT: {
      const draft = payload.draft;
      if (!draft) return current;
      const material = makeMaterialFromDraft(draft, payload.options || {});
      return {
        ...markDirty(current),
        inventory: {
          ...current.inventory,
          itemsById: {
            ...current.inventory.itemsById,
            [material.materialId]: material
          },
          itemOrder: [...current.inventory.itemOrder, material.materialId]
        }
      };
    }
    case ACTION_TYPES.DESK_PLACE_DRAFT: {
      const draft = payload.draft;
      if (!draft) return current;
      const material = makeMaterialFromDraft(draft, payload.options || {});
      const clip = makeClipFromMaterial(material.materialId, payload.position || {});
      return {
        ...markDirty(current),
        inventory: {
          ...current.inventory,
          itemsById: {
            ...current.inventory.itemsById,
            [material.materialId]: material
          },
          itemOrder: [...current.inventory.itemOrder, material.materialId]
        },
        desk: {
          ...current.desk,
          nodesById: {
            ...current.desk.nodesById,
            [clip.clipId]: clip
          },
          nodeOrder: [...current.desk.nodeOrder, clip.clipId]
        }
      };
    }
    case ACTION_TYPES.PERSISTENCE_MARK_CLEAN:
      return {
        ...current,
        persistence: {
          ...current.persistence,
          dirty: false
        }
      };
    case ACTION_TYPES.PERSISTENCE_SET_ERROR: {
      const nextError = payload && payload.error ? payload.error : undefined;
      return {
        ...current,
        persistence: {
          ...current.persistence,
          lastError: nextError
        }
      };
    }
    case ACTION_TYPES.HYDRATE_AUTHORITATIVE: {
      if (!payload || typeof payload !== "object") return current;
      const normalized = normalizeAuthoritativeState(payload);
      return {
        ...normalized,
        persistence: {
          ...normalized.persistence,
          dirty: false,
          lastError: undefined
        }
      };
    }
    case ACTION_TYPES.VISUALIZER_SET_TYPE_DEFAULT:
      return updateTypeDefaultVisualizer(current, payload);
    case ACTION_TYPES.VISUALIZER_SET_INSTANCE_OVERRIDE:
      return updateInstanceOverrideVisualizer(current, payload);
    default:
      return current;
  }
}
