// Purpose: workspaceGrid.js provides exports: initWorkspaceGrid.
// Interacts with: imports: ../state.js, ./panelChrome.js.
// Role: UI layer module within the broader app graph.
import { createPanelChrome } from "./panelChrome.js";
import { storageKeys } from "../state.js";

const defaultLaneState = {
  intervalPlacement: { collapsed: false },
  euclideanPatterns: { collapsed: false }
};

function loadLaneState() {
  const raw = localStorage.getItem(storageKeys.workspaceLaneState);
  if (!raw) return { ...defaultLaneState };
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultLaneState, ...(parsed || {}) };
  } catch {
    return { ...defaultLaneState };
  }
}

function saveLaneState(state) {
  localStorage.setItem(storageKeys.workspaceLaneState, JSON.stringify(state));
}

function createIconButton(label, title) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn ghost";
  btn.textContent = label;
  if (title) btn.title = title;
  return btn;
}

function buildSubtrackPlaceholder(label) {
  const body = document.createElement("div");
  body.className = "subtrack-placeholder";
  body.textContent = "Transformer slot";
  return createPanelChrome({
    title: label,
    body,
    className: "subtrack-card",
    size: "compact"
  });
}

function applyLaneCollapse(laneEl, toggleBtn, collapsed) {
  laneEl.classList.toggle("lane-collapsed", collapsed);
  toggleBtn.textContent = collapsed ? "+" : "-";
  toggleBtn.title = collapsed ? "Expand lane" : "Collapse lane";
}

export function initWorkspaceGrid(container) {
  if (!container || container.dataset.ready === "true") return null;
  container.dataset.ready = "true";
  container.innerHTML = "";

  const laneState = loadLaneState();
  const shell = document.createElement("div");
  shell.className = "workspace-shell";
  const scroller = document.createElement("div");
  scroller.className = "workspace-scroller";

  const lanes = document.createElement("div");
  lanes.className = "workspace-lanes";

  const laneSpecs = [
    { id: "intervalPlacement", title: "Interval Placement" },
    { id: "euclideanPatterns", title: "Euclidean Patterns" }
  ];

  const slots = new Map();

  laneSpecs.forEach((spec) => {
    const lane = document.createElement("div");
    lane.className = "workspace-lane";
    lane.dataset.lane = spec.id;

    const header = document.createElement("div");
    header.className = "lane-header";
    const title = document.createElement("div");
    title.className = "lane-title";
    title.textContent = spec.title;
    const actions = document.createElement("div");
    actions.className = "lane-actions";
    const muteBtn = createIconButton("M", "Mute lane (stub)");
    const hideBtn = createIconButton("H", "Hide lane (stub)");
    const collapseBtn = createIconButton("-", "Collapse lane");
    actions.appendChild(muteBtn);
    actions.appendChild(hideBtn);
    actions.appendChild(collapseBtn);
    header.appendChild(title);
    header.appendChild(actions);
    lane.appendChild(header);

    const body = document.createElement("div");
    body.className = "lane-body";
    const grid = document.createElement("div");
    grid.className = "lane-grid";

    const mainSlot = document.createElement("div");
    mainSlot.className = "lane-main";
    mainSlot.dataset.slot = `lane-${spec.id}-main`;
    slots.set(mainSlot.dataset.slot, mainSlot);

    grid.appendChild(mainSlot);
    body.appendChild(grid);

    const subtracks = document.createElement("div");
    subtracks.className = "lane-subtracks";
    subtracks.appendChild(buildSubtrackPlaceholder("Transformer A"));
    subtracks.appendChild(buildSubtrackPlaceholder("Transformer B"));
    body.appendChild(subtracks);
    lane.appendChild(body);

    const collapsed = laneState[spec.id]?.collapsed === true;
    applyLaneCollapse(lane, collapseBtn, collapsed);
    collapseBtn.addEventListener("click", () => {
      const next = !lane.classList.contains("lane-collapsed");
      applyLaneCollapse(lane, collapseBtn, next);
      laneState[spec.id] = { collapsed: next };
      saveLaneState(laneState);
    });

    lanes.appendChild(lane);
  });

  scroller.appendChild(lanes);
  shell.appendChild(scroller);

  const dockRow = document.createElement("div");
  dockRow.className = "workspace-dock-row";
  const dockGrid = document.createElement("div");
  dockGrid.className = "workspace-dock-grid";
  ["inventory", "desk"].forEach((name) => {
    const dockSlot = document.createElement("div");
    dockSlot.className = "dock-slot";
    dockSlot.dataset.slot = `dock-${name}`;
    slots.set(dockSlot.dataset.slot, dockSlot);
    dockGrid.appendChild(dockSlot);
  });
  dockRow.appendChild(dockGrid);
  shell.appendChild(dockRow);

  container.appendChild(shell);

  return { slots };
}
