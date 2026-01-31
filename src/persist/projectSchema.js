import { normalizeAuthoritativeState } from "../state/reducer.js";
import { createEmptyAuthoritative } from "../state/schema.js";
import { migrateSnapshotToCurrent, MIGRATION_TARGET_VERSION } from "./migrations.js";

export const CURRENT_SCHEMA_VERSION = MIGRATION_TARGET_VERSION;

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function exportAuthoritativeSnapshot(state) {
  const authoritative = state && state.authoritative
    ? normalizeAuthoritativeState(state.authoritative)
    : createEmptyAuthoritative();
  const meta = {
    updatedAt: new Date().toISOString()
  };
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    workspace: authoritative.workspace,
    lenses: authoritative.lenses,
    inventory: authoritative.inventory,
    desk: authoritative.desk,
    selection: authoritative.selection,
    persistence: {
      ...authoritative.persistence,
      schemaVersion: CURRENT_SCHEMA_VERSION
    },
    meta
  };
}

export function importAuthoritativeSnapshot(snapshot) {
  const migrated = migrateSnapshotToCurrent(snapshot, CURRENT_SCHEMA_VERSION);
  const base = createEmptyAuthoritative();
  const workspace = { ...base.workspace, ...(migrated.workspace || {}) };
  const lenses = { ...base.lenses, ...(migrated.lenses || {}) };
  const inventory = { ...base.inventory, ...(migrated.inventory || {}) };
  const desk = { ...base.desk, ...(migrated.desk || {}) };
  const selection = { ...base.selection, ...(migrated.selection || {}) };
  const persistence = {
    ...base.persistence,
    ...ensureObject(migrated.persistence),
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
  return normalizeAuthoritativeState({
    ...base,
    workspace,
    lenses,
    inventory,
    desk,
    selection,
    persistence
  });
}
