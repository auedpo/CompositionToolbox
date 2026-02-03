// Purpose: schema.js provides exports: createEmptyAuthoritative, createEmptyDerived, createInitialState, SCHEMA_VERSION.
// Interacts with: no imports.
// Role: state layer module within the broader app graph.
export const SCHEMA_VERSION = 5;
export const DEFAULT_LANE_COUNT = 4;
export const DEFAULT_ROW_COUNT = 10;

function makeDefaultLaneId(index) {
  return `lane-${index + 1}`;
}

export function makeCellKey(laneId, row) {
  return `${laneId}:${row}`;
}

export function parseCellKey(cellKey) {
  if (typeof cellKey !== "string") return null;
  const [laneId, rowPart] = cellKey.split(":");
  const row = Number.isFinite(Number(rowPart)) ? Number(rowPart) : null;
  if (!laneId || row === null) return null;
  return { laneId, row };
}

function buildDefaultLanes() {
  const lanesById = {};
  const laneOrder = [];
  for (let i = 0; i < DEFAULT_LANE_COUNT; i += 1) {
    const laneId = makeDefaultLaneId(i);
    lanesById[laneId] = {
      laneId,
      name: `Lane ${i + 1}`,
      columnIndex: i
    };
    laneOrder.push(laneId);
  }
  return { lanesById, laneOrder };
}

function buildGridCells(laneOrder) {
  const cells = {};
  laneOrder.forEach((laneId) => {
    for (let row = 0; row < DEFAULT_ROW_COUNT; row += 1) {
      cells[makeCellKey(laneId, row)] = null;
    }
  });
  return cells;
}

function createEmptyWorkspace() {
  const { lanesById, laneOrder } = buildDefaultLanes();
  return {
    lanesById,
    laneOrder,
    grid: {
      rows: DEFAULT_ROW_COUNT,
      cols: laneOrder.length,
      cells: buildGridCells(laneOrder)
    },
    lensPlacementById: {}
  };
}

export function createEmptyAuthoritative() {
  return {
    workspace: createEmptyWorkspace(),
    lenses: {
      lensInstancesById: {}
    },
    inventory: {
      itemsById: {},
      itemOrder: []
    },
    desk: {
      nodesById: {},
      nodeOrder: []
    },
    selection: {
      view: "workspace",
      laneId: undefined,
      lensInstanceId: undefined,
      draftId: undefined,
      panel: undefined,
      activeDraftIdByLensInstanceId: {},
      activeLensByLaneId: {}
    },
    persistence: {
      schemaVersion: SCHEMA_VERSION,
      dirty: false,
      lastError: undefined
    },
    ui: {
      visualizers: {
        typeDefaultByLensId: {},
        instanceOverrideByLensInstanceId: {}
      }
    }
  };
}

export function createEmptyDerived() {
  return {
    drafts: {
      draftsById: {},
      draftOrderByLensInstanceId: {},
      activeDraftIdByLensInstanceId: {},
      batchIndex: {
        draftIdsByBatchId: {},
        draftIdsByBatchFrame: {},
        batchSummaryByBatchId: {}
      }
    },
    errors: {
      lastErrorByLensInstanceId: {}
    },
    viz: {
      vizByLensInstanceId: {}
    },
    runtimeWarningsByLensInstanceId: {},
    meta: {
      lastDerivedAt: 0,
      lastActionType: undefined
    }
  };
}

export function createInitialState() {
  return {
    authoritative: createEmptyAuthoritative(),
    derived: createEmptyDerived()
  };
}
