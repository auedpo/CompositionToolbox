import { els, state } from "../state.js";
import { deskStore, inventoryStore } from "../core/stores.js";

export function getDeskPlacementSettings() {
  const laneRaw = els.deskLane ? parseInt(els.deskLane.value, 10) : 1;
  const durationRaw = els.deskDuration ? Number(els.deskDuration.value) : 1;
  const lane = Number.isFinite(laneRaw) ? Math.max(1, laneRaw) - 1 : 0;
  const duration = Number.isFinite(durationRaw) ? Math.max(0.25, durationRaw) : 1;
  return { lane, duration };
}

export function nextDeskStart(lane) {
  const items = deskStore.list().filter((item) => item.lane === lane);
  const ends = items.map((item) => item.start + (item.duration || 1));
  return ends.length ? Math.max(...ends) : 0;
}

export function renderDeskDetails() {
  if (!els.deskDetails) return;
  const selected = state.selectedDeskId ? deskStore.list().find((item) => item.id === state.selectedDeskId) : null;
  if (!selected) {
    els.deskDetails.textContent = "Select a desk item to see details.";
    return;
  }
  const material = inventoryStore.get(selected.materialId);
  const steps = material && material.data && Array.isArray(material.data.steps)
    ? material.data.steps.join(" ")
    : "";
  els.deskDetails.innerHTML = `
    <div class="meta-line"><strong>${material ? material.name : "Unknown material"}</strong></div>
    <div class="meta-line">lane: ${selected.lane}</div>
    <div class="meta-line">start: ${selected.start}</div>
    <div class="meta-line">duration: ${selected.duration ?? "n/a"}</div>
    <div class="meta-line">steps: ${steps}</div>
  `;
}

export function renderDesk() {
  if (!els.deskLanes || !els.deskCount) return;
  const items = deskStore.list();
  els.deskLanes.innerHTML = "";
  els.deskCount.textContent = items.length ? `${items.length} clips` : "Desk empty.";
  if (!items.length) {
    els.deskLanes.textContent = "Desk is empty.";
    renderDeskDetails();
    return;
  }
  const laneIndices = items.map((item) => item.lane);
  const maxLane = Math.max(0, ...laneIndices);
  const range = Math.max(1, ...items.map((item) => item.start + (item.duration || 1)));
  for (let lane = 0; lane <= maxLane; lane++) {
    const laneItems = items.filter((item) => item.lane === lane);
    const row = document.createElement("div");
    row.className = "desk-lane";
    const label = document.createElement("div");
    label.className = "desk-lane-label";
    label.textContent = `Lane ${lane + 1}`;
    const track = document.createElement("div");
    track.className = "desk-lane-track";
    laneItems.forEach((item) => {
      const material = inventoryStore.get(item.materialId);
      const clip = document.createElement("div");
      clip.className = "desk-item";
      if (item.id === state.selectedDeskId) clip.classList.add("selected");
      const duration = item.duration || 1;
      const left = (item.start / range) * 100;
      const width = Math.max((duration / range) * 100, 4);
      clip.style.left = `${left}%`;
      clip.style.width = `${width}%`;
      clip.textContent = material ? material.name : item.materialId;
      clip.addEventListener("click", () => {
        state.selectedDeskId = item.id;
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
