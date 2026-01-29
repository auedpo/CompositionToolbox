// Purpose: outputsPanel.js provides exports: captureSelectedDrafts, draftKeyForRecord, getSelectedDraftEntries, placeSelectedDraftsOnDesk, renderDrafts... (+1 more).
// Interacts with: imports: ../core/persistence.js, ../core/stores.js, ../state.js, ./deskPanel.js, ./inventoryPanel.js.
// Role: UI layer module within the broader app graph.
import { els, state } from "../state.js";
import { inventoryStore, deskStore } from "../core/stores.js";
import { saveInventory, saveDesk } from "../core/persistence.js";
import { getDeskPlacementSettings, nextDeskStart, renderDesk } from "./deskPanel.js";
import { renderInventory } from "./inventoryPanel.js";

let onPreview = null;

export function setDraftsPreviewHandler(handler) {
  onPreview = handler;
}

export function draftKeyForRecord(O, rec) {
  return `${O}|${rec.perm.join(",")}|${rec.pitches.join(",")}`;
}

export function getSelectedDraftEntries() {
  const drafts = state.draftsByO[state.activeO] || [];
  const records = state.resultsByO[state.activeO] || [];
  const selected = [];
  const activeKey = state.activeDraftKey;
  if (!activeKey) return selected;
  drafts.forEach((draft, idx) => {
    const record = records[idx];
    if (!record) return;
    const key = draftKeyForRecord(state.activeO, record);
    if (key !== activeKey) return;
    selected.push({ draft, record });
  });
  return selected;
}

function buildDraftName(record, windowOctaves, index) {
  const perm = record.perm.join(" ");
  return `O${windowOctaves} perm ${perm} #${index}`;
}

export function renderDrafts() {
  if (!els.draftsList || !els.draftsCount) return;
  const drafts = state.draftsByO[state.activeO] || [];
  const records = state.resultsByO[state.activeO] || [];
  els.draftsList.innerHTML = "";
  els.draftsCount.textContent = drafts.length ? `${drafts.length} drafts` : "No drafts yet.";
  if (!drafts.length) {
    els.draftsList.textContent = "No drafts yet.";
    if (els.captureDraftsBtn) els.captureDraftsBtn.disabled = true;
    if (els.placeDraftsBtn) els.placeDraftsBtn.disabled = true;
    return;
  }
  if (!state.activeDraftKey) {
    const firstRecord = records[0];
    if (firstRecord) {
      state.activeDraftKey = draftKeyForRecord(state.activeO, firstRecord);
    }
  }
  drafts.forEach((draft, idx) => {
    const record = records[idx];
    if (!record) return;
    const key = draftKeyForRecord(state.activeO, record);
    const row = document.createElement("div");
    row.className = "draft-item";
    if (key === state.activeDraftKey) {
      row.classList.add("active");
    }

    const left = document.createElement("div");
    left.className = "draft-left";
    const label = document.createElement("div");
    label.className = "draft-label";
    label.textContent = `Draft #${idx + 1}: perm ${record.perm.join(" ")} -> ${record.pitches.join(" ")}`;
    if (key === state.activeDraftKey) {
      const status = document.createElement("span");
      status.className = "draft-status";
      status.textContent = "Active";
      label.appendChild(status);
    }
    left.appendChild(label);
    row.addEventListener("click", () => {
      state.activeDraftKey = key;
      renderDrafts();
    });

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "ghost";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (onPreview) onPreview(record);
    });

    row.appendChild(left);
    row.appendChild(previewBtn);
    els.draftsList.appendChild(row);
    void draft;
  });
  const hasSelection = Boolean(state.activeDraftKey);
  if (els.captureDraftsBtn) els.captureDraftsBtn.disabled = !hasSelection;
  if (els.placeDraftsBtn) els.placeDraftsBtn.disabled = !hasSelection;
}

export function captureSelectedDrafts() {
  const selected = getSelectedDraftEntries();
  if (!selected.length) {
    els.status.textContent = "Select an active draft to capture.";
    return [];
  }
  const captured = selected.map((entry, idx) => {
    const name = buildDraftName(entry.record, state.activeO, idx + 1);
    return inventoryStore.add(entry.draft, { name });
  }).filter(Boolean);
  saveInventory();
  renderInventory();
  els.status.textContent = `Captured ${captured.length} materials.`;
  return captured;
}

export function placeSelectedDraftsOnDesk() {
  const captured = captureSelectedDrafts();
  if (!captured.length) return;
  const { lane, duration } = getDeskPlacementSettings();
  let cursor = nextDeskStart(lane);
  captured.forEach((material) => {
    deskStore.add({ materialId: material.materialId, start: cursor, duration, laneId: lane });
    cursor += duration;
  });
  saveDesk();
  renderDesk();
  els.status.textContent = `Placed ${captured.length} clips on desk.`;
}
