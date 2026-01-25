import { storageKeys } from "../state.js";
import { inventoryStore, deskStore } from "./stores.js";

export function saveInventory() {
  localStorage.setItem(storageKeys.inventory, JSON.stringify(inventoryStore.serialize()));
}

export function loadInventory() {
  const stored = localStorage.getItem(storageKeys.inventory);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    inventoryStore.deserialize(parsed);
    if (inventoryStore.needsMigration && inventoryStore.needsMigration()) {
      saveInventory();
    }
  } catch {
    inventoryStore.clear();
  }
}

export function saveDesk() {
  localStorage.setItem(storageKeys.desk, JSON.stringify(deskStore.serialize()));
}

export function loadDesk() {
  const stored = localStorage.getItem(storageKeys.desk);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    deskStore.deserialize(parsed);
    if (deskStore.needsMigration && deskStore.needsMigration()) {
      saveDesk();
    }
  } catch {
    deskStore.clear();
  }
}
