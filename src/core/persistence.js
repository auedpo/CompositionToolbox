import { storageKeys } from "../state.js";
import { inventoryStore, deskStore } from "./stores.js";

const SCHEMA_VERSION = 1;

function wrapPersisted(data) {
  return {
    schemaVersion: SCHEMA_VERSION,
    data
  };
}

function unwrapPersisted(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { schemaVersion: 0, data: null };
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "schemaVersion")) {
    return {
      schemaVersion: parsed.schemaVersion,
      data: parsed.data
    };
  }
  return { schemaVersion: 0, data: parsed };
}

export function saveInventory() {
  const payload = wrapPersisted(inventoryStore.serialize());
  localStorage.setItem(storageKeys.inventory, JSON.stringify(payload));
}

export function loadInventory() {
  const stored = localStorage.getItem(storageKeys.inventory);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    const { data } = unwrapPersisted(parsed);
    inventoryStore.deserialize(data);
    if (inventoryStore.needsMigration && inventoryStore.needsMigration()) {
      saveInventory();
    }
  } catch {
    inventoryStore.clear();
  }
}

export function saveDesk() {
  const payload = wrapPersisted(deskStore.serialize());
  localStorage.setItem(storageKeys.desk, JSON.stringify(payload));
}

export function loadDesk() {
  const stored = localStorage.getItem(storageKeys.desk);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    const { data } = unwrapPersisted(parsed);
    deskStore.deserialize(data);
    if (deskStore.needsMigration && deskStore.needsMigration()) {
      saveDesk();
    }
  } catch {
    deskStore.clear();
  }
}

export function saveProject() {
  saveInventory();
  saveDesk();
}

export function loadProject() {
  loadInventory();
  loadDesk();
}
