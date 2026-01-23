import { els, state, storageKeys } from "../state.js";
import { inventoryStore, deskStore } from "../core/stores.js";
import { saveInventory, saveDesk } from "../core/persistence.js";
import { getDeskPlacementSettings, nextDeskStart, renderDesk } from "./deskPanel.js";

export function renderInventoryDetails() {
  if (!els.inventoryDetails) return;
  const selected = state.selectedInventoryId ? inventoryStore.get(state.selectedInventoryId) : null;
  if (!selected) {
    els.inventoryDetails.textContent = "Select a material to see details.";
    return;
  }
  const steps = selected.data && Array.isArray(selected.data.steps)
    ? selected.data.steps.join(" ")
    : "";
  const provenance = selected.provenance || {};
  const metaTags = selected.meta && Array.isArray(selected.meta.tags) ? selected.meta.tags.join(", ") : "";
  els.inventoryDetails.innerHTML = `
    <div class="meta-line"><strong>${selected.name}</strong> (${selected.type})</div>
    <div class="meta-line">id: ${selected.id}</div>
    <div class="meta-line">steps: ${steps}</div>
    <div class="meta-line">tags: ${metaTags || "none"}</div>
    <div class="meta-line">lens: ${provenance.lensId || "n/a"}</div>
    <div class="meta-line">time: ${provenance.timestamp || "n/a"}</div>
  `;
}

export function renderInventory() {
  if (!els.inventoryList || !els.inventoryCount) return;
  const items = inventoryStore.list({ text: state.inventoryFilter });
  els.inventoryList.innerHTML = "";
  els.inventoryCount.textContent = items.length ? `${items.length} materials` : "Inventory empty.";
  if (!items.length) {
    els.inventoryList.textContent = "Inventory is empty.";
    if (els.inventorySendBtn) els.inventorySendBtn.disabled = true;
    if (els.inventoryRemoveBtn) els.inventoryRemoveBtn.disabled = true;
    renderInventoryDetails();
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "inventory-item";
    if (item.id === state.selectedInventoryId) row.classList.add("selected");
    const title = document.createElement("div");
    title.className = "inventory-title";
    title.textContent = item.name;
    const meta = document.createElement("div");
    meta.className = "inventory-meta";
    meta.textContent = item.type;
    row.appendChild(title);
    row.appendChild(meta);
    row.addEventListener("click", () => {
      state.selectedInventoryId = item.id;
      renderInventory();
    });
    els.inventoryList.appendChild(row);
  });
  if (els.inventorySendBtn) els.inventorySendBtn.disabled = !state.selectedInventoryId;
  if (els.inventoryRemoveBtn) els.inventoryRemoveBtn.disabled = !state.selectedInventoryId;
  renderInventoryDetails();
}

export function sendSelectedInventoryToDesk() {
  if (!state.selectedInventoryId) {
    els.status.textContent = "Select an inventory item.";
    return;
  }
  const material = inventoryStore.get(state.selectedInventoryId);
  if (!material) {
    els.status.textContent = "Selected material missing.";
    return;
  }
  const { lane, duration } = getDeskPlacementSettings();
  const start = nextDeskStart(lane);
  deskStore.add({ materialId: material.id, start, duration, lane });
  saveDesk();
  renderDesk();
  els.status.textContent = `Sent ${material.name} to desk.`;
}

export function removeSelectedInventory() {
  if (!state.selectedInventoryId) return;
  const id = state.selectedInventoryId;
  inventoryStore.remove(id);
  saveInventory();
  state.selectedInventoryId = null;
  deskStore.list().forEach((item) => {
    if (item.materialId === id) {
      deskStore.remove(item.id);
    }
  });
  saveDesk();
  renderInventory();
  renderDesk();
  els.status.textContent = "Removed material.";
}

export function bindInventorySearch() {
  if (!els.inventorySearch) return;
  els.inventorySearch.addEventListener("input", () => {
    state.inventoryFilter = els.inventorySearch.value;
    localStorage.setItem(storageKeys.inventoryFilter, state.inventoryFilter);
    renderInventory();
  });
}

export function bindInventoryActions() {
  if (els.inventorySendBtn) {
    els.inventorySendBtn.addEventListener("click", () => {
      sendSelectedInventoryToDesk();
    });
  }
  if (els.inventoryRemoveBtn) {
    els.inventoryRemoveBtn.addEventListener("click", () => {
      removeSelectedInventory();
    });
  }
}
