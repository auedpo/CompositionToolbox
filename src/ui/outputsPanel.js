import { els, state } from "../state.js";
import { inventoryStore, deskStore } from "../core/stores.js";
import { saveInventory, saveDesk } from "../core/persistence.js";
import { getDeskPlacementSettings, nextDeskStart, renderDesk } from "./deskPanel.js";
import { renderInventory } from "./inventoryPanel.js";

let onPreview = null;

export function setOutputsPreviewHandler(handler) {
  onPreview = handler;
}

export function outputKeyForRecord(O, rec) {
  return `${O}|${rec.perm.join(",")}|${rec.pitches.join(",")}`;
}

export function getSelectedOutputEntries() {
  const outputs = state.outputsByO[state.activeO] || [];
  const records = state.resultsByO[state.activeO] || [];
  const selected = [];
  outputs.forEach((draft, idx) => {
    const record = records[idx];
    if (!record) return;
    const key = outputKeyForRecord(state.activeO, record);
    if (!state.selectedOutputKeys.has(key)) return;
    selected.push({ draft, record });
  });
  return selected;
}

function buildOutputName(record, windowOctaves, index) {
  const perm = record.perm.join(" ");
  return `O${windowOctaves} perm ${perm} #${index}`;
}

export function renderOutputs() {
  if (!els.outputsList || !els.outputsCount) return;
  const outputs = state.outputsByO[state.activeO] || [];
  const records = state.resultsByO[state.activeO] || [];
  els.outputsList.innerHTML = "";
  els.outputsCount.textContent = outputs.length ? `${outputs.length} drafts` : "No drafts yet.";
  if (!outputs.length) {
    els.outputsList.textContent = "No outputs yet.";
    if (els.captureOutputsBtn) els.captureOutputsBtn.disabled = true;
    if (els.sendToDeskBtn) els.sendToDeskBtn.disabled = true;
    return;
  }
  outputs.forEach((draft, idx) => {
    const record = records[idx];
    if (!record) return;
    const key = outputKeyForRecord(state.activeO, record);
    const row = document.createElement("div");
    row.className = "output-item";

    const left = document.createElement("div");
    left.className = "output-left";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedOutputKeys.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedOutputKeys.add(key);
      } else {
        state.selectedOutputKeys.delete(key);
      }
      renderOutputs();
    });
    const label = document.createElement("div");
    label.className = "output-label";
    label.textContent = `#${idx + 1} perm ${record.perm.join(" ")} -> ${record.pitches.join(" ")}`;
    left.appendChild(checkbox);
    left.appendChild(label);

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "ghost";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", () => {
      if (onPreview) onPreview(record);
    });

    row.appendChild(left);
    row.appendChild(previewBtn);
    els.outputsList.appendChild(row);
    void draft;
  });
  const hasSelection = state.selectedOutputKeys.size > 0;
  if (els.captureOutputsBtn) els.captureOutputsBtn.disabled = !hasSelection;
  if (els.sendToDeskBtn) els.sendToDeskBtn.disabled = !hasSelection;
}

export function captureSelectedOutputs() {
  const selected = getSelectedOutputEntries();
  if (!selected.length) {
    els.status.textContent = "Select outputs to capture.";
    return [];
  }
  const captured = selected.map((entry, idx) => {
    const name = buildOutputName(entry.record, state.activeO, idx + 1);
    return inventoryStore.add(entry.draft, { name });
  }).filter(Boolean);
  saveInventory();
  renderInventory();
  els.status.textContent = `Captured ${captured.length} materials.`;
  return captured;
}

export function sendSelectedOutputsToDesk() {
  const captured = captureSelectedOutputs();
  if (!captured.length) return;
  const { lane, duration } = getDeskPlacementSettings();
  let cursor = nextDeskStart(lane);
  captured.forEach((material) => {
    deskStore.add({ materialId: material.id, start: cursor, duration, lane });
    cursor += duration;
  });
  saveDesk();
  renderDesk();
  els.status.textContent = `Sent ${captured.length} materials to desk.`;
}
