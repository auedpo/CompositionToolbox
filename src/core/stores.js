import { createInventoryStore } from "../inventory/inventoryStore.js";
import { createDeskStore } from "../desk/deskStore.js";

export const inventoryStore = createInventoryStore();
export const deskStore = createDeskStore();
