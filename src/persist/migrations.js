import { createEmptyAuthoritative } from "../state/schema.js";

const MIGRATION_TARGET_VERSION = 2;

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
    persistence: mergeSection(base.persistence, snapshot.persistence)
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

const MIGRATIONS = {
  0: migrateV0ToV1,
  1: migrateV1ToV2
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
