import { useStore } from "../state/store.js";
import { exportAuthoritativeSnapshot, importAuthoritativeSnapshot } from "./projectSchema.js";

const STORAGE_KEY = "composition-toolbox-project";
const LEGACY_STORAGE_KEY = "composition-toolbox";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function parseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (value.workspace && value.lenses) {
    return value;
  }
  if (value.authoritative) {
    return extractSnapshot(value.authoritative);
  }
  if (value.state && value.state.authoritative) {
    return extractSnapshot(value.state.authoritative);
  }
  return null;
}

function readSnapshotFromKey(key) {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  const parsed = parseJSON(raw);
  return extractSnapshot(parsed);
}

function writeSnapshotToKey(key, snapshot) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const text = JSON.stringify(snapshot, null, 2);
    storage.setItem(key, text);
    return snapshot;
  } catch {
    return null;
  }
}

function getActions() {
  const state = useStore.getState();
  return state && state.actions ? state.actions : null;
}

function recordPersistenceError(error) {
  const actions = getActions();
  if (actions && typeof actions.setPersistenceError === "function") {
    actions.setPersistenceError(error ? String(error) : undefined);
  }
}

function hydrateSnapshot(snapshot) {
  if (!snapshot) return null;
  const actions = getActions();
  if (!actions || typeof actions.hydrateAuthoritative !== "function") return null;
  const authoritative = importAuthoritativeSnapshot(snapshot);
  actions.hydrateAuthoritative(authoritative);
  if (typeof actions.setPersistenceError === "function") {
    actions.setPersistenceError(undefined);
  }
  return authoritative;
}

function readAnySnapshot() {
  const primary = readSnapshotFromKey(STORAGE_KEY);
  if (primary) {
    return { snapshot: primary, key: STORAGE_KEY };
  }
  const legacy = readSnapshotFromKey(LEGACY_STORAGE_KEY);
  if (legacy) {
    return { snapshot: legacy, key: LEGACY_STORAGE_KEY };
  }
  return null;
}

export function saveProjectToLocal() {
  const state = useStore.getState();
  if (!state) return null;
  const snapshot = exportAuthoritativeSnapshot(state);
  const previous = readSnapshotFromKey(STORAGE_KEY);
  const createdAt = previous && previous.meta && previous.meta.createdAt
    ? previous.meta.createdAt
    : snapshot.meta && snapshot.meta.createdAt
      ? snapshot.meta.createdAt
      : new Date().toISOString();
  const storedSnapshot = {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      createdAt,
      updatedAt: new Date().toISOString()
    }
  };
  const result = writeSnapshotToKey(STORAGE_KEY, storedSnapshot);
  if (!result) {
    recordPersistenceError("Unable to write project data to local storage.");
    return null;
  }
  return storedSnapshot;
}

function clearLegacySnapshot() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // best effort
  }
}

export function loadProjectFromLocal() {
  const entry = readAnySnapshot();
  if (!entry) return null;
  try {
    const applied = hydrateSnapshot(entry.snapshot);
    if (applied && entry.key === LEGACY_STORAGE_KEY) {
      saveProjectToLocal();
      clearLegacySnapshot();
    }
    return applied;
  } catch (error) {
    recordPersistenceError(error);
    return null;
  }
}

export function exportProjectJson() {
  const state = useStore.getState();
  if (!state) return "";
  const snapshot = exportAuthoritativeSnapshot(state);
  return JSON.stringify(snapshot, null, 2);
}

export function importProjectJson(jsonString) {
  if (typeof jsonString !== "string") {
    throw new Error("Import payload must be a JSON string.");
  }
  const parsed = parseJSON(jsonString);
  if (!parsed) {
    throw new Error("Invalid JSON payload.");
  }
  const snapshot = extractSnapshot(parsed);
  if (!snapshot) {
    throw new Error("Provided JSON does not contain a valid authoritative snapshot.");
  }
  return hydrateSnapshot(snapshot);
}
