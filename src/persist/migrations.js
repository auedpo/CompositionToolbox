import { createEmptyAuthoritative } from "../state/schema.js";

const MIGRATION_TARGET_VERSION = 6;

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function mergeSection(base, incoming) {
  const incomingSection = ensureObject(incoming);
  return {
    ...base,
    ...incomingSection
  };
}

function normalizeSnapshotCore(snapshot) {
  const base = createEmptyAuthoritative();
  return {
    workspace: mergeSection(base.workspace, snapshot.workspace),
    lenses: mergeSection(base.lenses, snapshot.lenses),
    inventory: mergeSection(base.inventory, snapshot.inventory),
    desk: mergeSection(base.desk, snapshot.desk),
    selection: mergeSection(base.selection, snapshot.selection),
    persistence: mergeSection(base.persistence, snapshot.persistence),
    ui: mergeSection(base.ui, snapshot.ui),
    config: mergeSection(base.config, snapshot.config)
  };
}

function migrateV0ToV1(snapshot) {
  const normalized = normalizeSnapshotCore(snapshot);
  return {
    ...snapshot,
    ...normalized,
    persistence: {
      ...normalized.persistence,
      schemaVersion: 1
    },
    schemaVersion: 1
  };
}

function migrateV1ToV2(snapshot) {
  const persistence = normalizeSnapshotCore(snapshot).persistence;
  return {
    ...snapshot,
    persistence: {
      ...persistence,
      schemaVersion: 2
    },
    schemaVersion: 2
  };
}

function migrateV2ToV3(snapshot) {
  const legacyWorkspace = snapshot.workspace || {};
  const base = createEmptyAuthoritative();
  const laneOrder = base.workspace.laneOrder;
  const lanesById = {};
  laneOrder.forEach((laneId, index) => {
    const trackId = Array.isArray(legacyWorkspace.trackOrder) ? legacyWorkspace.trackOrder[index] : undefined;
    const track = (legacyWorkspace.tracksById || {})[trackId];
    lanesById[laneId] = {
      laneId,
      name: track && typeof track.name === "string" && track.name.trim()
        ? track.name
        : `Lane ${index + 1}`,
      columnIndex: index
    };
  });
  const rows = base.workspace.grid.rows;
  const cells = {};
  laneOrder.forEach((laneId) => {
    for (let row = 0; row < rows; row += 1) {
      cells[`${laneId}:${row}`] = null;
    }
  });
  const lensPlacementById = {};
  const tracksById = legacyWorkspace.tracksById || {};
  const sourceOrder = Array.isArray(legacyWorkspace.trackOrder) ? legacyWorkspace.trackOrder : [];
  sourceOrder.forEach((trackId, trackIndex) => {
    const laneId = laneOrder[trackIndex % laneOrder.length] || laneOrder[0];
    const track = tracksById[trackId];
    if (!track || !Array.isArray(track.lensInstanceIds)) return;
    let row = 0;
    track.lensInstanceIds.forEach((lensInstanceId) => {
      if (row >= rows) return;
      const cellKey = `${laneId}:${row}`;
      cells[cellKey] = lensInstanceId;
      lensPlacementById[lensInstanceId] = { laneId, row };
      row += 1;
    });
  });
  return {
    ...snapshot,
    workspace: {
      ...snapshot.workspace,
      lanesById,
      laneOrder,
      grid: {
        rows,
        cols: laneOrder.length,
        cells
      },
      lensPlacementById,
      tracksById: undefined,
      trackOrder: undefined
    },
    schemaVersion: 3
  };
}

function migrateV3ToV4(snapshot) {
  const persistence = ensureObject(snapshot.persistence);
  return {
    ...snapshot,
    persistence: {
      ...persistence,
      schemaVersion: 4
    },
    schemaVersion: 4
  };
}

function migrateV4ToV5(snapshot) {
  const persistence = ensureObject(snapshot.persistence);
  return {
    ...snapshot,
    persistence: {
      ...persistence,
      schemaVersion: 5
    },
    schemaVersion: 5
  };
}

function migrateV5ToV6(snapshot) {
  const normalized = normalizeSnapshotCore(snapshot);
  return {
    ...snapshot,
    ...normalized,
    persistence: {
      ...normalized.persistence,
      schemaVersion: 6
    },
    schemaVersion: 6
  };
}

const MIGRATIONS = {
  0: migrateV0ToV1,
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
  4: migrateV4ToV5,
  5: migrateV5ToV6
};

export function migrateSnapshotToCurrent(snapshot, targetVersion = MIGRATION_TARGET_VERSION) {
  const working = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  let next = working;
  let version = Number.isInteger(next.schemaVersion) ? next.schemaVersion : 0;
  if (version > targetVersion) {
    throw new Error(`Snapshot version ${version} is newer than supported target ${targetVersion}`);
  }
  while (version < targetVersion) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new Error(`No migration available for schema version ${version}`);
    }
    next = migrate(next);
    version = Number.isInteger(next.schemaVersion) ? next.schemaVersion : version + 1;
  }
  return {
    ...next,
    schemaVersion: targetVersion
  };
}

export { MIGRATION_TARGET_VERSION };
