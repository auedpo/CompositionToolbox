import { els, state, storageKeys } from "../state.js";
import { deskStore, inventoryStore } from "../core/stores.js";
import { saveDesk } from "../core/persistence.js";

const RESIZE_GRAB_PX = 10;
let activeDrag = null;
let suppressClick = false;
let cachedLaneNames = null;

function readDeskGridStep() {
  const raw = els.deskGridStep ? Number(els.deskGridStep.value) : 0.25;
  if (!Number.isFinite(raw)) return 0.25;
  return Math.max(0.01, raw);
}

function loadLaneNames() {
  if (cachedLaneNames) return cachedLaneNames;
  const raw = localStorage.getItem(storageKeys.deskLaneNames);
  if (!raw) {
    cachedLaneNames = [];
    return cachedLaneNames;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedLaneNames = Array.isArray(parsed) ? parsed.map((name) => `${name || ""}`) : [];
  } catch {
    cachedLaneNames = [];
  }
  return cachedLaneNames;
}

function saveLaneNames(names) {
  cachedLaneNames = names.slice();
  localStorage.setItem(storageKeys.deskLaneNames, JSON.stringify(cachedLaneNames));
}

function laneLabelFor(lane) {
  const names = loadLaneNames();
  const name = names[lane];
  return name && name.trim() ? name.trim() : `Lane ${lane + 1}`;
}

function snapToGrid(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  const snapped = Math.round(value / step) * step;
  return Number.isFinite(snapped) ? snapped : value;
}

function rangesOverlap(aStart, aDuration, bStart, bDuration) {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

function laneFromClientY(clientY) {
  if (!els.deskLanes) return 0;
  const rows = Array.from(els.deskLanes.querySelectorAll(".desk-lane"));
  if (!rows.length) return 0;
  const first = rows[0].getBoundingClientRect();
  const last = rows[rows.length - 1].getBoundingClientRect();
  if (clientY < first.top) return 0;
  if (clientY > last.bottom) {
    const lastLane = parseInt(rows[rows.length - 1].dataset.lane || "0", 10);
    return Number.isFinite(lastLane) ? lastLane + 1 : rows.length;
  }
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      const lane = parseInt(row.dataset.lane || "0", 10);
      return Number.isFinite(lane) ? lane : 0;
    }
  }
  return 0;
}

function resolveOverlapLane(targetLane, itemId, start, duration) {
  const items = deskStore.list().filter((item) => item.clipId !== itemId);
  let lane = Math.max(0, targetLane);
  while (true) {
    const overlap = items.find((item) => item.laneId === lane
      && rangesOverlap(start, duration, item.start, item.duration || 1));
    if (!overlap) return lane;
    lane = overlap.laneId + 1;
  }
}

function applyPreviewPosition(clip, start, duration, range) {
  const safeRange = Math.max(range || 1, start + duration, 1);
  const left = (start / safeRange) * 100;
  const width = Math.max((duration / safeRange) * 100, 4);
  clip.style.left = `${left}%`;
  clip.style.width = `${width}%`;
}

function computeDragUpdate(event) {
  const drag = activeDrag;
  if (!drag) return null;
  const deltaX = event.clientX - drag.startX;
  const unitsPerPx = drag.range / drag.trackRect.width;
  const deltaUnits = deltaX * unitsPerPx;
  const minDuration = Math.max(drag.gridStep, 0.01);
  if (drag.action === "resize-left") {
    const end = drag.originStart + drag.originDuration;
    let nextStart = drag.originStart + deltaUnits;
    nextStart = snapToGrid(nextStart, drag.gridStep);
    nextStart = Math.max(0, Math.min(end - minDuration, nextStart));
    return { start: nextStart, duration: Math.max(minDuration, end - nextStart) };
  }
  if (drag.action === "resize-right") {
    const start = drag.originStart;
    let nextEnd = start + drag.originDuration + deltaUnits;
    nextEnd = snapToGrid(nextEnd, drag.gridStep);
    nextEnd = Math.max(start + minDuration, nextEnd);
    return { start, duration: Math.max(minDuration, nextEnd - start) };
  }
  let nextStart = drag.originStart + deltaUnits;
  nextStart = snapToGrid(nextStart, drag.gridStep);
  nextStart = Math.max(0, nextStart);
  return { start: nextStart, duration: drag.originDuration };
}

export function getDeskPlacementSettings() {
  const laneRaw = els.deskLane ? parseInt(els.deskLane.value, 10) : 1;
  const durationRaw = els.deskDuration ? Number(els.deskDuration.value) : 1;
  const lane = Number.isFinite(laneRaw) ? Math.max(1, laneRaw) - 1 : 0;
  const duration = Number.isFinite(durationRaw) ? Math.max(0.25, durationRaw) : 1;
  return { lane, duration };
}

export function nextDeskStart(lane) {
  const items = deskStore.list().filter((item) => item.laneId === lane);
  const ends = items.map((item) => item.start + (item.duration || 1));
  return ends.length ? Math.max(...ends) : 0;
}

export function renderDeskDetails() {
  if (!els.deskDetails) return;
  const selected = state.selectedDeskId ? deskStore.list().find((item) => item.clipId === state.selectedDeskId) : null;
  if (!selected) {
    els.deskDetails.textContent = "Select a clip to see details.";
    return;
  }
  const material = inventoryStore.get(selected.materialId);
  let detailLine = "";
  if (material && material.type === "Pattern") {
    const values = Array.isArray(material.payload) ? material.payload : [];
    const kind = material.subtype || "pattern";
    if (kind === "indexMask") {
      detailLine = `values: [${values.join(", ")}]`;
    } else {
      detailLine = `values: ${values.join("")}`;
    }
  } else {
    const steps = material && Array.isArray(material.payload)
      ? material.payload.join(" ")
      : "";
    detailLine = `steps: ${steps}`;
  }
  els.deskDetails.innerHTML = `
    <div class="meta-line"><strong>${material ? material.name : "Unknown material"}</strong></div>
    <div class="meta-line">lane: ${selected.laneId}</div>
    <div class="meta-line">start: ${selected.start}</div>
    <div class="meta-line">duration: ${selected.duration ?? "n/a"}</div>
    <div class="meta-line">${detailLine}</div>
  `;
}

export function removeSelectedDeskItem() {
  if (!state.selectedDeskId) return false;
  const removed = deskStore.remove(state.selectedDeskId);
  if (removed) {
    state.selectedDeskId = null;
  }
  return removed;
}

export function renderDesk() {
  if (!els.deskLanes || !els.deskCount) return;
  const items = deskStore.list();
  els.deskLanes.innerHTML = "";
  els.deskCount.textContent = items.length ? `${items.length} clips` : "Desk empty.";
  if (els.deskRemoveBtn) els.deskRemoveBtn.disabled = !state.selectedDeskId;
  if (!items.length) {
    els.deskLanes.textContent = "Desk is empty.";
    renderDeskDetails();
    return;
  }
  const gridStep = readDeskGridStep();
  const laneIndices = items.map((item) => item.laneId);
  const maxLane = Math.max(0, ...laneIndices);
  const range = Math.max(1, ...items.map((item) => item.start + (item.duration || 1)));
  const gridPct = range > 0 ? (gridStep / range) * 100 : 0;
  for (let lane = 0; lane <= maxLane; lane++) {
    const laneItems = items.filter((item) => item.laneId === lane);
    const row = document.createElement("div");
    row.className = "desk-lane";
    row.dataset.lane = `${lane}`;
    const label = document.createElement("div");
    label.className = "desk-lane-label";
    label.textContent = laneLabelFor(lane);
    label.title = "Click to rename lane";
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      if (label.classList.contains("editing")) return;
      const current = loadLaneNames()[lane] || "";
      label.classList.add("editing");
      label.textContent = "";
      const input = document.createElement("input");
      input.type = "text";
      input.value = current;
      input.className = "desk-lane-input";
      label.appendChild(input);
      input.focus();
      input.select();
      const commit = (value) => {
        const names = loadLaneNames().slice();
        const trimmed = value.trim();
        names[lane] = trimmed ? trimmed : "";
        saveLaneNames(names);
        renderDesk();
      };
      const cancel = () => {
        renderDesk();
      };
      input.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Enter") {
          keyEvent.preventDefault();
          commit(input.value);
        } else if (keyEvent.key === "Escape") {
          keyEvent.preventDefault();
          cancel();
        }
      });
      input.addEventListener("blur", () => {
        commit(input.value);
      });
    });
    const track = document.createElement("div");
    track.className = "desk-lane-track";
    if (gridPct > 0) {
      track.classList.add("has-grid");
      track.style.setProperty("--desk-grid-step", `${gridPct}%`);
    }
    laneItems.forEach((item) => {
      const material = inventoryStore.get(item.materialId);
      const clip = document.createElement("div");
      clip.className = "desk-item";
      clip.dataset.id = item.clipId;
      if (item.clipId === state.selectedDeskId) clip.classList.add("selected");
      const duration = item.duration || 1;
      const left = (item.start / range) * 100;
      const width = Math.max((duration / range) * 100, 4);
      clip.style.left = `${left}%`;
      clip.style.width = `${width}%`;
      clip.textContent = material ? material.name : item.materialId;
      clip.addEventListener("mousemove", (event) => {
        if (activeDrag) return;
        const rect = clip.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const edge = offsetX <= RESIZE_GRAB_PX || rect.right - event.clientX <= RESIZE_GRAB_PX;
        clip.style.cursor = edge ? "ew-resize" : "grab";
      });
      clip.addEventListener("mouseleave", () => {
        if (!activeDrag) clip.style.cursor = "grab";
      });
      clip.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const rect = clip.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const action = offsetX <= RESIZE_GRAB_PX
          ? "resize-left"
          : rect.right - event.clientX <= RESIZE_GRAB_PX
            ? "resize-right"
            : "move";
        suppressClick = false;
        activeDrag = {
          id: item.clipId,
          action,
          originLane: item.laneId,
          originStart: item.start,
          originDuration: duration,
          startX: event.clientX,
          startY: event.clientY,
          pointerId: event.pointerId,
          trackRect: track.getBoundingClientRect(),
          range,
          gridStep,
          clip
        };
        clip.classList.add("dragging");
        clip.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
        const onMove = (moveEvent) => {
          if (!activeDrag || moveEvent.pointerId !== activeDrag.pointerId) return;
          const update = computeDragUpdate(moveEvent);
          if (!update) return;
          if (Math.abs(moveEvent.clientX - activeDrag.startX) > 2 || Math.abs(moveEvent.clientY - activeDrag.startY) > 2) {
            suppressClick = true;
          }
          applyPreviewPosition(activeDrag.clip, update.start, update.duration, activeDrag.range);
        };
        const onUp = (upEvent) => {
          if (!activeDrag || upEvent.pointerId !== activeDrag.pointerId) return;
          const update = computeDragUpdate(upEvent);
          const drag = activeDrag;
          activeDrag = null;
          drag.clip.classList.remove("dragging");
          drag.clip.releasePointerCapture(upEvent.pointerId);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          if (!update) return;
          const dropLane = laneFromClientY(upEvent.clientY);
          const resolvedLane = resolveOverlapLane(
            Number.isFinite(dropLane) ? dropLane : drag.originLane,
            drag.id,
            update.start,
            update.duration
          );
          deskStore.move(drag.id, { start: update.start, duration: update.duration, laneId: resolvedLane });
          state.selectedDeskId = drag.id;
          saveDesk();
          renderDesk();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
      clip.addEventListener("click", () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        state.selectedDeskId = item.clipId;
        renderDesk();
      });
      track.appendChild(clip);
    });
    row.appendChild(label);
    row.appendChild(track);
    els.deskLanes.appendChild(row);
  }
  renderDeskDetails();
}
