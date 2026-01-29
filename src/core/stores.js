// Purpose: stores.js provides exports: deskStore, inventoryStore.
// Interacts with: imports: ../desk/deskStore.js, ../inventory/inventoryStore.js.
// Role: core domain layer module within the broader app graph.
import { createInventoryStore } from "../inventory/inventoryStore.js";
import { createDeskStore } from "../desk/deskStore.js";

export const inventoryStore = createInventoryStore();
export const deskStore = createDeskStore();
