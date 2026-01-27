import { els, state, storageKeys } from "./state.js";
import { defaultParams } from "./core/defaultParams.js";
import { getLens, listLenses } from "./lenses/lensRegistry.js";
import { collectDraftCatalog, createLensInstance, scheduleLensEvaluation } from "./lenses/lensRuntime.js";
import { loadDesk, loadInventory, saveDesk, saveInventory } from "./core/persistence.js";
import { inventoryStore, deskStore } from "./core/stores.js";
import { setGuardReporter } from "./core/guards.js";
import { computeReferenceG } from "./core/intervalMath.js";
import { engineLabelForId } from "./core/placementLabels.js";
import { renderKeyboard, renderFretboard } from "./ui/keyboardFretboard.js";
import {
  renderIntervals,
  renderPlot,
  setHoverPitch,
  updateHoverInfo,
  drawPlotOnCanvas
} from "./ui/plotPanel.js";
import {
  playArpeggioSequence,
  playIntervalSequence,
  previewSelected,
  requestMidiAccess
} from "./ui/midiControls.js";
import {
  bindLensInputHandlers,
  bindLensParamHandlers,
  initLensControls,
  renderLensDrafts,
  renderLensNotices,
  renderLensInputs
} from "./ui/lensLayout.js";
import {
  renderInventory,
  bindInventoryActions,
  bindInventorySearch
} from "./ui/inventoryPanel.js";
import {
  renderDesk,
  removeSelectedDeskItem,
  getDeskPlacementSettings,
  nextDeskStart
} from "./ui/deskPanel.js";
import {
  bindFavoritePromptButtons,
  favoriteKey,
  loadFavorites,
  renderFavorites,
  toggleFavorite
} from "./ui/favoritesPanel.js";
import { icon } from "./ui/icons.js";
import { ensureDefaultSignalFlowSelections } from "./transformerPipeline.js";
import { normalizeLensInstanceGridFields } from "./core/gridNormalization.js";
import { buildLaneRowIndex, findNearestUpstreamLens } from "./core/laneRowRouting.js";
import { assertNumericTree, DraftInvariantError } from "./core/invariants.js";
import {
  findTrackIdForLensInstance,
  getLensIndexInTrack,
  getLensLabelForTrackIndex,
  insertLensAt,
  removeLensFromOrder,
  pickFocusAfterRemoval
} from "./workspace2InspectorUtils.js";

let openLensInputsMenu = null;
let lensInputsMenuListenerBound = false;
let workspaceDockPanels = null;

function closeLensInputsMenu() {
  if (!openLensInputsMenu) return;
  openLensInputsMenu.menu.classList.remove("is-open");
  openLensInputsMenu.root.classList.remove("lens-inputs-open");
  openLensInputsMenu = null;
}

function parseIntervals(text) {
  return text
    .split(/[,\s]+/)
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
}

function getLayoutMode() {
  const raw = localStorage.getItem(storageKeys.layoutMode);
  if (raw === "classic") return "classic";
  if (raw === "workspace2") return "workspace2";
  return "workspace2";
}

function applyLayoutMode(mode) {
  const next = mode === "classic" ? "classic" : "workspace2";
  document.body.classList.toggle("workspace2", next === "workspace2");
  const ws2 = document.getElementById("workspace2Root");
  if (ws2) ws2.hidden = next !== "workspace2";
  const classicRoot = document.getElementById("classicRoot");
  if (classicRoot) {
    classicRoot.hidden = next !== "classic";
  } else {
    const workspaceView = document.getElementById("workspaceView");
    if (workspaceView) workspaceView.hidden = next !== "classic";
    const workspaceToolbar = document.querySelector(".workspace-toolbar");
    if (workspaceToolbar) workspaceToolbar.hidden = next !== "classic";
    const appDock = document.querySelector(".app-dock");
    if (appDock) appDock.hidden = next !== "classic";
  }
  if (next === "workspace2") {
    renderWorkspace2();
  }
}

function initWorkspace2ViewMode() {
  const stored = localStorage.getItem(storageKeys.ws2ViewMode);
  state.ws2ViewMode = stored === "library" ? "library" : "workspace";
}

function initLayoutMode() {
  initWorkspace2ViewMode();
  applyLayoutMode(getLayoutMode());
}

function getWs2ViewMode() {
  return state.ws2ViewMode === "library" ? "library" : "workspace";
}

function setWs2ViewMode(mode) {
  const normalized = mode === "library" ? "library" : "workspace";
  if (state.ws2ViewMode === normalized) return;
  state.ws2ViewMode = normalized;
  localStorage.setItem(storageKeys.ws2ViewMode, normalized);
  renderWorkspace2();
}

function getWorkspace2Els() {
  return {
    root: document.getElementById("workspace2Root"),
    header: document.getElementById("ws2Header"),
    lensInspector: document.getElementById("ws2LensInspector"),
    trackInspector: document.getElementById("ws2TrackInspector"),
    lensBrowser: document.getElementById("ws2LensBrowser"),
    viz: document.getElementById("ws2VizRegion"),
    drafts: document.getElementById("ws2DraftRegion"),
    tracks: document.getElementById("ws2TracksRegion"),
    help: document.getElementById("ws2Help")
  };
}

function isWorkspace2Enabled() {
  return getLayoutMode() === "workspace2";
}

function renderWorkspace2ViewSwitch() {
  const el = document.getElementById("ws2ViewSwitch");
  if (!el) return;
  const mode = getWs2ViewMode();
  el.innerHTML = "";
  const workspaceBtn = document.createElement("button");
  workspaceBtn.type = "button";
  workspaceBtn.classList.add("ws2-view-switch-btn");
  workspaceBtn.classList.toggle("ghost", mode !== "workspace");
  workspaceBtn.textContent = "Workspace";
  workspaceBtn.addEventListener("click", () => setWs2ViewMode("workspace"));
  const libraryBtn = document.createElement("button");
  libraryBtn.type = "button";
  libraryBtn.classList.add("ws2-view-switch-btn");
  libraryBtn.classList.toggle("ghost", mode !== "library");
  libraryBtn.textContent = "Library";
  libraryBtn.addEventListener("click", () => setWs2ViewMode("library"));
  el.appendChild(workspaceBtn);
  el.appendChild(libraryBtn);
}

function renderWorkspace2LibraryView() {
  const invMount = document.getElementById("ws2InventoryMount");
  const deskMount = document.getElementById("ws2DeskMount");
  if (!invMount || !deskMount) return;
  const inventoryPanel = workspaceDockPanels?.inventoryPanel || document.querySelector(".inventory-panel");
  const deskPanel = workspaceDockPanels?.deskPanel || document.querySelector(".desk-panel");
  if (inventoryPanel) {
    invMount.innerHTML = "";
    invMount.appendChild(inventoryPanel);
  }
  if (deskPanel) {
    deskMount.innerHTML = "";
    deskMount.appendChild(deskPanel);
  }
  renderInventory();
  renderDesk();
}

function applyWorkspace2ViewVisibility(mode) {
  const workspaceView = document.getElementById("ws2ViewWorkspace");
  const libraryView = document.getElementById("ws2ViewLibrary");
  if (workspaceView) workspaceView.hidden = mode !== "workspace";
  if (libraryView) libraryView.hidden = mode !== "library";
}

function setSelectedTrackId(trackId) {
  state.selectedTrackId = trackId || null;
}

function getSelectedTrack() {
  const id = state.selectedTrackId;
  return id ? getTrackById(id) : null;
}



const placementParamRegistry = {
  v1: [],
  v2: [
    {
      id: "anchorAlpha",
      label: "Anchor alpha (0..1)",
      min: 0,
      max: 1,
      step: 0.05,
      kind: "float",
      help: "Blends between equal index spacing and prefix-weighted spacing. Higher alpha pulls centers toward the prefix-weighted layout. It affects only v2 placement before quantization."
    },
    {
      id: "anchorBeta",
      label: "Anchor beta (>=0)",
      min: 0,
      step: 0.1,
      kind: "float",
      help: "Exponent applied to slack when building prefix weights. Higher beta makes large-slack intervals dominate the placement. It affects only v2 placement before quantization."
    },
    {
      id: "anchorRho",
      label: "Anchor rho (0..1)",
      min: 0,
      max: 1,
      step: 0.05,
      kind: "float",
      help: "Orientation parameter that splits each interval around its center. It affects the continuous endpoint position and the quantized split. Downstream scoring always uses the quantized endpoints."
    }
  ],
  prefixDominance: [
    {
      id: "anchorAlpha",
      label: "Dominance alpha (reserved)",
      min: 0,
      max: 1,
      step: 0.05,
      kind: "float",
      help: "Reserved for future blends in the prefix-dominance engine. Current implementation uses beta and rho only."
    },
    {
      id: "anchorBeta",
      label: "Dominance beta (>=0)",
      min: 0,
      step: 0.1,
      kind: "float",
      help: "Exponent applied to interval length when building prefix dominance weights. Higher beta makes large intervals dominate earlier."
    },
    {
      id: "anchorRho",
      label: "Dominance rho (0..1)",
      min: 0,
      max: 1,
      step: 0.05,
      kind: "float",
      help: "Orientation parameter that defines the shared feasible anchor band for the dominance engine. Downstream scoring always uses the quantized endpoints."
    }
  ],
  repulse: [
    {
      id: "anchorRho",
      label: "Anchor rho (0..1)",
      min: 0,
      max: 1,
      step: 0.05,
      kind: "float",
      help: "Orientation parameter that splits each interval around its center. It affects the continuous endpoint position and the quantized split. Downstream scoring always uses the quantized endpoints."
    },
    {
      id: "repulseGamma",
      label: "Repulse gamma (>=0)",
      min: 0,
      step: 0.1,
      kind: "float",
      help: "Exponent that scales how interval size affects personal space. Higher gamma gives large intervals stronger repulsion. It only affects the Delta target for center separation."
    },
    {
      id: "repulseKappa",
      label: "Repulse kappa (>0)",
      min: 0,
      step: 0.05,
      kind: "float",
      help: "Dimensionless scale for desired center separation. It multiplies the normalized radii sum to form Delta. Larger kappa pushes centers farther apart."
    },
    {
      id: "repulseLambda",
      label: "Repulse lambda (>=0)",
      min: 0,
      step: 0.05,
      kind: "float",
      help: "Strength of the repulsion penalty in the solver. Higher lambda reduces violations faster per iteration. It does not change the feasible bounds."
    },
    {
      id: "repulseEta",
      label: "Repulse eta (>0)",
      min: 0,
      step: 0.01,
      kind: "float",
      help: "Step size for each iteration update. Larger eta moves centers more per step, which can converge faster or overshoot. It is applied after forces are accumulated."
    },
    {
      id: "repulseIterations",
      label: "Repulse iterations",
      min: 1,
      step: 1,
      kind: "int",
      help: "Number of projected solver steps to run. More iterations give repulsion more time to settle. This affects performance linearly."
    },
    {
      id: "repulseAlpha",
      label: "Repulse alpha (0..1)",
      min: 0,
      max: 1,
      step: 0.05,
      kind: "float",
      help: "Blend between neutral centers and fully repelled centers. 0 uses the neutral spacing, 1 uses the repelled result. It is applied after the solver iterations."
    }
  ]
};

const midiParamRegistry = [
  {
    id: "midiTailMs",
    label: "MIDI tail (ms)",
    min: 0,
    step: 50,
    kind: "int",
    help: "Extra ring-out time added after the last note-on in sequences. This keeps notes sustaining before a final note-off. It applies to the b/n playback modes."
  }
];

const placementParamDefs = Object.values(placementParamRegistry).flat();
const placementParamIds = Array.from(new Set(placementParamDefs.map((def) => def.id)));
const midiParamIds = midiParamRegistry.map((def) => def.id);

function renderPlacementParams(mode) {
  const container = els.placementParams;
  if (!container) return;
  container.innerHTML = "";
  const defs = placementParamRegistry[mode] || [];
  defs.forEach((def) => {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.setAttribute("for", def.id);
    label.textContent = def.label;
    if (def.help) {
      label.title = def.help;
    }
    const input = document.createElement("input");
    input.type = "number";
    input.id = def.id;
    if (typeof def.min === "number") input.min = def.min.toString();
    if (typeof def.max === "number") input.max = def.max.toString();
    if (typeof def.step === "number") input.step = def.step.toString();
    if (def.help) {
      input.title = def.help;
    }
    const stored = localStorage.getItem(storageKeys[def.id] || "");
    const fallback = defaultParams[def.id];
    input.value = stored !== null ? stored : (fallback !== undefined ? `${fallback}` : "");
    field.appendChild(label);
    field.appendChild(input);
    container.appendChild(field);
  });
  bindPlacementParamListeners();
}

function renderMidiParams() {
  const container = els.midiParams;
  if (!container) return;
  container.innerHTML = "";
  midiParamRegistry.forEach((def) => {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.setAttribute("for", def.id);
    label.textContent = def.label;
    if (def.help) label.title = def.help;
    const input = document.createElement("input");
    input.type = "number";
    input.id = def.id;
    if (typeof def.min === "number") input.min = def.min.toString();
    if (typeof def.max === "number") input.max = def.max.toString();
    if (typeof def.step === "number") input.step = def.step.toString();
    if (def.help) input.title = def.help;
    input.value = `${getMidiParamValue(def.id)}`;
    const handle = () => handleGlobalMidiParamInput(def, input);
    input.addEventListener("input", handle);
    input.addEventListener("change", handle);
    field.appendChild(label);
    field.appendChild(input);
    container.appendChild(field);
  });
}

function getMidiParamValue(id) {
  const stored = state.params && state.params[id];
  if (Number.isFinite(stored)) return stored;
  const def = midiParamRegistry.find((entry) => entry.id === id);
  if (def && Number.isFinite(def.default)) {
    return def.default;
  }
  return 0;
}

function applyGlobalMidiParamsToInstance(instance) {
  if (!instance || !instance.lens || instance.lens.meta.id !== "intervalPlacement") return;
  midiParamRegistry.forEach((def) => {
    const value = getMidiParamValue(def.id);
    if (Number.isFinite(value)) {
      instance.paramsValues[def.id] = value;
    }
  });
}

function applyGlobalMidiParamsToAllInstances(paramId, value) {
  lensInstances.forEach((instance) => {
    if (!instance || !instance.lens || instance.lens.meta.id !== "intervalPlacement") return;
    instance.paramsValues[paramId] = value;
  });
}

function handleGlobalMidiParamInput(def, input) {
  const next = Number(input.value);
  if (!Number.isFinite(next)) return;
  const clamped = typeof def.min === "number" ? Math.max(def.min, next) : next;
  input.value = `${clamped}`;
  if (state.params[def.id] === clamped) return;
  state.params[def.id] = clamped;
  if (storageKeys[def.id]) {
    localStorage.setItem(storageKeys[def.id], `${clamped}`);
  }
  applyGlobalMidiParamsToAllInstances(def.id, clamped);
  scheduleRecompute();
}

function bindPlacementParamListeners() {
  const container = els.placementParams;
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll("input"));
  inputs.forEach((input) => {
    input.addEventListener("input", scheduleRecompute);
    input.addEventListener("change", scheduleRecompute);
  });
}

function readPlacementParam(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const raw = el.value;
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function readPlacementParamInt(id, fallback, min) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const num = parseInt(el.value, 10);
  if (!Number.isFinite(num)) return fallback;
  if (typeof min === "number") return Math.max(min, num);
  return num;
}









function renderOddBiasToggles(intervals) {
  els.oddBias.innerHTML = "";
  state.oddBias = intervals.map(() => "down");
  const preset = state.pendingOddBias;
  if (Array.isArray(preset) && preset.length === intervals.length) {
    state.oddBias = preset.slice();
  }
  const stored = localStorage.getItem(storageKeys.oddBias);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (!preset && Array.isArray(parsed) && parsed.length === intervals.length) {
        state.oddBias = parsed;
      }
    } catch {
      state.oddBias = intervals.map(() => "down");
    }
  }
  state.pendingOddBias = null;
  intervals.forEach((val, idx) => {
    const btn = document.createElement("button");
    const isOdd = val % 2 === 1;
    btn.className = "odd-toggle";
    btn.type = "button";
    btn.textContent = `col ${idx + 1}: ${isOdd ? state.oddBias[idx] : "even"}`;
    if (!isOdd) {
      btn.classList.add("disabled");
    } else if (state.oddBias[idx] === "up") {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      if (!isOdd) return;
      state.oddBias[idx] = state.oddBias[idx] === "down" ? "up" : "down";
      localStorage.setItem(storageKeys.oddBias, JSON.stringify(state.oddBias));
      renderOddBiasToggles(intervals);
      recompute();
    });
    els.oddBias.appendChild(btn);
  });
}

function buildTabs(Os) {
  els.tabBar.innerHTML = "";
  if (!Os.length || Os.length === 1) {
    els.tabBar.classList.add("is-hidden");
  } else {
    els.tabBar.classList.remove("is-hidden");
  }
  Os.forEach((O) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (O === state.activeO ? " active" : "");
    btn.textContent = `O=${O}`;
    btn.addEventListener("click", () => {
      state.activeO = O;
      state.selected = null;
      render();
    });
    els.tabBar.appendChild(btn);
  });
}

function updateTable() {
  const tbody = els.resultsTable.querySelector("tbody");
  tbody.innerHTML = "";
  const filterText = els.filter.value.trim().toLowerCase();
  const rows = state.resultsByO[state.activeO] || [];

  rows.forEach((rec, idx) => {
    const permStr = rec.perm.join(" ");
    const pitchStr = rec.pitches.join(" ");
    const match = permStr.includes(filterText) || pitchStr.includes(filterText);
    if (filterText && !match) return;

    const tr = document.createElement("tr");
    if (state.selected && state.selected.perm.join(" ") === permStr) {
      tr.classList.add("selected");
    }
    const favKey = favoriteKey(rec);
    const isFav = state.favorites.some((f) => {
      if (f.key === favKey) return true;
      const permMatch = Array.isArray(f.perm) && f.perm.join(" ") === permStr;
      const pitchMatch = Array.isArray(f.pitches) && f.pitches.join(" ") === pitchStr;
      return permMatch && pitchMatch;
    });
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${permStr}</td>
      <td>${pitchStr}</td>
      <td class="fav-cell"><button class="fav-btn ${isFav ? "active" : ""}" data-key="${favKey}">★</button></td>
      <td>${rec.total.toFixed(6)}</td>
      <td>${rec.perPair.toFixed(6)}</td>
    `;
    tr.addEventListener("click", () => {
      state.selected = rec;
      localStorage.setItem(storageKeys.selectedPerm, rec.perm.join(" "));
      render();
    });
    const favBtn = tr.querySelector(".fav-btn");
    favBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(rec, capturePlacementParamValues);
      renderFavorites(getFavoritesDeps());
      updateTable();
    });
    tbody.appendChild(tr);
  });
}

function updateMeta() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) {
    els.selectedInfo.textContent = "";
    els.hoverInfo.textContent = "";
    if (els.anchorMath) els.anchorMath.textContent = "";
    return;
  }
  const O = state.activeO;
  const L = O * state.params.edoSteps;
  const recs = state.resultsByO[state.activeO] || [];
  const rankIndex = recs.findIndex((r) => r === rec);
  const rankText = rankIndex >= 0 ? `${rankIndex + 1} / ${recs.length}` : "—";
  const slacks = rec.perm.map((d) => L - d);
  const minSlack = Math.min(...slacks);
  const maxSlack = Math.max(...slacks);
  const slackRatio = minSlack > 0 ? (maxSlack / minSlack) : Number.POSITIVE_INFINITY;
  const pitchCount = rec.pitches.length;
  const engineLabel = engineLabelForId(rec.engine);
  const centerMinDist = rec.centerDiagnostics ? rec.centerDiagnostics.minDistance : null;
  const centerEnergy = rec.centerDiagnostics ? rec.centerDiagnostics.energy : null;
  const centerViolations = rec.centerDiagnostics && rec.centerDiagnostics.violations
    ? rec.centerDiagnostics.violations.length
    : 0;
  // Anchor debug for visibility into the parametric placement math.
  const anchorRange = rec.anchorRange
    ? `anchor range: [${rec.anchorRange.amin}, ${rec.anchorRange.amax}]`
    : "";
  els.selectedInfo.innerHTML = [
    `<div class="meta-line perm-line">perm: ${rec.perm.join(" ")}</div>`,
    engineLabel ? `<div class="meta-line">engine: ${engineLabel}</div>` : "",
    `<div class="meta-line">rank: ${rankText}</div>`,
    `<div class="meta-line grid"><span class="label">pitches</span><span class="pitch-grid" style="--pitch-count:${pitchCount}">${renderPitches(rec.pitches)}</span></div>`,
    `<div class="meta-line grid"><span class="label">pitch names</span><span class="pitch-grid" style="--pitch-count:${pitchCount}">${renderPitchNames(rec.pitches)}</span></div>`,
    `<div class="meta-line grid"><span class="label">pitch pcs</span><span class="pitch-grid" style="--pitch-count:${pitchCount}">${renderPitchPcSup(rec.pitches)}</span></div>`,
    `<div class="meta-line metric-block"><div class="metric-label">intervals</div><div class="metric-values">${renderIntervals(rec.induced, L, state.params.edoSteps, rec.iv)}</div></div>`,
    `<div class="meta-line" id="hoverCountsLine">hover counts: —</div>`,
    `<div class="meta-line">prime: ${rec.primeForm.join(" ")}</div>`,
    `<div class="meta-line">tension: ${rec.total.toFixed(6)}</div>`,
    `<div class="meta-line">per pair: ${rec.perPair.toFixed(6)}</div>`,
    `<div class="meta-line">slack ratio: ${Number.isFinite(slackRatio) ? slackRatio.toFixed(3) : "inf"}</div>`,
    Number.isFinite(centerMinDist) ? `<div class="meta-line">center min dist: ${centerMinDist.toFixed(3)}</div>` : "",
    Number.isFinite(centerEnergy) ? `<div class="meta-line">center energy: ${centerEnergy.toFixed(3)}</div>` : "",
    centerViolations ? `<div class="meta-line">center violations: ${centerViolations}</div>` : "",
    anchorRange ? `<div class="meta-line">${anchorRange}</div>` : ""
  ].join("");

  void O;
  updateHoverInfo();
  updateAnchorMath(rec);
}









function formatNumber(value, digits) {
  if (!Number.isFinite(value)) return "";
  if (digits === 0) return `${Math.round(value)}`;
  return value.toFixed(digits);
}

function placementDebugData(rec) {
  if (!rec || !rec.perm || !rec.perm.length) return null;
  const flags = rec.debugFlags || {};
  const hasBounds = flags.showBounds && rec.centerBounds && rec.centerBounds.length === rec.perm.length;
  const hasSplits = flags.showSplits && rec.splits && rec.splits.length === rec.perm.length;
  const hasEndpointsFloat = flags.showEndpointsFloat
    && rec.endpointsFloat
    && rec.endpointsFloat.length === rec.perm.length;
  const hasWeights = flags.showWeights
    && rec.weights
    && rec.prefixFractions
    && rec.prefixSums
    && rec.totalWeight;
  const columns = [
    { key: "col", label: "col", format: (v) => v },
    { key: "d", label: "d", format: (v) => v }
  ];
  if (hasBounds || rec.anchorRange) {
    columns.push(
      { key: "cmin", label: "cmin", format: (v) => formatNumber(v, 2) },
      { key: "cmax", label: "cmax", format: (v) => formatNumber(v, 2) }
    );
  }
  columns.push({ key: "c", label: "c*", format: (v) => formatNumber(v, 2) });
  if (hasEndpointsFloat) {
    columns.push(
      { key: "lowStar", label: "low*", format: (v) => formatNumber(v, 2) },
      { key: "highStar", label: "high*", format: (v) => formatNumber(v, 2) }
    );
  }
  if (hasSplits) {
    columns.push(
      { key: "down", label: "down", format: (v) => formatNumber(v, 0) },
      { key: "up", label: "up", format: (v) => formatNumber(v, 0) }
    );
  }
  columns.push(
    { key: "low", label: "low", format: (v) => formatNumber(v, 0) },
    { key: "high", label: "high", format: (v) => formatNumber(v, 0) }
  );
  const metrics = hasWeights ? anchorMetricsFromRecord(rec) : null;
  const showSlack = metrics && metrics.slackLabel;
  if (hasWeights) {
    if (showSlack) {
      columns.push({ key: "slack", label: metrics.slackLabel, format: (v) => formatNumber(v, 0) });
    }
    columns.push(
      { key: "weight", label: "w", format: (v) => formatNumber(v, 2) },
      { key: "prefix", label: "u (P/W)", format: (v) => v }
    );
  }
  const rows = rec.perm.map((d, idx) => {
    const bounds = hasBounds ? rec.centerBounds[idx] : null;
    const range = rec.anchorRange || null;
    const cmin = bounds ? bounds.min : (range ? range.amin : null);
    const cmax = bounds ? bounds.max : (range ? range.amax : null);
    const center = rec.centers
      ? rec.centers[idx]
      : (rec.anchorFloats ? rec.anchorFloats[idx] : rec.anchors[idx]);
    const [lowStar, highStar] = hasEndpointsFloat
      ? rec.endpointsFloat[idx]
      : rec.endpoints[idx];
    const [low, high] = rec.endpoints[idx];
    const split = hasSplits ? rec.splits[idx] : null;
    let prefix = "";
    if (metrics) {
      prefix = `${metrics.prefixSums[idx].toFixed(2)}/${metrics.totalWeight.toFixed(2)}`;
    }
    return {
      col: idx + 1,
      d,
      cmin,
      cmax,
      c: center,
      lowStar,
      highStar,
      down: split ? split.down : null,
      up: split ? split.up : null,
      low,
      high,
      slack: showSlack ? metrics.slack[idx] : null,
      weight: metrics ? metrics.weights[idx] : null,
      prefix
    };
  });
  return { columns, rows };
}

function renderAnchorDebugLines(rec) {
  const data = placementDebugData(rec);
  if (!data) return [];
  return data.rows.map((row) => {
    const parts = data.columns
      .map((col) => {
        const value = col.format(row[col.key]);
        return value === "" ? null : `${col.label}=${value}`;
      })
      .filter(Boolean);
    return `<div class="meta-line small">${parts.join(" ")}</div>`;
  });
}

function anchorMetricsFromRecord(rec) {
  if (rec.weights && rec.prefixFractions && rec.prefixSums && rec.totalWeight) {
    const slack = Array.isArray(rec.slack) ? rec.slack : null;
    return {
      slack,
      slackLabel: slack ? "s" : null,
      weights: rec.weights,
      prefixSums: rec.prefixSums,
      prefixFractions: rec.prefixFractions,
      totalWeight: rec.totalWeight
    };
  }
  const L = state.activeO * state.params.edoSteps;
  const slack = rec.perm.map((d) => L - d);
  const weights = slack.map((s) => Math.pow(s, state.params.anchorBeta));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  let prefix = 0;
  const prefixSums = [];
  const prefixFractions = weights.map((w) => {
    const u = prefix / totalWeight;
    prefixSums.push(prefix);
    prefix += w;
    return u;
  });
  return { slack, slackLabel: "s", weights, prefixSums, prefixFractions, totalWeight };
}

function updateAnchorMath(rec) {
  if (!els.anchorMath) return;
  const data = placementDebugData(rec);
  if (!data) {
    els.anchorMath.textContent = "No placement data.";
    return;
  }
  const rangeLine = rec.anchorRange
    ? `<div class="meta-line">Amin=${rec.anchorRange.amin.toFixed(2)} Amax=${rec.anchorRange.amax.toFixed(2)}</div>`
    : "";
  const headers = data.columns.map((col) => `<th>${col.label}</th>`).join("");
  const rows = data.rows
    .map((row) => {
      const cells = data.columns
        .map((col) => {
          const value = col.format(row[col.key]);
          return `<td>${value}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  els.anchorMath.innerHTML = `
    ${rangeLine}
    <table class="anchor-table">
      <thead>
        <tr>${headers}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderPitchNames(pitches) {
  if (state.params.edoSteps !== 12) {
    return pitches.map((p) => `<span class="pitch-name" data-pitch="${p}">step${p}</span>`).join("");
  }
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const baseNote = parseInt(state.params.baseNote, 10) || 0;
  const baseOctave = Number.isFinite(state.params.baseOctave) ? state.params.baseOctave : 4;
  const baseMidi = (baseOctave + 1) * 12 + baseNote;
  return pitches
    .map((p) => {
      const midi = baseMidi + p;
      const note = noteNames[((midi % 12) + 12) % 12];
      const octave = Math.floor(midi / 12) - 1;
      return `<span class="pitch-name" data-pitch="${p}">${note}${octave}</span>`;
    })
    .join("");
}

function renderPitchPcSup(pitches) {
  const N = state.params.edoSteps;
  return pitches
    .map((p) => {
      const pc = ((p % N) + N) % N;
      const octs = Math.floor(p / N);
      if (octs === 0) {
        return `<span class="pitch-pc" data-pitch="${p}">${pc}</span>`;
      }
      return `<span class="pitch-pc" data-pitch="${p}">${pc}<sup>+${octs}</sup></span>`;
    })
    .join("");
}

function renderPitches(pitches) {
  return pitches
    .map((p) => `<span class="pitch-item" data-pitch="${p}">${p}</span>`)
    .join("");
}



















function render() {
  buildTabs(Object.keys(state.resultsByO).map(Number));
  updateTable();
  renderPlot();
  updateMeta();
  updateHoverInfo();
  renderKeyboard();
  renderFretboard();
  renderFavorites(getFavoritesDeps());
  renderInventory();
  renderDesk();
  const rec = (state.resultsByO[state.activeO] || [])[0];
  if (rec) {
    els.anchorSummary.textContent = `anchors: ${rec.anchors.join(" ")}`;
  } else {
    els.anchorSummary.textContent = "";
  }
}

function recompute() {
  const instance = getFocusedIntervalPlacementInstance();
  if (instance) {
    scheduleLens(instance);
  }
}

function saveInputs() {
  if (els.guitarTuning) {
    localStorage.setItem(storageKeys.guitarTuning, els.guitarTuning.value);
  }
  if (els.deskGridStep) {
    localStorage.setItem(storageKeys.deskGridStep, els.deskGridStep.value);
  }
}

function loadInputs() {
  const storedTuning = localStorage.getItem(storageKeys.guitarTuning);
  if (storedTuning && els.guitarTuning) els.guitarTuning.value = storedTuning;
  const storedDeskGrid = localStorage.getItem(storageKeys.deskGridStep);
  if (storedDeskGrid && els.deskGridStep) {
    els.deskGridStep.value = storedDeskGrid;
  }
  const storedFilter = localStorage.getItem(storageKeys.filter);
  if (storedFilter) els.filter.value = storedFilter;
  const storedInventoryFilter = localStorage.getItem(storageKeys.inventoryFilter);
  if (storedInventoryFilter && els.inventorySearch) {
    els.inventorySearch.value = storedInventoryFilter;
    state.inventoryFilter = storedInventoryFilter;
  }
  midiParamRegistry.forEach((def) => {
    const stored = localStorage.getItem(storageKeys[def.id]);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) {
        state.params[def.id] = parsed;
      }
    }
  });
}





function capturePlacementParamValues() {
  const instance = getFocusedIntervalPlacementInstance();
  if (!instance) return {};
  return { ...instance.paramsValues };
}

function updateControlValue(key, value) {
  const el = document.getElementById(key);
  if (!el) return;
  if (el.type === "checkbox") {
    el.checked = Boolean(value);
    return;
  }
  if (Array.isArray(value)) {
    el.value = value.join(", ");
    return;
  }
  el.value = value ?? "";
}

function applyIntervalPlacementSnapshot(snapshot) {
  const instance = getFocusedIntervalPlacementInstance();
  if (!instance) return;
  const lens = instance.lens;
  if (Array.isArray(snapshot.intervals)) {
    instance.generatorInputValues.intervals = snapshot.intervals.slice();
  }
  if (snapshot.windowOctaves !== undefined) {
    instance.generatorInputValues.windowOctaves = snapshot.windowOctaves;
  }
  if (Array.isArray(snapshot.oddBias)) {
    instance.generatorInputValues.oddBias = snapshot.oddBias.slice();
  }
  const paramValues = snapshot.placementParams || {};
  Object.entries(paramValues).forEach(([key, value]) => {
    instance.paramsValues[key] = value;
  });
  (lens.generatorInputs || []).forEach((spec) => {
    updateControlValue(spec.key, instance.generatorInputValues[spec.key]);
    storeLensSpecValue(lens.meta.id, "inputs", spec.key, instance.generatorInputValues[spec.key]);
  });
  (lens.params || []).forEach((spec) => {
    updateControlValue(spec.key, instance.paramsValues[spec.key]);
    storeLensSpecValue(lens.meta.id, "params", spec.key, instance.paramsValues[spec.key]);
  });
  scheduleLens(instance);
  renderTrackWorkspace();
}

function applyIntervalsOnly(snapshot) {
  const instance = getFocusedIntervalPlacementInstance();
  if (!instance) return;
  if (!Array.isArray(snapshot.intervals)) return;
  instance.generatorInputValues.intervals = snapshot.intervals.slice();
  updateControlValue("intervals", instance.generatorInputValues.intervals);
  storeLensSpecValue("intervalPlacement", "inputs", "intervals", instance.generatorInputValues.intervals);
  scheduleLens(instance);
  renderTrackWorkspace();
}

function getFavoritesDeps() {
  return {
    capturePlacementParamValues,
    render,
    applyLensSnapshot: applyIntervalPlacementSnapshot,
    applyIntervalsOnly,
    saveInputs
  };
}

function applyLensMode(activeLenses) {
  document.querySelectorAll("[data-lens-scope]").forEach((el) => {
    const scope = el.getAttribute("data-lens-scope");
    const visible = scope === "shared" || (activeLenses && activeLenses.has(scope));
    el.classList.toggle("lens-hidden", !visible);
  });
}

function initLensMode() {
  const buttons = Array.from(document.querySelectorAll(".lens-btn[data-lens]"));
  if (!buttons.length) return;
  const allLensIds = buttons.map((btn) => btn.dataset.lens).filter(Boolean);
  let active = null;
  const stored = localStorage.getItem(storageKeys.lensMode);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        active = new Set(parsed.filter(Boolean));
      }
    } catch {
      active = null;
    }
  }
  if (!active || active.size === 0) {
    active = new Set(["intervalPlacement"]);
  }
  applyLensMode(active);
  buttons.forEach((btn) => {
    const lens = btn.dataset.lens;
    const isActive = active.has(lens);
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("ghost", !isActive);
    btn.addEventListener("click", () => {
      const key = btn.dataset.lens;
      if (!key) return;
      if (active.has(key)) {
        active.delete(key);
      } else {
        active.add(key);
      }
      localStorage.setItem(storageKeys.lensMode, JSON.stringify(Array.from(active)));
      applyLensMode(active);
      buttons.forEach((item) => {
        const on = active.has(item.dataset.lens);
        item.classList.toggle("active", on);
        item.classList.toggle("ghost", !on);
      });
    });
  });
  if (els.lensShowAllBtn) {
    els.lensShowAllBtn.addEventListener("click", () => {
      active = new Set(allLensIds);
      localStorage.setItem(storageKeys.lensMode, JSON.stringify(Array.from(active)));
      applyLensMode(active);
      buttons.forEach((item) => {
        const on = active.has(item.dataset.lens);
        item.classList.toggle("active", on);
        item.classList.toggle("ghost", !on);
      });
    });
  }
  if (els.lensHideAllBtn) {
    els.lensHideAllBtn.addEventListener("click", () => {
      active = new Set();
      localStorage.setItem(storageKeys.lensMode, JSON.stringify([]));
      applyLensMode(active);
      buttons.forEach((item) => {
        const on = active.has(item.dataset.lens);
        item.classList.toggle("active", on);
        item.classList.toggle("ghost", !on);
      });
    });
  }
}

function bindLensNavScroll() {
  const scrollEl = document.querySelector(".app-scroll");
  if (!scrollEl) return;
  const links = Array.from(document.querySelectorAll("[data-scroll-target]"));
  if (!links.length) return;
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.dataset.scrollTarget;
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      event.preventDefault();
      const scrollRect = scrollEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - scrollRect.top + scrollEl.scrollTop - 16;
      scrollEl.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    });
  });
}

const lensInstances = new Map();
const lensElements = new Map();
const dashboardLensElements = new Map();
const focusedLensInstances = new Map();
const intervalPlacementVisualizers = new Map();
const workspace2IntervalPlacementVisualizers = new Map();
let visualizerPopoutOverlay = null;
let trackMenuOutsideHandler = null;

function ensureVisualizerPopoutOverlay() {
  if (visualizerPopoutOverlay) return visualizerPopoutOverlay;
  const overlay = document.getElementById("visualizerPopout");
  if (!overlay) return null;
  const closeBtn = overlay.querySelector(".popout-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("is-open");
      document.body.classList.remove("visualizer-popout-open");
    });
  }
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.classList.remove("is-open");
      document.body.classList.remove("visualizer-popout-open");
    }
  });
  visualizerPopoutOverlay = overlay;
  return overlay;
}
function getTrackById(trackId) {
  return getOrderedTracks().find((track) => track.id === trackId) || null;
}

function getWorkspace2UpstreamLensInstance(instance) {
  if (!instance || !instance.trackId) return null;
  const index = buildLaneRowIndex({
    tracks: getOrderedTracks(),
    lensInstancesById: lensInstances
  });
  const laneId = instance.trackId;
  if (!laneId) return null;
  const targetRow = Number.isFinite(instance.row)
    ? instance.row
    : Number.MAX_SAFE_INTEGER;
  const upstreamLensInstanceId = findNearestUpstreamLens({
    index,
    sourceLaneId: laneId,
    targetRow
  });
  if (!upstreamLensInstanceId) return null;
  return lensInstances.get(upstreamLensInstanceId) || null;
}

function getUpstreamLensInstance(instance) {
  if (isWorkspace2Enabled()) {
    return getWorkspace2UpstreamLensInstance(instance);
  }
  if (!instance || !instance.trackId) return null;
  const track = getTrackById(instance.trackId);
  if (!track) return null;
  const ordered = ensureTrackLensOrder(track);
  const targetPath = Array.isArray(instance.path) ? instance.path : [];
  let previousSibling = null;
  for (const lensId of ordered) {
    const candidate = lensInstances.get(lensId);
    if (!candidate) continue;
    const candidatePath = Array.isArray(candidate.path) ? candidate.path : [];
    if (!hasSameParentPath(candidatePath, targetPath)) continue;
    if (candidate.lensInstanceId === instance.lensInstanceId) {
      return previousSibling;
    }
    previousSibling = candidate;
  }
  return null;
}

function ws2SetDraggingUI(active) {
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("ws2-dragging", !!active);
  }
}

function beginWs2BrowserDrag(lensId) {
  state.ws2Drag = { active: true, lensId };
  ws2SetDraggingUI(true);
}

function ws2ClearSlotHover() {
  document.querySelectorAll(".ws2-drop-slot.is-over").forEach((el) => el.classList.remove("is-over"));
  document.querySelectorAll(".ws2-lane.is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
}

function endWs2BrowserDrag({ render = true } = {}) {
  state.ws2Drag = { active: false, lensId: null };
  ws2SetDraggingUI(false);
  ws2ClearSlotHover();
  if (render) {
    renderWorkspace2();
  }
}

function ws2GetDraggedLensId(event) {
  if (!event || !event.dataTransfer) return state.ws2Drag?.lensId || null;
  return (
    event.dataTransfer.getData("application/x-lens-type") ||
    event.dataTransfer.getData("text/plain") ||
    state.ws2Drag?.lensId ||
    null
  );
}

function ws2SetSlotHover(slotEl, isOver) {
  if (!slotEl) return;
  slotEl.classList.toggle("is-over", !!isOver);
  const lane = slotEl.closest(".ws2-lane");
  if (lane) {
    lane.classList.toggle("is-drop-target", !!isOver);
  }
}

function onSlotDragEnter(event) {
  const lensId = ws2GetDraggedLensId(event);
  if (!lensId) return;
  event.preventDefault();
  ws2SetSlotHover(event.currentTarget, true);
}

function onSlotDragOver(event) {
  const lensId = ws2GetDraggedLensId(event);
  if (!lensId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  const slot = event.currentTarget;
  document.querySelectorAll(".ws2-drop-slot.is-over").forEach((el) => {
    if (el !== slot) el.classList.remove("is-over");
  });
  slot.classList.add("is-over");
}

function onSlotDragLeave(event) {
  ws2SetSlotHover(event.currentTarget, false);
}

function onSlotDrop(event) {
  const lensId = ws2GetDraggedLensId(event);
  if (!lensId) return;
  event.preventDefault();
  const slot = event.currentTarget;
  const trackId = slot.dataset.trackId || null;
  const insertIndex = Number(slot.dataset.insertIndex);
  ws2ClearSlotHover();
  if (trackId) {
    createLensInstanceForTrack(lensId, trackId, Number.isFinite(insertIndex) ? insertIndex : undefined);
  }
  endWs2BrowserDrag({ render: false });
}

function createStableId(prefix) {
  const base = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}_${base}` : base;
}

  function getOrderedTracks() {
    return Array.isArray(state.tracks) ? state.tracks.slice() : [];
  }

  function getLaneIds() {
    return getOrderedTracks()
      .map((track) => track.id)
      .filter((id) => typeof id === "string" && id.length);
  }

function getTrackNumber(trackId) {
  const ordered = getOrderedTracks();
  const index = ordered.findIndex((track) => track.id === trackId);
  return index >= 0 ? index + 1 : 0;
}

function ensureTrackLensOrder(track) {
  if (!track) return [];
  if (!Array.isArray(track.lensInstanceIds)) {
    track.lensInstanceIds = [];
  }
  return track.lensInstanceIds;
}

function getTrackLensPath(track) {
  if (!track) return [];
  return Array.isArray(track.lensInstanceIds) ? track.lensInstanceIds : [];
}

function migrateTrackToLensPath(track) {
  if (!track) return track;
  if (Array.isArray(track.lensInstanceIds) && track.lensInstanceIds.length) {
    return track;
  }
  const legacy = [];
  if (track.generatorInstanceId) legacy.push(track.generatorInstanceId);
  if (Array.isArray(track.transformerInstanceIds)) {
    legacy.push(...track.transformerInstanceIds);
  }
  track.lensInstanceIds = legacy;
  return track;
}

  function updateTrackLensPaths(track) {
    const lensIds = ensureTrackLensOrder(track);
    const laneIds = getLaneIds();
    lensIds.forEach((lensId, index) => {
      const instance = lensInstances.get(lensId);
      if (!instance) return;
      const basePath = Array.isArray(instance.path) ? instance.path.slice(0, -1) : [];
      instance.path = [...basePath, index + 1];
      normalizeLensInstanceGridFields({
        instance,
        track,
        indexInTrack: index,
        lensDefinition: instance.lens || getLens(instance.lensId),
        laneIds
      });
    });
  }

function addLensToTrack(track, lensInstanceId) {
  const ids = ensureTrackLensOrder(track);
  ids.push(lensInstanceId);
  updateTrackLensPaths(track);
}

function removeLensFromTrack(track, lensInstanceId) {
  if (!track) return;
  track.lensInstanceIds = ensureTrackLensOrder(track).filter((id) => id !== lensInstanceId);
  updateTrackLensPaths(track);
}

function getLensPathLabel(instance) {
  if (!instance) return "";
  const trackNumber = getTrackNumber(instance.trackId);
  const path = Array.isArray(instance.path)
    ? instance.path.filter((value) => Number.isFinite(value))
    : [];
  const pathLabel = path.length ? path.join(".") : "?";
  return trackNumber ? `T${trackNumber}.${pathLabel}` : `T?.${pathLabel}`;
}

function getLensHeaderLabel(instance) {
  const pathLabel = getLensPathLabel(instance);
  const name = instance.lens && instance.lens.meta ? instance.lens.meta.name : "Lens";
  return `${pathLabel} · ${name}`;
}

function getParentPath(path) {
  if (!Array.isArray(path) || !path.length) return [];
  return path.slice(0, -1);
}

function hasSameParentPath(pathA, pathB) {
  const parentA = getParentPath(pathA);
  const parentB = getParentPath(pathB);
  if (parentA.length !== parentB.length) return false;
  return parentA.every((value, index) => value === parentB[index]);
}

function comparePathArrays(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const va = Number.isFinite(a[i]) ? a[i] : -1;
    const vb = Number.isFinite(b[i]) ? b[i] : -1;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

function setFocusedLensInstance(lensId, instanceId) {
  if (!lensId || !instanceId) return;
  focusedLensInstances.set(lensId, instanceId);
  if (lensId === "intervalPlacement") {
    state.focusedIntervalPlacementId = instanceId;
  }
}

function setFocusedLensInstanceGlobal(instanceId) {
  if (!instanceId) {
    state.focusedLensInstanceId = null;
    return;
  }
  const inst = lensInstances.get(instanceId);
  if (!inst || !inst.lens || !inst.lens.meta) {
    state.focusedLensInstanceId = null;
    return;
  }
  state.focusedLensInstanceId = instanceId;
  const lensId = inst.lens.meta.id;
  setFocusedLensInstance(lensId, inst.lensInstanceId);
}

function getFocusedLensInstanceId(lensId) {
  return focusedLensInstances.get(lensId) || null;
}

function getFocusedWorkspace2Instance() {
  const globalFocused = state.focusedLensInstanceId ? lensInstances.get(state.focusedLensInstanceId) : null;
  if (globalFocused) return globalFocused;

  const track = getSelectedTrack();
  if (track) {
    const path = getTrackLensPath(track);
    const candidateId = path.length ? path[path.length - 1] : null;
    if (candidateId && lensInstances.has(candidateId)) {
      return lensInstances.get(candidateId);
    }
  }

  const first = Array.from(lensInstances.values())[0] || null;
  return first;
}

function ws2DraftSummaryForInstance(instance, maxLen = 64) {
  if (!instance) return "—";
  const draft = instance.activeDraft || null;
  if (!draft) return "—";
  const summary = draft.summary ? String(draft.summary).trim() : "";
  if (summary) {
    return summary.length <= maxLen ? summary : `${summary.slice(0, maxLen)}…`;
  }
  const values = draft.payload && draft.payload.values;
  if (!values) return "—";
  try {
    if (Array.isArray(values) && values.every((value) => Number.isFinite(value))) {
      return formatNumericList(values, maxLen);
    }
    const text = JSON.stringify(values);
    return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
  } catch {
    return "—";
  }
}

function getLastInstanceIdForTrack(track) {
  const path = getTrackLensPath(track);
  if (!path.length) return null;
  return path[path.length - 1];
}

function getFocusedIntervalPlacementInstance() {
  const focusedId = state.focusedIntervalPlacementId;
  if (!focusedId) return null;
  return lensInstances.get(focusedId) || null;
}

function syncFocusedLensInstances() {
  const availableByLensId = new Map();
  lensInstances.forEach((instance) => {
    const list = availableByLensId.get(instance.lens.meta.id) || [];
    list.push(instance);
    availableByLensId.set(instance.lens.meta.id, list);
  });
  availableByLensId.forEach((instances, lensId) => {
    const currentId = getFocusedLensInstanceId(lensId);
    if (currentId && lensInstances.has(currentId)) return;
    const next = instances[0];
      if (next) setFocusedLensInstance(lensId, next.lensInstanceId);
  });
}

function getRecordForInstance(instance) {
  if (!instance) return null;
  const viz = instance.evaluateResult && instance.evaluateResult.vizModel;
  if (!viz) return null;
  const index = Number.isFinite(instance.activeDraftIndex) ? instance.activeDraftIndex : 0;
  const records = Array.isArray(viz.records) ? viz.records : [];
  return records[index] || null;
}

function updateIntervalPlacementVisual(instance, visual) {
  if (!instance || !visual) return;
  const rec = getRecordForInstance(instance);
  if (!rec) {
    if (visual.canvas) {
      drawPlotOnCanvas(visual.canvas, null, { updateHoverPoints: false });
    }
    if (visual.summary) visual.summary.textContent = "No draft yet.";
    if (visual.selectedInfo) visual.selectedInfo.textContent = "";
    if (visual.hoverInfo) visual.hoverInfo.textContent = "";
    return;
  }
  if (visual.canvas) {
    drawPlotOnCanvas(visual.canvas, rec, { updateHoverPoints: false, targetHeight: 320 });
  }
  const anchors = Array.isArray(rec.anchors) ? rec.anchors : [];
  const perm = Array.isArray(rec.perm) ? rec.perm : [];
  const pitches = Array.isArray(rec.pitches) ? rec.pitches : [];
  if (visual.summary) visual.summary.textContent = `anchors: ${anchors.join(" ")}`;
  if (visual.selectedInfo) visual.selectedInfo.textContent = perm.join(" ");
  if (visual.hoverInfo) visual.hoverInfo.textContent = pitches.join(" ");
}

function renderWorkspaceIntervalPlacementViz(instance) {
  if (!instance) return;
  const visual = intervalPlacementVisualizers.get(instance.lensInstanceId);
  if (!visual) return;
  updateIntervalPlacementVisual(instance, visual);
}

function createTrack(name) {
  const track = {
    id: createStableId("track"),
    name: name || "Untitled track",
    lensInstanceIds: []
  };
  state.tracks.push(track);
  return track;
}

function createLensInstanceForTrack(lensId, trackId, insertIndex = null) {
  const lens = getLens(lensId);
  if (!lens) return null;
  let track = trackId ? getTrackById(trackId) : getSelectedTrack();
  if (!track) {
    const ordered = getOrderedTracks();
    track = ordered[0] || createTrack(`Track ${state.tracks.length + 1}`);
  }
  if (!track) return null;
  const instance = createInstanceForTrack(lens, track.id);
  (lens.generatorInputs || []).forEach((spec) => {
    instance.generatorInputValues[spec.key] = loadLensSpecValue(lens.meta.id, "inputs", spec);
  });
  (lens.params || []).forEach((spec) => {
    instance.paramsValues[spec.key] = loadLensSpecValue(lens.meta.id, "params", spec);
  });
  const currentOrder = ensureTrackLensOrder(track);
  const targetIndex = Number.isFinite(insertIndex)
    ? Math.min(Math.max(insertIndex, 0), currentOrder.length)
    : currentOrder.length;
  track.lensInstanceIds = insertLensAt(currentOrder, targetIndex, instance.lensInstanceId);
  updateTrackLensPaths(track);
  seedLensDefaults(instance);
  scheduleLens(instance);
  ensureDefaultSignalFlowSelections(
    getOrderedTracks(),
    lensInstances,
    scheduleLens,
    { workspace2: isWorkspace2Enabled() }
  );
  track.lensInstanceIds.slice(targetIndex + 1).forEach((instanceId) => {
    const downstream = lensInstances.get(instanceId);
    if (downstream) {
      scheduleLens(downstream);
    }
  });
  setSelectedTrackId(track.id);
  setFocusedLensInstanceGlobal(instance.lensInstanceId);
  renderWorkspace2();
  return instance.lensInstanceId;
}

function createInstanceForTrack(lens, trackId) {
  const instanceId = createStableId("lens");
  const instance = createLensInstance(lens, instanceId);
    instance.lensId = lens.meta.id;
    instance.kind = lens.meta.kind;
    instance.trackId = trackId;
    instance.path = [];
    lensInstances.set(instanceId, instance);
    state.lensInstancesById.set(instanceId, instance);
    applyGlobalMidiParamsToInstance(instance);
    return instance;
  }

  const WORKSPACE_VERSION = 3;

function serializeWorkspace() {
  return {
    version: WORKSPACE_VERSION,
    tracks: getOrderedTracks().map((track) => {
      const path = Array.isArray(track.lensInstanceIds) ? track.lensInstanceIds.slice() : [];
      return {
        id: track.id,
        name: track.name || "Untitled track",
        lensInstanceIds: path,
        generatorInstanceId: path[0] || null,
        transformerInstanceIds: path.length > 1 ? path.slice(1) : []
      };
    }),
    lensInstances: Array.from(lensInstances.values()).map((instance) => ({
      lensInstanceId: instance.lensInstanceId,
      lensId: instance.lens && instance.lens.meta ? instance.lens.meta.id : instance.lensId,
      trackId: instance.trackId || null,
      path: Array.isArray(instance.path) ? instance.path.slice() : [],
        paramsValues: { ...(instance.paramsValues || {}) },
        generatorInputValues: { ...(instance.generatorInputValues || {}) },
        selectedInputLaneByRole: { ...(instance.selectedInputLaneByRole || {}) },
        row: Number.isFinite(instance.row) ? instance.row : null,
        selectedInputRefsByRole: { ...(instance.selectedInputRefsByRole || {}) },
        activeDraftId: instance.activeDraftId || null,
        activeDraftIndex: Number.isFinite(instance.activeDraftIndex)
          ? instance.activeDraftIndex
          : null
    })),
    focus: {
      focusedIntervalPlacementId: state.focusedIntervalPlacementId || null,
      focusedLensInstances: Array.from(focusedLensInstances.entries())
    }
  };
}

  function saveWorkspace() {
    const payload = serializeWorkspace();
    localStorage.setItem(storageKeys.tracks, JSON.stringify(payload));
    if (els.status) {
      els.status.textContent = "Workspace saved.";
    }
  }

  function restoreLensInstance(snapshot) {
    if (!snapshot || (!snapshot.lensInstanceId && !snapshot.id) || !snapshot.lensId) return null;
    const lens = getLens(snapshot.lensId);
    if (!lens) return null;
    const lensInstanceId = snapshot.lensInstanceId || snapshot.id;
    const instance = createLensInstance(lens, lensInstanceId);
    instance.lensId = lens.meta.id;
    instance.kind = lens.meta.kind;
    instance.trackId = snapshot.trackId || null;
    instance.path = Array.isArray(snapshot.path) ? snapshot.path.slice() : [];
    instance.paramsValues = { ...instance.paramsValues, ...(snapshot.paramsValues || {}) };
    instance.generatorInputValues = { ...instance.generatorInputValues, ...(snapshot.generatorInputValues || {}) };
  const legacySelected = snapshot.selectedInputDraftIdsByRole || {};
  const nextSelected = { ...(snapshot.selectedInputRefsByRole || {}) };
  Object.entries(legacySelected).forEach(([role, draftId]) => {
    if (!nextSelected[role] && draftId) {
      nextSelected[role] = { mode: "freeze", sourceDraftId: draftId };
    }
  });
  const laneSelection = snapshot.selectedInputLaneByRole;
  instance.selectedInputLaneByRole =
    laneSelection && typeof laneSelection === "object" ? { ...laneSelection } : {};
  if (Number.isFinite(snapshot.row)) {
    instance.row = Math.max(0, Math.floor(snapshot.row));
  } else {
    instance.row = null;
  }
  instance.selectedInputRefsByRole = nextSelected;
    instance.activeDraftId = snapshot.activeDraftId || null;
    instance.activeDraftIndex = Number.isFinite(snapshot.activeDraftIndex)
      ? snapshot.activeDraftIndex
      : null;
    lensInstances.set(instance.lensInstanceId, instance);
    state.lensInstancesById.set(instance.lensInstanceId, instance);
    applyGlobalMidiParamsToInstance(instance);
    return instance;
  }

function loadWorkspace() {
  const raw = localStorage.getItem(storageKeys.tracks);
  if (!raw) return false;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!parsed || !Array.isArray(parsed.tracks) || !Array.isArray(parsed.lensInstances)) {
    return false;
  }
  state.tracks = parsed.tracks.map((track) => {
    const migrated = migrateTrackToLensPath(track);
    const lensIds = Array.isArray(migrated.lensInstanceIds) ? migrated.lensInstanceIds.slice() : [];
    return {
      id: track.id,
      name: track.name || "Untitled track",
      lensInstanceIds: lensIds
    };
  });
  lensInstances.clear();
  state.lensInstancesById.clear();
  focusedLensInstances.clear();
  state.focusedIntervalPlacementId = null;
  const createdIds = new Set();
  parsed.lensInstances.forEach((snapshot) => {
    const instance = restoreLensInstance(snapshot);
    if (instance) createdIds.add(instance.lensInstanceId);
  });
  state.tracks.forEach((track) => {
    track.lensInstanceIds = (track.lensInstanceIds || []).filter((id) => createdIds.has(id));
    updateTrackLensPaths(track);
  });
  const focus = parsed.focus || {};
  if (Array.isArray(focus.focusedLensInstances)) {
    focus.focusedLensInstances.forEach(([lensId, instanceId]) => {
      if (createdIds.has(instanceId)) {
        focusedLensInstances.set(lensId, instanceId);
      }
    });
  }
  if (focus.focusedIntervalPlacementId && createdIds.has(focus.focusedIntervalPlacementId)) {
    state.focusedIntervalPlacementId = focus.focusedIntervalPlacementId;
  }
  lensInstances.forEach((instance) => scheduleLens(instance));
  return true;
}

function storageKeyForLensSpec(lensId, group, specKey) {
  return `intervalApplet.lens.${lensId}.${group}.${specKey}`;
}

function loadLensSpecValue(lensId, group, spec) {
  const key = storageKeyForLensSpec(lensId, group, spec.key);
  const raw = localStorage.getItem(key);
  if (raw === null) return spec.default;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function storeLensSpecValue(lensId, group, specKey, value) {
  const key = storageKeyForLensSpec(lensId, group, specKey);
  localStorage.setItem(key, JSON.stringify(value));
}

function getLensElements(lensId) {
  const root = document.querySelector(`[data-lens-id="${lensId}"]`);
  if (!root) return null;
  return {
    root,
    inputs: root.querySelector("[data-lens-inputs]"),
    params: root.querySelector("[data-lens-params]"),
    notices: root.querySelector("[data-lens-notices]"),
    drafts: root.querySelector("[data-lens-drafts]"),
    viz: root.querySelector("[data-lens-viz]"),
    popout: root.querySelector("[data-lens-popout]"),
    headerTitle: root.querySelector(".lens-rail span"),
    euclidPreview: root.querySelector("#euclidPreview"),
    euclidCanvas: root.querySelector("#euclidWheel")
  };
}

function setLensElementLabels(instance, elements) {
  if (!elements || !instance) return;
  if (elements.headerTitle) {
    elements.headerTitle.textContent = getLensHeaderLabel(instance);
  }
}

function updateLensVisualizerState(instance, elements, hasVisualizer) {
  if (!elements || !elements.root) return;
  const root = elements.root;
  const supportsViz = Boolean(hasVisualizer);
  root.classList.toggle("lens-has-viz", supportsViz);
  root.classList.toggle("lens-no-viz", !supportsViz);
  if (!supportsViz) {
    instance.vizCollapsed = false;
  }
  const toggle = elements.vizToggle;
  if (toggle) {
    toggle.hidden = !supportsViz;
    if (supportsViz) {
      const collapsed = Boolean(instance.vizCollapsed);
      root.classList.toggle("lens-viz-collapsed", collapsed);
      toggle.textContent = collapsed ? "▶" : "▼";
      toggle.setAttribute("aria-label", collapsed ? "Show visualizer panel" : "Hide visualizer panel");
      toggle.setAttribute("title", collapsed ? "Show visualizer panel" : "Hide visualizer panel");
    } else {
      root.classList.remove("lens-viz-collapsed");
    }
  } else if (!supportsViz) {
    root.classList.remove("lens-viz-collapsed");
  }
}

function getLensContext(instance) {
  return {
    lensId: instance.lens.meta.id,
    lensInstanceId: instance.lensInstanceId,
    timestamp: Date.now()
  };
}

function addDraftToInventory(draft) {
  try {
    assertNumericTree(draft && draft.payload ? draft.payload.values : null, "inventory capture");
  } catch (error) {
    const message = error instanceof DraftInvariantError
      ? error.message
      : (error && error.message ? error.message : "Draft capture failed.");
    if (els.status) {
      els.status.textContent = message;
    }
    return null;
  }
  const name = draft.summary || `${draft.type} draft`;
  const material = inventoryStore.add(draft, { name });
  if (!material) return null;
  state.lastCapturedMaterialId = material.materialId;
  state.selectedInventoryId = material.materialId;
  saveInventory();
  renderInventory();
  return material;
}

function addDraftToDesk(draft) {
  const material = addDraftToInventory(draft);
  if (!material) return null;
  const { lane, duration } = getDeskPlacementSettings();
  const start = nextDeskStart(lane);
  deskStore.add({ materialId: material.materialId, start, duration, laneId: lane });
  saveDesk();
  renderDesk();
  return material;
}

function syncIntervalPlacementState(instance) {
  const viz = instance.evaluateResult && instance.evaluateResult.vizModel;
  if (!viz) {
    state.resultsByO = {};
    state.activeO = null;
    state.selected = null;
    return;
  }
  const O = viz.windowOctaves;
  state.resultsByO = { [O]: viz.records };
  state.activeO = O;
  state.params = { ...viz.params };
  state.oddBias = Array.isArray(viz.oddBias) ? viz.oddBias.slice() : [];
  state.gRef = computeReferenceG(state.params);
    const activeIdx = Number.isFinite(instance.activeDraftIndex)
      ? instance.activeDraftIndex
      : instance.currentDrafts.findIndex((draft) => draft.draftId === instance.activeDraftId);
    if (activeIdx >= 0) {
      state.selected = viz.records[activeIdx] || null;
    }
  if (!state.selected) {
    state.selected = viz.records[0] || null;
  }
}

function formatNumericList(values, maxLength = 128) {
  if (!Array.isArray(values) || !values.length) return "n/a";
  const text = values.map((value) => (Number.isFinite(value) ? value : String(value))).join(", ");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function renderTransformerVisualizer(elements, instance) {
  if (!elements || !elements.viz) return false;
  const container = elements.viz;
  container.innerHTML = "";
  const vizModel = instance.evaluateResult && instance.evaluateResult.vizModel;
  if (!vizModel) {
    const placeholder = document.createElement("div");
    placeholder.className = "lens-viz-placeholder";
    placeholder.textContent = "No preview available.";
    container.appendChild(placeholder);
    return false;
  }
  const title = document.createElement("div");
  title.className = "lens-viz-title";
  title.textContent = vizModel.operationLabel
    ? `Operation: ${vizModel.operationLabel}`
    : "Raw data";
  container.appendChild(title);
  const rows = document.createElement("div");
  rows.className = "lens-viz-rows";
  const appendRow = (label, value) => {
    const row = document.createElement("div");
    row.className = "lens-viz-row";
    const labelEl = document.createElement("span");
    labelEl.className = "lens-viz-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "lens-viz-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    rows.appendChild(row);
  };
  appendRow("Inputs", formatNumericList(vizModel.inputValues));
  appendRow(
    "Operands",
    Array.isArray(vizModel.operands) && vizModel.operands.length
      ? formatNumericList(vizModel.operands)
    : "auto"
  );
  appendRow("Mod", vizModel.modActive ? `${vizModel.modValue}` : "off");
  if (vizModel.sourceName) {
    appendRow("Source", vizModel.sourceName);
  }
  container.appendChild(rows);
  return true;
}

  function handleLensUpdate(instance) {
    const lensId = instance.lens.meta.id;
    const trackElements = lensElements.get(instance.lensInstanceId);
    const focusedId = getFocusedLensInstanceId(lensId);
    const dashboardElements = focusedId === instance.lensInstanceId
      ? dashboardLensElements.get(lensId)
      : null;
  const targets = [trackElements, dashboardElements].filter(Boolean);
  let syncedIntervalPlacement = false;
  const isIntervalPlacement = lensId === "intervalPlacement";

  targets.forEach((elements) => {
    renderLensNotices(elements.notices, instance);
    setLensElementLabels(instance, elements);
    const draftHandlers = {
          onSelect: (draft) => {
            const idx = instance.currentDrafts.findIndex((item) => item.draftId === draft.draftId);
            instance.activeDraftIndex = idx >= 0 ? idx : null;
            instance.activeDraftId = draft.draftId;
          instance.activeDraft = idx >= 0 ? instance.currentDrafts[idx] : null;
          renderLensDrafts(elements.drafts, instance, draftHandlers);
          if (isIntervalPlacement) {
            setFocusedLensInstance(lensId, instance.lensInstanceId);
            const currentFocused = getFocusedLensInstanceId(lensId);
          if (currentFocused === instance.lensInstanceId) {
            syncIntervalPlacementState(instance);
            const rec = state.selected;
            if (rec) {
              localStorage.setItem(storageKeys.selectedPerm, rec.perm.join(" "));
            }
            render();
            renderWorkspaceIntervalPlacementViz(instance);
            syncedIntervalPlacement = true;
          }
          }
          ensureDefaultSignalFlowSelections(
            getOrderedTracks(),
            lensInstances,
            scheduleLens,
            { workspace2: isWorkspace2Enabled() }
          );
          refreshLensInputs();
        },
      onAddToInventory: (draft) => {
        addDraftToInventory(draft);
      },
      onAddToDesk: (draft) => {
        addDraftToDesk(draft);
      }
    };
    renderLensDrafts(elements.drafts, instance, draftHandlers);
    const lensSupportsVisualizer = Boolean(instance.lens && instance.lens.meta && instance.lens.meta.hasVisualizer !== false);
    let vizActive = false;
    if (lensId === "euclideanPatterns") {
      renderEuclidPanel(instance, elements);
      vizActive = true;
    } else if (isIntervalPlacement) {
      vizActive = true;
    } else if (!isIntervalPlacement && lensSupportsVisualizer) {
      vizActive = renderTransformerVisualizer(elements, instance);
    }
    updateLensVisualizerState(instance, elements, vizActive);
  });

  const focusedAfterTargets = getFocusedLensInstanceId(lensId);
  if (!syncedIntervalPlacement && isIntervalPlacement && focusedAfterTargets === instance.lensInstanceId) {
    syncIntervalPlacementState(instance);
    render();
    renderWorkspaceIntervalPlacementViz(instance);
  }
  ensureDefaultSignalFlowSelections(
    getOrderedTracks(),
    lensInstances,
    scheduleLens,
    { workspace2: isWorkspace2Enabled() }
  );
  refreshLensInputs();
  if (isWorkspace2Enabled()) {
    renderWorkspace2();
  }
}

  function scheduleLens(instance) {
    scheduleLensEvaluation(instance, {
      getContext: () => getLensContext(instance),
      getDraftCatalog: () => collectDraftCatalog(Array.from(lensInstances.values())),
      getLensInstanceById: (id) => lensInstances.get(id) || null,
      getUpstreamInstance: getUpstreamLensInstance,
      onUpdate: handleLensUpdate,
      debounceMs: 80
    });
  }

  function normalizeInputRefChange(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    return { mode: "freeze", sourceDraftId: value };
  }

  function refreshLensInputs() {
    const draftCatalog = collectDraftCatalog(Array.from(lensInstances.values()));
    const metaById = buildDraftMetaById();
    const activeDraftIdByLensInstanceId = buildActiveDraftIdByLensInstanceId();
    const trackOrder = getOrderedTracks().map((track) => track.id);
    const handleInputChange = (instance, role, value) => {
      instance.selectedInputRefsByRole = instance.selectedInputRefsByRole || {};
      instance.selectedInputRefsByRole[role] = normalizeInputRefChange(value);
      scheduleLens(instance);
    };
    lensInstances.forEach((instance) => {
      const inputSpecs = Array.isArray(instance.lens.inputs) ? instance.lens.inputs : [];
      if (!inputSpecs.length) return;
      const elements = lensElements.get(instance.lensInstanceId);
      if (elements) {
        renderLensInputs(
          elements.inputs,
          inputSpecs,
          draftCatalog,
          instance.selectedInputRefsByRole,
          (role, value) => handleInputChange(instance, role, value),
          { metaById, trackOrder, activeDraftIdByLensInstanceId }
        );
      }
      const focusedId = getFocusedLensInstanceId(instance.lens.meta.id);
      if (focusedId === instance.lensInstanceId) {
        const dash = dashboardLensElements.get(instance.lens.meta.id);
        if (dash) {
          renderLensInputs(
            dash.inputs,
            inputSpecs,
            draftCatalog,
            instance.selectedInputRefsByRole,
            (role, value) => handleInputChange(instance, role, value),
            { metaById, trackOrder, activeDraftIdByLensInstanceId }
          );
        }
      }
    });
  }

function initDashboardLensElements() {
  ["intervalPlacement", "euclideanPatterns"].forEach((lensId) => {
    const elements = getLensElements(lensId);
    if (elements) {
      dashboardLensElements.set(lensId, elements);
    }
  });
}

function bindLensInputsForInstance(instance, elements, options = {}) {
  if (!elements) return;
  const lens = instance.lens;
  const idPrefix = options.idPrefix || "";
  if (lens.meta.id === "euclideanPatterns") {
    renderEuclidInputs(elements.inputs, instance, lens);
    renderEuclidParams(elements.params, instance, lens);
  } else if (Array.isArray(lens.inputs) && lens.inputs.length) {
    renderLensInputs(
      elements.inputs,
      lens.inputs,
      collectDraftCatalog(Array.from(lensInstances.values())),
      instance.selectedInputRefsByRole,
      (role, value) => {
        instance.selectedInputRefsByRole = instance.selectedInputRefsByRole || {};
        instance.selectedInputRefsByRole[role] = normalizeInputRefChange(value);
        scheduleLens(instance);
      },
      {
        metaById: buildDraftMetaById(),
        trackOrder: getOrderedTracks().map((track) => track.id),
        activeDraftIdByLensInstanceId: buildActiveDraftIdByLensInstanceId()
      }
    );
  } else {
    initLensControls(elements.inputs, lens.generatorInputs, instance.generatorInputValues, (spec, value) => {
      bindLensInputHandlers(instance, lens.generatorInputs, spec.key, value);
      storeLensSpecValue(lens.meta.id, "inputs", spec.key, instance.generatorInputValues[spec.key]);
      scheduleLens(instance);
    }, { idPrefix });
  }
  if (lens.meta.id !== "euclideanPatterns") {
    initLensControls(elements.params, lens.params, instance.paramsValues, (spec, value) => {
      bindLensParamHandlers(instance, lens.params, spec.key, value);
      storeLensSpecValue(lens.meta.id, "params", spec.key, instance.paramsValues[spec.key]);
      scheduleLens(instance);
    }, { idPrefix });
  }
  if (elements.popout) {
    elements.popout.addEventListener("click", () => {
      elements.root.classList.toggle("lens-popout-active");
    });
  }
  setLensElementLabels(instance, elements);
}

function initDefaultTracks() {
  if (!Array.isArray(state.tracks) || state.tracks.length) return;
  const first = createTrack("Track 1");
  const intervalLens = getLens("intervalPlacement");
  if (intervalLens) {
    const instance = createInstanceForTrack(intervalLens, first.id);
    addLensToTrack(first, instance.lensInstanceId);
    setFocusedLensInstanceGlobal(instance.lensInstanceId);
    (intervalLens.generatorInputs || []).forEach((spec) => {
      instance.generatorInputValues[spec.key] = loadLensSpecValue(intervalLens.meta.id, "inputs", spec);
    });
    (intervalLens.params || []).forEach((spec) => {
      instance.paramsValues[spec.key] = loadLensSpecValue(intervalLens.meta.id, "params", spec);
    });
    scheduleLens(instance);
  }
}

function buildDraftMetaById() {
  const metaById = new Map();
  const ordered = getOrderedTracks();
  ordered.forEach((track) => {
    const trackNumber = getTrackNumber(track.id);
    const trackName = track.name || `Track ${trackNumber}`;
    const lensIds = ensureTrackLensOrder(track);
    lensIds.forEach((instanceId) => {
      const instance = lensInstances.get(instanceId);
      if (!instance) return;
      const label = getLensPathLabel(instance);
      (instance.currentDrafts || []).forEach((draft) => {
        metaById.set(draft.draftId, {
          trackId: track.id,
          trackNumber,
          trackName,
          label,
          path: Array.isArray(instance.path) ? instance.path.slice() : [],
          lensName: instance.lens.meta.name,
          lensInstanceId: instance.lensInstanceId,
          isActive: instance.activeDraftId === draft.draftId
        });
      });
    });
  });
  return metaById;
}

function buildActiveDraftIdByLensInstanceId() {
  const map = new Map();
  lensInstances.forEach((instance) => {
    if (instance.activeDraftId) {
      map.set(instance.lensInstanceId, instance.activeDraftId);
    }
  });
  return map;
}

function clearSelectionsForDraftIds(draftIds) {
  const toClear = new Set(draftIds);
  if (!toClear.size) return;
  lensInstances.forEach((instance) => {
    const hasInputs = Array.isArray(instance.lens.inputs) && instance.lens.inputs.length;
    if (!hasInputs) return;
    const selected = instance.selectedInputRefsByRole || {};
    Object.keys(selected).forEach((role) => {
      const ref = selected[role];
      const draftId = typeof ref === "string"
        ? ref
        : (ref && ref.mode === "freeze" ? ref.sourceDraftId : null);
      if (draftId && toClear.has(draftId)) {
        selected[role] = null;
      }
    });
    scheduleLens(instance);
  });
}

function pruneMissingSelections() {
  const draftIds = new Set(collectDraftCatalog(Array.from(lensInstances.values())).map((draft) => draft.draftId));
  lensInstances.forEach((instance) => {
    const hasInputs = Array.isArray(instance.lens.inputs) && instance.lens.inputs.length;
    if (!hasInputs) return;
    const selected = instance.selectedInputRefsByRole || {};
    let changed = false;
    Object.keys(selected).forEach((role) => {
      const ref = selected[role];
      if (!ref) return;
      if (typeof ref === "string") {
        if (!draftIds.has(ref)) {
          selected[role] = null;
          changed = true;
        }
        return;
      }
      if (ref.mode === "freeze" && ref.sourceDraftId && !draftIds.has(ref.sourceDraftId)) {
        selected[role] = null;
        changed = true;
        return;
      }
      if (ref.mode === "active" && ref.sourceLensInstanceId && !lensInstances.has(ref.sourceLensInstanceId)) {
        selected[role] = null;
        changed = true;
      }
    });
    if (changed) scheduleLens(instance);
  });
}

function propagateActiveDrafts(instance) {
  if (!instance) return;
  ensureDefaultSignalFlowSelections(
    getOrderedTracks(),
    lensInstances,
    scheduleLens,
    { workspace2: isWorkspace2Enabled() }
  );
}

function removeLensInstance(instanceId) {
  const instance = lensInstances.get(instanceId);
  if (!instance) return;
  const track = getTrackById(instance.trackId);
  const removedDrafts = (instance.currentDrafts || []).map((draft) => draft.draftId);
  if (track) {
    removeLensFromTrack(track, instanceId);
  }
  lensInstances.delete(instanceId);
  state.lensInstancesById.delete(instanceId);
  intervalPlacementVisualizers.delete(instanceId);
  workspace2IntervalPlacementVisualizers.delete(instanceId);
  lensElements.delete(instanceId);
  focusedLensInstances.forEach((focusedId, lensId) => {
    if (focusedId === instanceId) {
      focusedLensInstances.delete(lensId);
    }
  });
  clearSelectionsForDraftIds(removedDrafts);
  syncFocusedLensInstances();
  pruneMissingSelections();
}

function mountIntervalPlacementWorkspaceViz(instance, middleBody) {
  if (!instance || !middleBody) return;
  middleBody.innerHTML = "";
  const headerBar = document.createElement("div");
  headerBar.className = "workspace-viz-header";
  const popoutBtn = document.createElement("button");
  popoutBtn.type = "button";
  popoutBtn.className = "ghost popout-btn icon-label icon-label-compact";
  popoutBtn.title = "Open large visualizer in pop-out window";
  popoutBtn.appendChild(icon("square-arrow-out-up-right"));
  const popoutLabel = document.createElement("span");
  popoutLabel.className = "label";
  popoutLabel.textContent = "Pop-out";
  popoutBtn.appendChild(popoutLabel);
  const overlay = ensureVisualizerPopoutOverlay();
  popoutBtn.addEventListener("click", () => {
    if (!overlay) return;
    const isOpen = overlay.classList.toggle("is-open");
    document.body.classList.toggle("visualizer-popout-open", isOpen);
    if (isOpen) {
      renderPlot();
      renderKeyboard();
      renderFretboard();
      updateHoverInfo();
    }
  });
  headerBar.appendChild(popoutBtn);
  middleBody.appendChild(headerBar);
  const vizStack = document.createElement("div");
  vizStack.className = "viz-stack";
  const plotPanel = document.createElement("div");
  plotPanel.className = "panel subpanel plot-panel";
  const panelHeader = document.createElement("div");
  panelHeader.className = "panel-header";
  const panelTitle = document.createElement("div");
  panelTitle.className = "panel-title";
  const title = document.createElement("h3");
  title.textContent = "Placement plot";
  panelTitle.appendChild(title);
  panelHeader.appendChild(panelTitle);
  const panelBody = document.createElement("div");
  panelBody.className = "panel-body";
  const plotWrap = document.createElement("div");
  plotWrap.className = "plot-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "workspace-plot-canvas";
  canvas.width = 360;
  canvas.height = 340;
  plotWrap.appendChild(canvas);
  panelBody.appendChild(plotWrap);
  const summary = document.createElement("p");
  summary.className = "hint workspace-anchor-summary";
  summary.textContent = "No draft yet.";
  panelBody.appendChild(summary);
  plotPanel.appendChild(panelHeader);
  plotPanel.appendChild(panelBody);
  vizStack.appendChild(plotPanel);
  const metaRow = document.createElement("div");
  metaRow.className = "viz-meta-row";
  const selectedPanel = document.createElement("div");
  selectedPanel.className = "panel subpanel";
  const selectedHeader = document.createElement("div");
  selectedHeader.className = "panel-header";
  const selectedTitle = document.createElement("div");
  selectedTitle.className = "panel-title";
  const selectedHeading = document.createElement("h3");
  selectedHeading.textContent = "Selected permutation";
  selectedTitle.appendChild(selectedHeading);
  selectedHeader.appendChild(selectedTitle);
  const selectedBody = document.createElement("div");
  selectedBody.className = "panel-body";
  const selectedInfo = document.createElement("div");
  selectedInfo.className = "meta-lines";
  selectedBody.appendChild(selectedInfo);
  selectedPanel.appendChild(selectedHeader);
  selectedPanel.appendChild(selectedBody);
  metaRow.appendChild(selectedPanel);
  const hoverPanel = document.createElement("div");
  hoverPanel.className = "panel subpanel";
  const hoverHeader = document.createElement("div");
  hoverHeader.className = "panel-header";
  const hoverTitle = document.createElement("div");
  hoverTitle.className = "panel-title";
  const hoverHeading = document.createElement("h3");
  hoverHeading.textContent = "Pitches";
  hoverTitle.appendChild(hoverHeading);
  hoverHeader.appendChild(hoverTitle);
  const hoverBody = document.createElement("div");
  hoverBody.className = "panel-body";
  const hoverInfo = document.createElement("div");
  hoverInfo.className = "meta-lines";
  hoverBody.appendChild(hoverInfo);
  hoverPanel.appendChild(hoverHeader);
  hoverPanel.appendChild(hoverBody);
  metaRow.appendChild(hoverPanel);
  middleBody.appendChild(vizStack);
  middleBody.appendChild(metaRow);
  intervalPlacementVisualizers.set(instance.lensInstanceId, {
    canvas,
    summary,
    selectedInfo,
    hoverInfo
  });
  renderWorkspaceIntervalPlacementViz(instance);
}

function moveArrayItem(list, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return;
  const item = list.splice(fromIndex, 1)[0];
  list.splice(toIndex, 0, item);
}

function moveTrackToIndex(trackId, targetIndex) {
  const ordered = getOrderedTracks();
  const fromIndex = ordered.findIndex((track) => track.id === trackId);
  if (fromIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
  if (fromIndex === targetIndex) return;
  moveArrayItem(ordered, fromIndex, targetIndex);
  state.tracks = ordered;
  renderTrackWorkspace();
}

function moveLensInTrack(trackId, instanceId, delta) {
  const track = getTrackById(trackId);
  if (!track) return;
  const lensIds = ensureTrackLensOrder(track);
  const index = lensIds.indexOf(instanceId);
  if (index < 0) return;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= lensIds.length) return;
  moveArrayItem(lensIds, index, nextIndex);
  updateTrackLensPaths(track);
  renderTrackWorkspace();
}

  function seedLensDefaults(instance) {
    if (!instance) return;
    const upstream = getUpstreamLensInstance(instance);
    if (!upstream) return;
    const drafts = upstream.currentDrafts || [];
    if (!drafts.length) return;
    instance.selectedInputRefsByRole = instance.selectedInputRefsByRole || {};
    (instance.lens.inputs || []).forEach((spec) => {
      if (instance.selectedInputRefsByRole[spec.role]) return;
      const matches = drafts.filter((draft) => {
        if (!draft || !draft.type) return false;
        if (Array.isArray(spec.accepts) && spec.accepts.length && !spec.accepts.includes(draft.type)) return false;
        if (Array.isArray(spec.acceptsSubtypes) && spec.acceptsSubtypes.length && !spec.acceptsSubtypes.includes(draft.subtype)) return false;
        return true;
      });
      if (!matches.length) return;
      const activeMatch = matches.find((draft) => draft.draftId === upstream.activeDraftId);
      const candidate = activeMatch || matches[0];
      if (!candidate) return;
      instance.selectedInputRefsByRole[spec.role] = activeMatch
        ? { mode: "active", sourceLensInstanceId: upstream.lensInstanceId }
        : { mode: "freeze", sourceDraftId: candidate.draftId };
    });
  }

function buildLensPanel(instance, opts = {}) {
  const lens = instance.lens;
  const hasLensInputs = Boolean(
    Array.isArray(lens.inputs) && lens.inputs.length
  );
  const root = document.createElement("section");
  root.className = `lens-layout lens-compact track-lens ${opts.className || ""}`.trim();
  const depth = Array.isArray(instance.path) ? instance.path.length : 0;
  root.dataset.depth = depth;
  root.style.setProperty("--lens-depth", depth);
  root.dataset.lensInstanceId = instance.lensInstanceId;

  const rail = document.createElement("div");
  rail.className = "lens-rail";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "lens-rail-remove lens-rail-button icon-button";
  removeBtn.setAttribute("aria-label", "Remove lens");
  removeBtn.appendChild(icon("square-x"));
  removeBtn.addEventListener("click", () => {
    const confirmMsg = "Remove this lens from the track?";
    if (window.confirm(confirmMsg)) {
      removeLensInstance(instance.lensInstanceId);
      renderTrackWorkspace();
    }
  });
  rail.appendChild(removeBtn);
  const railLabel = document.createElement("span");
  railLabel.textContent = getLensHeaderLabel(instance);
  rail.appendChild(railLabel);
  let railInputsMenu = null;
  let railInputsMenuList = null;
  if (hasLensInputs) {
    railInputsMenu = document.createElement("div");
    railInputsMenu.className = "lens-rail-menu";
    const infoButton = document.createElement("button");
    infoButton.type = "button";
    infoButton.className = "lens-rail-info lens-rail-button icon-button";
    infoButton.appendChild(icon("workflow"));
    infoButton.setAttribute("aria-label", "Select lens inputs");
    railInputsMenuList = document.createElement("div");
    railInputsMenuList.className = "lens-rail-menu-list";
    railInputsMenuList.dataset.lensInputs = "true";
    // Phase 4: This is where lane selection UI will be added.
    infoButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (openLensInputsMenu && openLensInputsMenu.menu !== railInputsMenu) {
        closeLensInputsMenu();
      }
      const shouldOpen = !railInputsMenu.classList.contains("is-open");
      if (shouldOpen) {
        railInputsMenu.classList.add("is-open");
        root.classList.add("lens-inputs-open");
        openLensInputsMenu = { menu: railInputsMenu, root };
      } else {
        closeLensInputsMenu();
      }
    });
    const doc = rail.ownerDocument;
    if (doc && !lensInputsMenuListenerBound) {
      doc.addEventListener("click", (event) => {
        if (!openLensInputsMenu) return;
        if (openLensInputsMenu.menu.contains(event.target)) return;
        closeLensInputsMenu();
      });
      lensInputsMenuListenerBound = true;
    }
    railInputsMenu.appendChild(infoButton);
    railInputsMenu.appendChild(railInputsMenuList);
    rail.appendChild(railInputsMenu);
  }
  root.appendChild(rail);

  const content = document.createElement("div");
  content.className = "lens-content";
  root.appendChild(content);

  const left = document.createElement("div");
  left.className = "lens-column lens-left";
  const leftBody = document.createElement("div");
  leftBody.className = "lens-column-body";
  let inputBody = railInputsMenuList;
  if (!hasLensInputs) {
    const inputSection = document.createElement("div");
    inputSection.className = "lens-section";
    const inputHeader = document.createElement("div");
    inputHeader.className = "lens-section-header";
    inputHeader.textContent = "Input";
    inputBody = document.createElement("div");
    inputBody.className = "lens-section-body";
    inputBody.dataset.lensInputs = "true";
    inputSection.appendChild(inputHeader);
    inputSection.appendChild(inputBody);
    leftBody.appendChild(inputSection);
  }
  const paramSection = document.createElement("div");
  paramSection.className = "lens-section";
  const paramHeader = document.createElement("div");
  paramHeader.className = "lens-section-header";
  paramHeader.textContent = "Parameters";
  const paramBody = document.createElement("div");
  paramBody.className = "lens-section-body";
  paramBody.dataset.lensParams = "true";
  paramSection.appendChild(paramHeader);
  paramSection.appendChild(paramBody);
  leftBody.appendChild(paramSection);
  left.appendChild(leftBody);
  content.appendChild(left);

  const lensSupportsVisualizer = Boolean(lens.meta && lens.meta.hasVisualizer !== false);
  let middle = null;
  let middleBody = null;
  let vizToggle = null;
  let euclidPreview = null;
  let euclidCanvas = null;
  if (lensSupportsVisualizer) {
    middle = document.createElement("div");
    middle.className = "lens-column lens-middle";
    middleBody = document.createElement("div");
    middleBody.className = "lens-column-body";
    middleBody.dataset.lensViz = "true";
    middle.appendChild(middleBody);
    vizToggle = document.createElement("button");
    vizToggle.type = "button";
    vizToggle.className = "lens-viz-toggle";
    vizToggle.textContent = "▼";
    vizToggle.setAttribute("aria-label", "Collapse visualizer panel");
    middle.appendChild(vizToggle);
  }

  if (middleBody) {
    if (lens.meta.id === "intervalPlacement") {
      mountIntervalPlacementWorkspaceViz(instance, middleBody);
    } else if (lens.meta.id === "euclideanPatterns") {
      const panel = document.createElement("div");
      panel.className = "panel subpanel";
      const panelHeader = document.createElement("div");
      panelHeader.className = "panel-header";
      const panelTitle = document.createElement("div");
      panelTitle.className = "panel-title";
      const heading = document.createElement("h3");
      heading.textContent = "Preview";
      panelTitle.appendChild(heading);
      panelHeader.appendChild(panelTitle);
      panel.appendChild(panelHeader);
      const panelBody = document.createElement("div");
      panelBody.className = "panel-body";
      euclidPreview = document.createElement("div");
      euclidPreview.className = "pattern-preview";
      euclidPreview.textContent = "No draft yet.";
      panelBody.appendChild(euclidPreview);
      panel.appendChild(panelBody);
      middleBody.appendChild(panel);
      const canvasPanel = document.createElement("div");
      canvasPanel.className = "panel subpanel";
      const canvasBody = document.createElement("div");
      canvasBody.className = "panel-body";
      euclidCanvas = document.createElement("canvas");
      euclidCanvas.className = "euclid-wheel";
      euclidCanvas.width = 300;
      euclidCanvas.height = 300;
      canvasBody.appendChild(euclidCanvas);
      canvasPanel.appendChild(canvasBody);
      middleBody.appendChild(canvasPanel);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "lens-viz-placeholder";
      placeholder.textContent = "No preview available.";
      middleBody.appendChild(placeholder);
    }
    if (middle) content.appendChild(middle);
  }

  const right = document.createElement("div");
  right.className = "lens-column lens-right";
  const rightBody = document.createElement("div");
  rightBody.className = "lens-column-body";
  const notices = document.createElement("div");
  notices.className = "lens-notices";
  const drafts = document.createElement("div");
  drafts.className = "drafts-list";
  rightBody.appendChild(notices);
  rightBody.appendChild(drafts);
  right.appendChild(rightBody);
  content.appendChild(right);

  const elements = {
    root,
    inputs: inputBody,
    params: paramBody,
    notices,
    drafts,
    viz: middleBody,
    headerTitle: railLabel,
    euclidPreview,
    euclidCanvas,
    vizToggle,
    hasVisualizer: lensSupportsVisualizer
  };
  if (vizToggle) {
    vizToggle.addEventListener("click", () => {
      instance.vizCollapsed = !instance.vizCollapsed;
      updateLensVisualizerState(instance, elements, true);
    });
  }
  updateLensVisualizerState(instance, elements, lensSupportsVisualizer);
  lensElements.set(instance.lensInstanceId, elements);
  bindLensInputsForInstance(instance, elements, { idPrefix: instance.lensInstanceId });
  scheduleLens(instance);
  return root;
}

function renderWorkspace2TracksLanes() {
  const ws2 = getWorkspace2Els();
  if (!ws2.tracks) return;
  const tracksBody =
    ws2.tracks.querySelector(".ws2-tracks-body") ||
    ws2.tracks.querySelector("#ws2TracksBody") ||
    ws2.tracks;
  tracksBody.innerHTML = "";

  const tracks = getOrderedTracks();
  if (!tracks.length) {
    tracksBody.innerHTML = `<div class="ws2-placeholder">No tracks.</div>`;
    return;
  }

  if (!state.selectedTrackId || !getTrackById(state.selectedTrackId)) {
    setSelectedTrackId(tracks[0].id);
  }

  if (!getFocusedWorkspace2Instance()) {
    const selected = getSelectedTrack();
    if (selected) {
      const path = getTrackLensPath(selected);
      const firstId = path.length ? path[0] : null;
      if (firstId) {
        setFocusedLensInstanceGlobal(firstId);
      }
    }
  }

  tracks.forEach((track) => {
    const trackNumber = getTrackNumber(track.id);
    const lane = document.createElement("div");
    lane.className = `ws2-lane${track.id === state.selectedTrackId ? " is-selected" : ""}`;
    lane.dataset.trackId = track.id;

    const header = document.createElement("div");
    header.className = "ws2-lane-header";
    const trackLabel = trackNumber ? `Track ${trackNumber}` : "Track -";
    header.textContent = `${trackLabel} - ${track.name || "Untitled track"}`;
    header.addEventListener("click", (event) => {
      event.stopPropagation();
      setSelectedTrackId(track.id);
      if (!getFocusedWorkspace2Instance()) {
        const path = getTrackLensPath(track);
        const firstId = path.length ? path[0] : null;
        if (firstId) {
          setFocusedLensInstanceGlobal(firstId);
        }
      }
      renderWorkspace2();
    });

    const pills = document.createElement("div");
    pills.className = "ws2-lane-pills";
    pills.dataset.trackId = track.id;

    const createPill = (instanceId, idx) => {
      const inst = instanceId ? lensInstances.get(instanceId) : null;
      if (!inst) return null;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ws2-pill${inst.lensInstanceId === state.focusedLensInstanceId ? " is-focused" : ""}`;
      btn.dataset.instanceId = inst.lensInstanceId;

      const label = document.createElement("span");
      label.className = "ws2-pill-label";
      label.textContent = getLensLabelForTrackIndex(trackNumber, idx);
      btn.appendChild(label);

      const name = document.createElement("span");
      name.className = "ws2-pill-name";
      name.textContent = inst.lens && inst.lens.meta && inst.lens.meta.name ? inst.lens.meta.name : "Lens";
      btn.appendChild(name);

      const summary = document.createElement("span");
      summary.className = "ws2-pill-summary";
      summary.textContent = ws2DraftSummaryForInstance(inst, 48);
      btn.appendChild(summary);

      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedTrackId(track.id);
        setFocusedLensInstanceGlobal(inst.lensInstanceId);
        renderWorkspace2();
      });

      return btn;
    };

    const makeSlot = (insertIndex, includePlaceholder = false) => {
      const slot = document.createElement("div");
      slot.className = "ws2-drop-slot";
      slot.dataset.trackId = track.id;
      slot.dataset.insertIndex = `${insertIndex}`;
      const caret = document.createElement("div");
      caret.className = "ws2-drop-caret";
      slot.appendChild(caret);
      slot.addEventListener("dragenter", onSlotDragEnter);
      slot.addEventListener("dragover", onSlotDragOver);
      slot.addEventListener("dragleave", onSlotDragLeave);
      slot.addEventListener("drop", onSlotDrop);
      if (includePlaceholder) {
        const hint = document.createElement("div");
        hint.className = "ws2-drop-placeholder";
        hint.textContent = "Drop a lens here.";
        slot.appendChild(hint);
      }
      return slot;
    };

    const path = getTrackLensPath(track);
    pills.appendChild(makeSlot(0, path.length === 0));
    path.forEach((instanceId, idx) => {
      const pill = createPill(instanceId, idx);
      if (pill) {
        pills.appendChild(pill);
      }
      pills.appendChild(makeSlot(idx + 1));
    });

    const outId = path.length ? path[path.length - 1] : null;
    const outInst = outId ? lensInstances.get(outId) : null;
    const out = document.createElement("div");
    out.className = "ws2-signal-out";
    const outBtn = document.createElement("button");
    outBtn.type = "button";
    outBtn.className = `ws2-pill ws2-pill-out${outInst && outInst.lensInstanceId === state.focusedLensInstanceId ? " is-focused" : ""}`;
    outBtn.title = "Track output (active draft of last lens)";

    const outTag = document.createElement("span");
    outTag.className = "ws2-pill-label";
    outTag.textContent = "OUT";
    outBtn.appendChild(outTag);

    const outText = document.createElement("span");
    outText.className = "ws2-pill-summary";
    outText.textContent = outInst ? ws2DraftSummaryForInstance(outInst, 72) : "-";
    outBtn.appendChild(outText);

    outBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setSelectedTrackId(track.id);
      if (outInst) {
        setFocusedLensInstanceGlobal(outInst.lensInstanceId);
      }
      renderWorkspace2();
    });

    lane.addEventListener("click", () => {
      setSelectedTrackId(track.id);
      renderWorkspace2();
    });

    lane.appendChild(header);
    lane.appendChild(pills);
    lane.appendChild(out);
    tracksBody.appendChild(lane);
  });
}
function renderWorkspace2LensBrowser() {
  const ws2 = getWorkspace2Els();
  if (!ws2.lensBrowser) return;
  const panel = ws2.lensBrowser;
  const body = panel.querySelector(".ws2-panel-body") || panel;
  const lenses = listLenses()
    .slice()
    .sort((a, b) => {
      const nameA = (a && a.meta && a.meta.name) || "";
      const nameB = (b && b.meta && b.meta.name) || "";
      return nameA.localeCompare(nameB);
    });
  body.innerHTML = "";
  if (!lenses.length) {
    body.innerHTML = `<div class="ws2-placeholder">No lenses available.</div>`;
    return;
  }
  const list = document.createElement("div");
  list.className = "ws2-browser-list";
  lenses.forEach((lens) => {
    const lensId = lens && lens.meta ? lens.meta.id : null;
    if (!lensId) return;
    const titleText = (lens.meta && lens.meta.name) || lensId;
    const descText =
      (lens.meta && (lens.meta.description || lens.meta.help || lens.meta.summary)) || "";
    const item = document.createElement("div");
    item.className = "ws2-browser-item";
    item.setAttribute("draggable", "true");
    item.dataset.lensId = lensId;
    const titleEl = document.createElement("div");
    titleEl.className = "ws2-browser-name";
    titleEl.textContent = titleText;
    item.appendChild(titleEl);
    if (descText) {
      const descEl = document.createElement("div");
      descEl.className = "ws2-browser-desc";
      descEl.textContent = descText;
      item.appendChild(descEl);
    }
    item.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const selected = getSelectedTrack();
      const trackId = selected ? selected.id : null;
      createLensInstanceForTrack(lensId, trackId);
    });
    item.addEventListener("dragstart", (event) => {
      const targetLensId = lensId;
      beginWs2BrowserDrag(targetLensId);
      if (event.dataTransfer) {
        event.dataTransfer.setData("application/x-lens-type", targetLensId);
        event.dataTransfer.setData("text/plain", targetLensId);
        event.dataTransfer.effectAllowed = "copy";
      }
    });
    item.addEventListener("dragend", () => {
      endWs2BrowserDrag();
    });
    list.appendChild(item);
  });
  body.appendChild(list);
}

function renderWorkspace2TrackInspector() {
  const ws2 = getWorkspace2Els();
  if (!ws2.trackInspector) return;
  const panel = ws2.trackInspector;
  const body = panel.querySelector(".ws2-panel-body") || panel;
  const track = getSelectedTrack();
  if (!track) {
    body.innerHTML = `<div class="ws2-placeholder">Select a track.</div>`;
    return;
  }
  const trackNumber = getTrackNumber(track.id);
  const trackLabel = trackNumber ? `Track ${trackNumber}` : "Track —";
  const lensPath = getTrackLensPath(track);
  body.innerHTML = "";

  const createMetaLine = (label, value) => {
    const row = document.createElement("div");
    row.className = "ws2-inspector-meta-line";
    const labelEl = document.createElement("span");
    labelEl.className = "ws2-inspector-meta-label";
    labelEl.textContent = `${label}:`;
    const valueEl = document.createElement("span");
    valueEl.className = "ws2-inspector-meta-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  };

  const orderedTracks = getOrderedTracks();

  const headerSection = document.createElement("div");
  headerSection.className = "ws2-inspector-section";
  const headerTitleRow = document.createElement("div");
  headerTitleRow.className = "ws2-inspector-track-header";
  const title = document.createElement("div");
  title.className = "ws2-inspector-track-title";
  title.textContent = trackLabel;
  const nameWrapper = document.createElement("div");
  nameWrapper.className = "ws2-inspector-track-name-wrapper";
  const nameDisplay = document.createElement("span");
  nameDisplay.className = "ws2-track-name-display";
  nameDisplay.textContent = track.name || "Untitled track";
  nameWrapper.appendChild(nameDisplay);
  headerTitleRow.appendChild(title);
  headerTitleRow.appendChild(nameWrapper);
  headerSection.appendChild(headerTitleRow);
  body.appendChild(headerSection);

  const startTrackRename = () => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ws2-track-name-input";
    input.value = track.name || "";
    nameWrapper.replaceChild(input, nameDisplay);
    input.focus();
    const commit = (apply) => {
      if (apply) {
        const nextName = (input.value || "").trim() || "Untitled track";
        if (nextName !== track.name) {
          track.name = nextName;
          saveWorkspace();
          renderTrackWorkspace();
        }
      }
      renderWorkspace2();
    };
    input.addEventListener("blur", () => commit(true), { once: true });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit(true);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        commit(false);
      }
    });
  };
  nameDisplay.addEventListener("click", startTrackRename);

  const statsSection = document.createElement("div");
  statsSection.className = "ws2-inspector-section";
  const statsHeader = document.createElement("div");
  statsHeader.className = "ws2-inspector-section-header";
  statsHeader.textContent = "Track stats";
  statsSection.appendChild(statsHeader);
  const statsBody = document.createElement("div");
  statsBody.className = "ws2-inspector-meta";
  statsBody.appendChild(createMetaLine("Lenses", `${lensPath.length}`));
  const firstLens = lensPath.length ? lensInstances.get(lensPath[0]) : null;
  statsBody.appendChild(createMetaLine("First lens", firstLens ? (firstLens.lens?.meta?.name || "Lens") : "—"));
  const lastLens = lensPath.length ? lensInstances.get(lensPath[lensPath.length - 1]) : null;
  const lastSummary = lastLens ? ws2DraftSummaryForInstance(lastLens, 64) : "—";
  statsBody.appendChild(createMetaLine("Last output", lastSummary));
  statsSection.appendChild(statsBody);
  body.appendChild(statsSection);

  const listSection = document.createElement("div");
  listSection.className = "ws2-inspector-section";
  const listHeader = document.createElement("div");
  listHeader.className = "ws2-inspector-section-header";
  listHeader.textContent = "Lens path";
  listSection.appendChild(listHeader);
  const listBody = document.createElement("div");
  listBody.className = "ws2-track-lens-list";
  if (!lensPath.length) {
    const placeholder = document.createElement("div");
    placeholder.className = "ws2-placeholder";
    placeholder.textContent = "No lenses on this track.";
    listBody.appendChild(placeholder);
  } else {
    lensPath.forEach((instanceId, idx) => {
      const lensInstance = lensInstances.get(instanceId);
      if (!lensInstance) return;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `ws2-track-lens-row${lensInstance.lensInstanceId === state.focusedLensInstanceId ? " is-focused" : ""}`;
      const label = document.createElement("span");
      label.className = "ws2-track-lens-label";
      label.textContent = getLensLabelForTrackIndex(trackNumber, idx);
      const nameSpan = document.createElement("span");
      nameSpan.className = "ws2-track-lens-name";
      nameSpan.textContent = lensInstance.lens?.meta?.name || "Lens";
      const summary = document.createElement("span");
      summary.className = "ws2-track-lens-summary";
      summary.textContent = ws2DraftSummaryForInstance(lensInstance, 40);
      row.appendChild(label);
      row.appendChild(nameSpan);
      row.appendChild(summary);
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedTrackId(track.id);
        setFocusedLensInstanceGlobal(lensInstance.lensInstanceId);
        renderWorkspace2();
      });
      listBody.appendChild(row);
    });
  }
  listSection.appendChild(listBody);
  body.appendChild(listSection);

  const actionsSection = document.createElement("div");
  actionsSection.className = "ws2-inspector-section";
  const actionsRow = document.createElement("div");
  actionsRow.className = "ws2-inspector-actions";
  const createActionButton = (label, handler) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost ws2-inspector-action";
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
  };
  const handleClearTrack = () => {
    if (!lensPath.length) return;
    if (!window.confirm("Clear all lenses from this track?")) return;
    lensPath.slice().forEach((instanceId) => removeLensInstance(instanceId));
    track.lensInstanceIds = [];
    ensureDefaultSignalFlowSelections(
      getOrderedTracks(),
      lensInstances,
      scheduleLens,
      { workspace2: isWorkspace2Enabled() }
    );
    renderTrackWorkspace();
    const fallback = () => {
      for (const candidate of orderedTracks) {
        if (candidate.id === track.id) continue;
        const candidatePath = getTrackLensPath(candidate);
        if (candidatePath.length) {
          return candidatePath[0];
        }
      }
      return null;
    };
    const fallbackId = fallback();
    setFocusedLensInstanceGlobal(fallbackId);
    setSelectedTrackId(track.id);
    renderWorkspace2();
  };
  const clearBtn = createActionButton("Clear track", handleClearTrack);
  clearBtn.disabled = !lensPath.length;
  actionsRow.appendChild(clearBtn);
  actionsSection.appendChild(actionsRow);
  body.appendChild(actionsSection);
}
function renderWorkspace2LensInspector() {
  const ws2 = getWorkspace2Els();
  if (!ws2.lensInspector) return;
  const panel = ws2.lensInspector;
  const body = panel.querySelector(".ws2-panel-body") || panel;
  const inst = getFocusedWorkspace2Instance();
  if (!inst) {
    body.innerHTML = `<div class="ws2-placeholder">Select a lens.</div>`;
    return;
  }
  body.innerHTML = "";
  const track = getTrackById(inst.trackId);
  const trackNumber = track ? getTrackNumber(track.id) : 0;
  const lensPath = track ? getTrackLensPath(track) : [];
  const positionIndex = track ? getLensIndexInTrack(track, inst.lensInstanceId) : -1;
  const labelText = getLensLabelForTrackIndex(trackNumber, positionIndex);
  const lensName = inst.lens && inst.lens.meta ? inst.lens.meta.name : "Lens";
  const focusMeta = lensPath.length && positionIndex >= 0
    ? `Track ${trackNumber || "—"} • Position ${positionIndex + 1} of ${lensPath.length}`
    : `Track ${trackNumber || "—"} • Position —`;
  const draft = inst.activeDraft || null;
  const draftId = draft ? (draft.draftId || draft.id || "—") : "—";
  const draftSummary = ws2DraftSummaryForInstance(inst, 120);
  const draftCount = Array.isArray(inst.currentDrafts) ? inst.currentDrafts.length : 0;
  const orderedTracks = getOrderedTracks();
  const createMetaLine = (label, value) => {
    const row = document.createElement("div");
    row.className = "ws2-inspector-meta-line";
    const labelEl = document.createElement("span");
    labelEl.className = "ws2-inspector-meta-label";
    labelEl.textContent = `${label}:`;
    const valueEl = document.createElement("span");
    valueEl.className = "ws2-inspector-meta-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  };

  const headerSection = document.createElement("div");
  headerSection.className = "ws2-inspector-section";
  const headerRow = document.createElement("div");
  headerRow.className = "ws2-inspector-header";
  const headerLabel = document.createElement("div");
  headerLabel.className = "ws2-inspector-header-label";
  headerLabel.textContent = labelText && labelText !== "?" ? `Lens ${labelText}` : "Lens";
  const headerName = document.createElement("div");
  headerName.className = "ws2-inspector-header-name";
  headerName.textContent = lensName;
  const focusBadge = document.createElement("span");
  focusBadge.className = "ws2-inspector-focus-badge";
  focusBadge.textContent = "Focused lens";
  headerRow.appendChild(headerLabel);
  headerRow.appendChild(headerName);
  headerRow.appendChild(focusBadge);
  const headerMeta = document.createElement("div");
  headerMeta.className = "ws2-inspector-header-meta";
  headerMeta.textContent = focusMeta;
  headerSection.appendChild(headerRow);
  headerSection.appendChild(headerMeta);
  body.appendChild(headerSection);

  const outputSection = document.createElement("div");
  outputSection.className = "ws2-inspector-section";
  const outputHeader = document.createElement("div");
  outputHeader.className = "ws2-inspector-section-header";
  outputHeader.textContent = "Output";
  const summaryText = document.createElement("div");
  summaryText.className = "ws2-inspector-output-summary";
  summaryText.textContent = draftSummary || "—";
  const outputMeta = document.createElement("div");
  outputMeta.className = "ws2-inspector-meta";
  outputMeta.appendChild(createMetaLine("Active draft", draftId));
  outputMeta.appendChild(createMetaLine("Draft count", `${draftCount}`));
  outputSection.appendChild(outputHeader);
  outputSection.appendChild(summaryText);
  outputSection.appendChild(outputMeta);
  body.appendChild(outputSection);

  const inputSpecs = Array.isArray(inst.lens.inputs) && inst.lens.inputs.length
    ? inst.lens.inputs
    : Array.isArray(inst.lens.meta.inputs) ? inst.lens.meta.inputs : [];
  const wiringSection = document.createElement("div");
  wiringSection.className = "ws2-inspector-section";
  const wiringHeader = document.createElement("div");
  wiringHeader.className = "ws2-inspector-section-header";
  wiringHeader.textContent = "I/O wiring";
  wiringSection.appendChild(wiringHeader);
  const wiringBody = document.createElement("div");
  wiringBody.className = "ws2-inspector-wiring-body";
  const formatInputTarget = (ref) => {
    if (!ref) return "—";
    if (ref.mode === "active" && ref.sourceLensInstanceId) {
      const sourceTrackId = findTrackIdForLensInstance(orderedTracks, ref.sourceLensInstanceId);
      if (sourceTrackId) {
        const sourceTrack = getTrackById(sourceTrackId);
        const sourceIndex = getLensIndexInTrack(sourceTrack, ref.sourceLensInstanceId);
        const sourceTrackNumber = getTrackNumber(sourceTrackId);
        const lensLabel = getLensLabelForTrackIndex(sourceTrackNumber, sourceIndex);
        const sourceLabel = sourceTrackNumber ? `Track ${sourceTrackNumber}` : "Track —";
        return lensLabel ? `${sourceLabel} • ${lensLabel}` : sourceLabel;
      }
      return ref.sourceLensInstanceId;
    }
    if (ref.sourceDraftId) return ref.sourceDraftId;
    return "—";
  };
  if (!inputSpecs.length) {
    const placeholder = document.createElement("div");
    placeholder.className = "ws2-placeholder";
    placeholder.textContent = "No inputs.";
    wiringBody.appendChild(placeholder);
  } else {
    inputSpecs.forEach((spec) => {
      const ref = (inst.selectedInputRefsByRole || {})[spec.role];
      const modeLabel = ref?.mode === "freeze" ? "Frozen" : ref?.mode === "active" ? "Live" : "—";
      const targetLabel = formatInputTarget(ref);
      const row = document.createElement("div");
      row.className = "ws2-inspector-wiring-row";
      const role = document.createElement("div");
      role.className = "ws2-inspector-wiring-role";
      role.textContent = spec.label || spec.role || "Input";
      const status = document.createElement("div");
      status.className = "ws2-inspector-wiring-status";
      status.textContent = modeLabel;
      const target = document.createElement("div");
      target.className = "ws2-inspector-wiring-target";
      target.textContent = targetLabel;
      row.appendChild(role);
      row.appendChild(status);
      row.appendChild(target);
      wiringBody.appendChild(row);
    });
  }
  wiringSection.appendChild(wiringBody);
  body.appendChild(wiringSection);

  const actionsSection = document.createElement("div");
  actionsSection.className = "ws2-inspector-section";
  const actionsHeader = document.createElement("div");
  actionsHeader.className = "ws2-inspector-section-header";
  actionsHeader.textContent = "Actions";
  actionsSection.appendChild(actionsHeader);
  const actionsRow = document.createElement("div");
  actionsRow.className = "ws2-inspector-actions";
  const createActionButton = (label, handler) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost ws2-inspector-action";
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
  };
  const currentPath = lensPath.slice();
  const currentIndex = currentPath.indexOf(inst.lensInstanceId);
  const handleRemoveLens = () => {
    if (!inst.lensInstanceId || !track) return;
    if (!window.confirm("Remove this lens from the track?")) return;
    if (currentIndex < 0) return;
    const nextPath = removeLensFromOrder(currentPath, currentIndex);
    const nextIndex = pickFocusAfterRemoval(nextPath, currentIndex);
    const nextFocus = nextIndex >= 0 ? nextPath[nextIndex] : null;
    removeLensInstance(inst.lensInstanceId);
    ensureDefaultSignalFlowSelections(
      getOrderedTracks(),
      lensInstances,
      scheduleLens,
      { workspace2: isWorkspace2Enabled() }
    );
    renderTrackWorkspace();
    if (nextFocus && lensInstances.has(nextFocus)) {
      setFocusedLensInstanceGlobal(nextFocus);
    } else {
      const fallbackTracks = getOrderedTracks();
      const fallback = fallbackTracks.find((candidate) => candidate.id !== track.id && getTrackLensPath(candidate).length);
      const fallbackId = fallback ? getTrackLensPath(fallback)[0] : null;
      setFocusedLensInstanceGlobal(fallbackId);
    }
    setSelectedTrackId(track.id);
    renderWorkspace2();
  };
  const handleDuplicateLens = () => {
    if (!track) return;
    const path = lensPath.slice();
    const insertIndex = path.indexOf(inst.lensInstanceId);
    if (insertIndex < 0) return;
    const clone = createInstanceForTrack(inst.lens, track.id);
    clone.paramsValues = { ...(inst.paramsValues || {}) };
    clone.generatorInputValues = { ...(inst.generatorInputValues || {}) };
    const copyRefs = {};
    Object.entries(inst.selectedInputRefsByRole || {}).forEach(([role, ref]) => {
      copyRefs[role] = ref ? { ...ref } : ref;
    });
    clone.selectedInputRefsByRole = copyRefs;
    const lensIds = ensureTrackLensOrder(track);
    lensIds.splice(insertIndex + 1, 0, clone.lensInstanceId);
    updateTrackLensPaths(track);
    scheduleLens(clone);
    ensureDefaultSignalFlowSelections(
      getOrderedTracks(),
      lensInstances,
      scheduleLens,
      { workspace2: isWorkspace2Enabled() }
    );
    setSelectedTrackId(track.id);
    setFocusedLensInstanceGlobal(clone.lensInstanceId);
    renderTrackWorkspace();
    renderWorkspace2();
  };
  const handleMoveLens = (delta) => {
    if (!track) return;
    moveLensInTrack(track.id, inst.lensInstanceId, delta);
    ensureDefaultSignalFlowSelections(
      getOrderedTracks(),
      lensInstances,
      scheduleLens,
      { workspace2: isWorkspace2Enabled() }
    );
    scheduleLens(inst);
    setSelectedTrackId(track.id);
    setFocusedLensInstanceGlobal(inst.lensInstanceId);
    renderWorkspace2();
  };
  const removeBtn = createActionButton("Remove lens", handleRemoveLens);
  const duplicateBtn = createActionButton("Duplicate lens", handleDuplicateLens);
  const moveLeftBtn = createActionButton("Move left", () => handleMoveLens(-1));
  const moveRightBtn = createActionButton("Move right", () => handleMoveLens(1));
  moveLeftBtn.disabled = currentIndex <= 0;
  moveRightBtn.disabled = currentIndex < 0 || currentIndex >= lensPath.length - 1;
  actionsRow.append(removeBtn, duplicateBtn, moveLeftBtn, moveRightBtn);
  actionsSection.appendChild(actionsRow);
  body.appendChild(actionsSection);
}
function createWorkspace2LensElements(vizRoot, draftsRoot) {
  if (!vizRoot || !draftsRoot) return null;
  const left = document.createElement("div");
  left.className = "ws2-lensui-left";
  const right = document.createElement("div");
  right.className = "ws2-lensui-right";
  const title = document.createElement("div");
  title.className = "ws2-lensui-title";
  const inputs = document.createElement("div");
  inputs.className = "ws2-lensui-section";
  const params = document.createElement("div");
  params.className = "ws2-lensui-section";
  left.appendChild(title);
  left.appendChild(inputs);
  left.appendChild(params);
  const viz = document.createElement("div");
  viz.className = "ws2-lensui-viz";
  right.appendChild(viz);
  vizRoot.appendChild(left);
  vizRoot.appendChild(right);
  const notices = document.createElement("div");
  notices.className = "ws2-lens-notices";
  const drafts = document.createElement("div");
  drafts.className = "ws2-lens-drafts";
  draftsRoot.appendChild(notices);
  draftsRoot.appendChild(drafts);
  return {
    root: vizRoot,
    headerTitle: title,
    inputs,
    params,
    notices,
    drafts,
    viz
  };
}

function bindWorkspace2LensControls(instance, elements) {
  if (!instance || !elements) return;
  bindLensInputsForInstance(instance, elements, { idPrefix: `ws2-${instance.lensInstanceId}` });
}

function renderWorkspace2IntervalPlacementViz(instance, container) {
  if (!instance || !container) return false;
  const wrapper = document.createElement("div");
  wrapper.className = "ws2-interval-viz";
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 320;
  canvas.className = "ws2-interval-canvas";
  wrapper.appendChild(canvas);
  const meta = document.createElement("div");
  meta.className = "ws2-interval-meta";
  const summary = document.createElement("div");
  summary.className = "ws2-interval-summary";
  const selectedInfo = document.createElement("div");
  selectedInfo.className = "ws2-interval-selected";
  const hoverInfo = document.createElement("div");
  hoverInfo.className = "ws2-interval-hover";
  meta.appendChild(summary);
  meta.appendChild(selectedInfo);
  meta.appendChild(hoverInfo);
  wrapper.appendChild(meta);
  container.appendChild(wrapper);
  const visual = {
    canvas,
    summary,
    selectedInfo,
    hoverInfo
  };
  workspace2IntervalPlacementVisualizers.set(instance.lensInstanceId, visual);
  updateIntervalPlacementVisual(instance, visual);
  return true;
}

function renderWorkspace2EuclidViz(instance, container) {
  if (!instance || !container) return false;
  const panel = document.createElement("div");
  panel.className = "ws2-euclid-panel";
  const preview = document.createElement("div");
  preview.className = "ws2-euclid-preview";
  panel.appendChild(preview);
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 240;
  canvas.className = "ws2-euclid-canvas";
  panel.appendChild(canvas);
  container.appendChild(panel);
  renderEuclidPanel(instance, { euclidPreview: preview, euclidCanvas: canvas });
  return true;
}

function renderWorkspace2LensVisualizer(instance, container) {
  if (!instance || !container) return false;
  const lens = instance.lens;
  if (!lens || !lens.meta) return false;
  container.innerHTML = "";
  const lensSupportsVisualizer = lens.meta.hasVisualizer !== false;
  if (!lensSupportsVisualizer) {
    const placeholder = document.createElement("div");
    placeholder.className = "ws2-lens-viz-placeholder";
    placeholder.textContent = "No visualizer for this lens.";
    container.appendChild(placeholder);
    return false;
  }
  if (lens.meta.id === "intervalPlacement") {
    return renderWorkspace2IntervalPlacementViz(instance, container);
  }
  if (lens.meta.id === "euclideanPatterns") {
    return renderWorkspace2EuclidViz(instance, container);
  }
  return renderTransformerVisualizer({ viz: container }, instance);
}

function renderWorkspace2FocusedLensFullUI() {
  const ws2 = getWorkspace2Els();
  if (!ws2.viz || !ws2.drafts) return;
  const vizBody = ws2.viz.querySelector(".ws2-panel-body") || ws2.viz;
  const draftsBody = ws2.drafts.querySelector(".ws2-panel-body") || ws2.drafts;
  const inst = getFocusedWorkspace2Instance();
  if (!inst) {
    vizBody.innerHTML = `<div class="ws2-placeholder">Select a lens.</div>`;
    draftsBody.innerHTML = `<div class="ws2-placeholder">Select a lens.</div>`;
    return;
  }
  vizBody.innerHTML = "";
  draftsBody.innerHTML = "";
  const vizMount = document.createElement("div");
  vizMount.className = "ws2-lensui";
  vizBody.appendChild(vizMount);
  const draftsMount = document.createElement("div");
  draftsMount.className = "ws2-draftsui";
  draftsBody.appendChild(draftsMount);
  const elements = createWorkspace2LensElements(vizMount, draftsMount);
  if (!elements) return;
  bindWorkspace2LensControls(inst, elements);
  renderLensNotices(elements.notices, inst);
  const handlers = {
    onSelect: (draft) => {
      const currentDrafts = Array.isArray(inst.currentDrafts) ? inst.currentDrafts : [];
      const idx = currentDrafts.findIndex((item) => item.draftId === draft.draftId);
      inst.activeDraftIndex = idx >= 0 ? idx : null;
      inst.activeDraftId = draft.draftId;
      inst.activeDraft = idx >= 0 ? currentDrafts[idx] : null;
      setFocusedLensInstanceGlobal(inst.lensInstanceId);
      ensureDefaultSignalFlowSelections(
        getOrderedTracks(),
        lensInstances,
        scheduleLens,
        { workspace2: isWorkspace2Enabled() }
      );
      refreshLensInputs();
      renderWorkspace2();
    },
    onAddToInventory: (draft) => addDraftToInventory(draft),
    onAddToDesk: (draft) => addDraftToDesk(draft)
  };
  renderLensDrafts(elements.drafts, inst, handlers);
  renderWorkspace2LensVisualizer(inst, elements.viz);
}

function renderWorkspace2() {
  if (!isWorkspace2Enabled()) return;
  const ws2 = getWorkspace2Els();
  if (!ws2.root || ws2.root.hidden) return;

  const viewMode = getWs2ViewMode();
  applyWorkspace2ViewVisibility(viewMode);
  renderWorkspace2ViewSwitch();
  if (viewMode === "library") {
    renderWorkspace2LibraryView();
  } else if (workspaceDockPanels) {
    mountDockPanels(workspaceDockPanels);
  }

  const tracks = getOrderedTracks();
  if (tracks.length) {
    if (!getSelectedTrack()) {
      setSelectedTrackId(tracks[0].id);
    }
  } else {
    setSelectedTrackId(null);
  }

  if (!getFocusedWorkspace2Instance() && tracks.length) {
    const track = getSelectedTrack();
    if (track) {
      const path = getTrackLensPath(track);
      const fallbackId = path.length ? path[path.length - 1] : null;
      if (fallbackId) {
        setFocusedLensInstanceGlobal(fallbackId);
      }
    }
  }

  renderWorkspace2TracksLanes();
  renderWorkspace2TrackInspector();
  renderWorkspace2LensBrowser();
  renderWorkspace2LensInspector();
  renderWorkspace2FocusedLensFullUI();
}

function renderTrackWorkspace() {
  const container = els.workspaceTracks;
  if (!container) return;
  lensElements.clear();
  intervalPlacementVisualizers.clear();
  container.innerHTML = "";
  if (trackMenuOutsideHandler) {
    document.removeEventListener("click", trackMenuOutsideHandler);
  }
  trackMenuOutsideHandler = (event) => {
    const menus = container.querySelectorAll(".track-menu.is-open");
    menus.forEach((menu) => {
      if (!menu.contains(event.target)) {
        menu.classList.remove("is-open");
      }
    });
  };
  document.addEventListener("click", trackMenuOutsideHandler);
  const toolbar = document.createElement("div");
  toolbar.className = "track-toolbar";
  const addTrackBtn = document.createElement("button");
  addTrackBtn.type = "button";
  addTrackBtn.textContent = "Add Track";
  addTrackBtn.addEventListener("click", () => {
    createTrack(`Track ${state.tracks.length + 1}`);
    renderTrackWorkspace();
  });
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "ghost";
  saveBtn.textContent = "Save Workspace";
  saveBtn.addEventListener("click", () => {
    saveWorkspace();
  });
  toolbar.appendChild(addTrackBtn);
  toolbar.appendChild(saveBtn);
  container.appendChild(toolbar);

  const list = document.createElement("div");
  list.className = "track-list";
  let draggedTrackId = null;
  const placeholder = document.createElement("div");
  placeholder.className = "track-drop-placeholder";

  const availableLenses = listLenses()
    .slice()
    .sort((a, b) => {
      const labelA = (a && a.meta && a.meta.name) || "";
      const labelB = (b && b.meta && b.meta.name) || "";
      return labelA.localeCompare(labelB);
    });

  function clearPlaceholder() {
    if (placeholder.parentElement) {
      placeholder.parentElement.removeChild(placeholder);
    }
  }

  function insertPlaceholderAt(y) {
    const cards = Array.from(list.querySelectorAll(".track-card")).filter((card) => !card.classList.contains("is-dragging"));
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        list.insertBefore(placeholder, card);
        return;
      }
    }
    list.appendChild(placeholder);
  }

  list.addEventListener("dragover", (event) => {
    if (!draggedTrackId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    insertPlaceholderAt(event.clientY);
  });

  list.addEventListener("drop", (event) => {
    if (!draggedTrackId) return;
    event.preventDefault();
    const children = Array.from(list.children);
    const placeholderIndex = children.indexOf(placeholder);
    if (placeholderIndex === -1) return;
    const targetIndex = children
      .slice(0, placeholderIndex)
      .filter((el) => el.classList.contains("track-card") && !el.classList.contains("is-dragging")).length;
    moveTrackToIndex(draggedTrackId, targetIndex);
  });

  list.addEventListener("dragleave", (event) => {
    if (!draggedTrackId) return;
    if (event.relatedTarget && list.contains(event.relatedTarget)) return;
    clearPlaceholder();
  });

  const ordered = getOrderedTracks();
  ordered.forEach((track) => {
    const card = document.createElement("div");
    card.className = "track-card";
    card.dataset.trackId = track.id;
    const left = document.createElement("div");
    left.className = "track-left";
    const headerRow = document.createElement("div");
    headerRow.className = "track-left-header";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "track-name-input";
    nameInput.value = track.name || "";
    nameInput.placeholder = "Track name";
    nameInput.addEventListener("input", () => {
      track.name = nameInput.value.trim() || "Untitled track";
      refreshLensInputs();
    });
    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "track-drag-handle";
    dragHandle.title = "Drag to reorder track";
    dragHandle.textContent = "::";
    dragHandle.draggable = true;
    dragHandle.addEventListener("dragstart", (event) => {
      draggedTrackId = track.id;
      event.dataTransfer.setData("text/plain", track.id);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
      placeholder.style.height = `${card.offsetHeight}px`;
      insertPlaceholderAt(event.clientY);
    });
    dragHandle.addEventListener("dragend", () => {
      draggedTrackId = null;
      card.classList.remove("is-dragging");
      clearPlaceholder();
    });
    headerRow.appendChild(nameInput);
    headerRow.appendChild(dragHandle);
    left.appendChild(headerRow);

    const actions = document.createElement("div");
    actions.className = "track-actions";
    const lensMenu = document.createElement("div");
    lensMenu.className = "track-menu";
    const lensBtn = document.createElement("button");
    lensBtn.type = "button";
    lensBtn.className = "track-menu-trigger ghost";
    lensBtn.textContent = "+ Lens";
    lensMenu.appendChild(lensBtn);
    const lensList = document.createElement("div");
    lensList.className = "track-menu-list";
    if (!availableLenses.length) {
      const empty = document.createElement("div");
      empty.className = "track-menu-empty";
      empty.textContent = "No lenses available";
      lensList.appendChild(empty);
    } else {
      availableLenses.forEach((lens) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "track-menu-item";
        item.textContent = lens.meta.name;
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          lensMenu.classList.remove("is-open");
          const instance = createInstanceForTrack(lens, track.id);
          addLensToTrack(track, instance.lensInstanceId);
          seedLensDefaults(instance);
          (lens.generatorInputs || []).forEach((spec) => {
            instance.generatorInputValues[spec.key] = loadLensSpecValue(lens.meta.id, "inputs", spec);
          });
          (lens.params || []).forEach((spec) => {
            instance.paramsValues[spec.key] = loadLensSpecValue(lens.meta.id, "params", spec);
          });
          setFocusedLensInstance(lens.meta.id, instance.lensInstanceId);
          renderTrackWorkspace();
        });
        lensList.appendChild(item);
      });
    }
    lensMenu.appendChild(lensList);
    lensBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const otherMenus = container.querySelectorAll(".track-menu.is-open");
      otherMenus.forEach((menu) => {
        if (menu !== lensMenu) {
          menu.classList.remove("is-open");
        }
      });
      lensMenu.classList.toggle("is-open");
    });
    const removeTrackBtn = document.createElement("button");
    removeTrackBtn.type = "button";
    removeTrackBtn.className = "ghost icon-label";
    removeTrackBtn.appendChild(icon("trash-2"));
    const removeTrackLabel = document.createElement("span");
    removeTrackLabel.className = "label";
    removeTrackLabel.textContent = "Remove Track";
    removeTrackBtn.appendChild(removeTrackLabel);
    removeTrackBtn.addEventListener("click", () => {
      const hasLenses = track.lensInstanceIds.length;
      if (hasLenses && !window.confirm("Remove this track and all its lenses?")) return;
      track.lensInstanceIds.slice().forEach((id) => removeLensInstance(id));
      state.tracks = state.tracks.filter((entry) => entry.id !== track.id);
      renderTrackWorkspace();
    });
    actions.appendChild(lensMenu);
    actions.appendChild(removeTrackBtn);
    left.appendChild(actions);

    const body = document.createElement("div");
    body.className = "track-body";

    const lensContainer = document.createElement("div");
    lensContainer.className = "track-lens-list";
    if (!track.lensInstanceIds.length) {
      const placeholder = document.createElement("div");
      placeholder.className = "track-placeholder";
      placeholder.textContent = "No lenses in this track.";
      lensContainer.appendChild(placeholder);
    } else {
      track.lensInstanceIds.forEach((instanceId, idx) => {
        const instance = lensInstances.get(instanceId);
        if (!instance) return;
        const panel = buildLensPanel(instance, { className: "track-lens-item" });
        const actionsContainer = panel.querySelector(".lens-panel-actions");
        if (actionsContainer) {
          const upBtn = document.createElement("button");
          upBtn.type = "button";
          upBtn.className = "ghost";
          upBtn.textContent = "Up";
          upBtn.disabled = idx === 0;
          upBtn.addEventListener("click", () => moveLensInTrack(track.id, instanceId, -1));
          const downBtn = document.createElement("button");
          downBtn.type = "button";
          downBtn.className = "ghost";
          downBtn.textContent = "Down";
          downBtn.disabled = idx === track.lensInstanceIds.length - 1;
          downBtn.addEventListener("click", () => moveLensInTrack(track.id, instanceId, 1));
          actionsContainer.appendChild(upBtn);
          actionsContainer.appendChild(downBtn);
        }
        lensContainer.appendChild(panel);
      });
    }
    body.appendChild(lensContainer);

    card.appendChild(left);
    card.appendChild(body);
    list.appendChild(card);
  });
  container.appendChild(list);
  syncFocusedLensInstances();
  renderFocusedDashboard();
  refreshLensInputs();
  renderWorkspace2();
}

function renderFocusedDashboard() {
  focusedLensInstances.forEach((instanceId, lensId) => {
    const instance = lensInstances.get(instanceId);
    const elements = dashboardLensElements.get(lensId);
    if (!instance || !elements) return;
    bindLensInputsForInstance(instance, elements);
    renderLensNotices(elements.notices, instance);
    const draftHandlers = {
        onSelect: (draft) => {
          const idx = instance.currentDrafts.findIndex((item) => item.draftId === draft.draftId);
          instance.activeDraftIndex = idx >= 0 ? idx : null;
          instance.activeDraftId = draft.draftId;
        instance.activeDraft = idx >= 0 ? instance.currentDrafts[idx] : null;
        renderLensDrafts(elements.drafts, instance, draftHandlers);
    if (lensId === "intervalPlacement") {
      syncIntervalPlacementState(instance);
      const rec = state.selected;
      if (rec) {
        localStorage.setItem(storageKeys.selectedPerm, rec.perm.join(" "));
      }
      render();
      renderWorkspaceIntervalPlacementViz(instance);
    }
        propagateActiveDrafts(instance);
        refreshLensInputs();
      },
      onAddToInventory: addDraftToInventory,
      onAddToDesk: addDraftToDesk
    };
    renderLensDrafts(elements.drafts, instance, draftHandlers);
    setLensElementLabels(instance, elements);
    if (lensId === "intervalPlacement") {
      syncIntervalPlacementState(instance);
    }
    if (lensId === "euclideanPatterns") {
      renderEuclidPanel(instance, elements);
    }
  });
}

function renderEuclidInputs(container, instance, lens) {
  if (!container) return;
  container.innerHTML = "";
  const specs = lens.generatorInputs || [];
  const controls = new Map();
  const grid = document.createElement("div");
  grid.className = "knob-grid";
  container.appendChild(grid);

  function updateKnobVisual(control) {
    const { input, dial, valueEl } = control;
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const range = max - min || 1;
    const ratio = (value - min) / range;
    const angle = -135 + ratio * 270;
    dial.style.setProperty("--knob-rotate", `${angle}deg`);
    valueEl.textContent = `${value}`;
  }

  function buildKnob(spec, min, max, step) {
    const field = document.createElement("div");
    field.className = "knob-field";
    const label = document.createElement("div");
    label.className = "knob-label";
    label.textContent = spec.label;
    const wrap = document.createElement("div");
    wrap.className = "knob-wrap";
    const knob = document.createElement("div");
    knob.className = "knob";
    const dial = document.createElement("div");
    dial.className = "knob-dial";
    const input = document.createElement("input");
    input.type = "range";
    input.min = `${min}`;
    input.max = `${max}`;
    input.step = `${step}`;
    input.value = `${instance.generatorInputValues[spec.key] ?? spec.default ?? min}`;
    const valueEl = document.createElement("div");
    valueEl.className = "knob-value";
    knob.appendChild(dial);
    knob.appendChild(input);
    wrap.appendChild(knob);
    wrap.appendChild(valueEl);
    field.appendChild(label);
    field.appendChild(wrap);
    grid.appendChild(field);

    const control = { input, dial: knob, valueEl };
    controls.set(spec.key, control);
    updateKnobVisual(control);

    function clampValue(value) {
      const minVal = Number(input.min);
      const maxVal = Number(input.max);
      if (!Number.isFinite(value)) return minVal;
      return Math.min(maxVal, Math.max(minVal, value));
    }

    function updateStepDependent(stepsValue) {
      const pulsesCtrl = controls.get("pulses");
      const rotationCtrl = controls.get("rotation");
      if (pulsesCtrl) {
        pulsesCtrl.input.max = `${stepsValue}`;
        if (Number(pulsesCtrl.input.value) > stepsValue) {
          pulsesCtrl.input.value = `${stepsValue}`;
          bindLensInputHandlers(instance, specs, "pulses", pulsesCtrl.input.value);
          storeLensSpecValue(lens.meta.id, "inputs", "pulses", instance.generatorInputValues.pulses);
        }
        updateKnobVisual(pulsesCtrl);
      }
      if (rotationCtrl) {
        rotationCtrl.input.min = `${-stepsValue}`;
        rotationCtrl.input.max = `${stepsValue}`;
        const rotValue = Number(rotationCtrl.input.value);
        if (rotValue > stepsValue) rotationCtrl.input.value = `${stepsValue}`;
        if (rotValue < -stepsValue) rotationCtrl.input.value = `${-stepsValue}`;
        bindLensInputHandlers(instance, specs, "rotation", rotationCtrl.input.value);
        storeLensSpecValue(lens.meta.id, "inputs", "rotation", instance.generatorInputValues.rotation);
        updateKnobVisual(rotationCtrl);
      }
    }

    function applyValue(nextValue) {
      const minVal = Number(input.min);
      const maxVal = Number(input.max);
      const stepValue = Number(input.step) || 1;
      const stepped = Math.round((nextValue - minVal) / stepValue) * stepValue + minVal;
      const clamped = clampValue(stepped);
      input.value = `${clamped}`;
      bindLensInputHandlers(instance, specs, spec.key, input.value);
      storeLensSpecValue(lens.meta.id, "inputs", spec.key, instance.generatorInputValues[spec.key]);
      if (spec.key === "steps") {
        updateStepDependent(Number(instance.generatorInputValues.steps));
      }
      updateKnobVisual(control);
      scheduleLens(instance);
    }

    input.addEventListener("input", () => {
      applyValue(Number(input.value));
    });

    knob.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      knob.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startValue = Number(input.value);
      const stepValue = Number(input.step) || 1;
      const dragScale = stepValue * 0.25;
      function onMove(moveEvent) {
        const delta = startY - moveEvent.clientY;
        const nextValue = startValue + delta * dragScale;
        applyValue(nextValue);
      }
      function onUp(upEvent) {
        knob.releasePointerCapture(upEvent.pointerId);
        knob.removeEventListener("pointermove", onMove);
        knob.removeEventListener("pointerup", onUp);
        knob.removeEventListener("pointercancel", onUp);
      }
      knob.addEventListener("pointermove", onMove);
      knob.addEventListener("pointerup", onUp);
      knob.addEventListener("pointercancel", onUp);
    });

    knob.addEventListener("dblclick", (event) => {
      event.preventDefault();
      applyValue(spec.default ?? min);
    });

    knob.addEventListener("wheel", (event) => {
      event.preventDefault();
      const stepValue = Number(input.step) || 1;
      const delta = event.deltaY < 0 ? stepValue : -stepValue;
      applyValue(Number(input.value) + delta);
    }, { passive: false });

    return control;
  }

  specs.forEach((spec) => {
    if (spec.kind !== "int" && spec.kind !== "number") return;
    if (spec.key === "steps") {
      buildKnob(spec, spec.min ?? 1, 32, 1);
      return;
    }
    if (spec.key === "pulses") {
      const stepsValue = Number(instance.generatorInputValues.steps ?? 8);
      buildKnob(spec, spec.min ?? 0, stepsValue, 1);
      return;
    }
    if (spec.key === "rotation") {
      const stepsValue = Number(instance.generatorInputValues.steps ?? 8);
      buildKnob(spec, -stepsValue, stepsValue, 1);
      return;
    }
    buildKnob(spec, spec.min ?? 0, spec.max ?? 100, spec.step ?? 1);
  });
}

function renderEuclidParams(container, instance, lens) {
  if (!container) return;
  container.innerHTML = "";
  const spec = (lens.params || []).find((entry) => entry.key === "outputKind");
  if (!spec) return;
  const field = document.createElement("div");
  field.className = "knob-field";
  const label = document.createElement("div");
  label.className = "knob-label";
  label.textContent = spec.label;
  const buttons = document.createElement("div");
  buttons.className = "toggle-buttons knob-actions";
  (spec.options || []).forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toggle-btn ghost";
    btn.textContent = option.label ?? String(option.value);
    const isActive = instance.paramsValues[spec.key] === option.value;
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("ghost", !isActive);
    btn.addEventListener("click", () => {
      instance.paramsValues[spec.key] = option.value;
      storeLensSpecValue(lens.meta.id, "params", spec.key, option.value);
      renderEuclidParams(container, instance, lens);
      scheduleLens(instance);
    });
    buttons.appendChild(btn);
  });
  field.appendChild(label);
  field.appendChild(buttons);
  container.appendChild(field);
}

function formatEuclidPreview(payload) {
  if (!payload) return "No draft yet.";
  const kind = payload.kind;
  const values = Array.isArray(payload.values) ? payload.values : [];
  if (kind === "indexMask") {
    return `[${values.join(", ")}]`;
  }
  return values.join("");
}

function drawEuclidWheelOn(canvas, payload) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!payload) return;
  const domain = payload.domain || {};
  const steps = Number.isFinite(domain.steps) ? domain.steps : 0;
  if (!steps) return;
  const values = Array.isArray(payload.values) ? payload.values : [];
  let mask = [];
  if (payload.kind === "indexMask") {
    mask = new Array(steps).fill(0);
    values.forEach((idx) => {
      if (Number.isFinite(idx) && idx >= 0 && idx < steps) {
        mask[idx] = 1;
      }
    });
  } else {
    mask = values.slice(0, steps).map((v) => (v ? 1 : 0));
  }
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.min(width, height) * 0.42;
  const activeIndices = [];
  mask.forEach((value, idx) => {
    if (value) activeIndices.push(idx);
  });
  if (activeIndices.length >= 2) {
    ctx.beginPath();
    activeIndices.forEach((idx, i) => {
      const angle = -Math.PI / 2 + (idx / steps) * Math.PI * 2;
      const x = cx + Math.cos(angle) * outerRadius;
      const y = cy + Math.sin(angle) * outerRadius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }

  for (let i = 0; i < steps; i++) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI * 2;
    const x = cx + Math.cos(angle) * outerRadius;
    const y = cy + Math.sin(angle) * outerRadius;
    const isOn = mask[i] === 1;
    const dotRadius = isOn ? 6 : 4;
    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    if (isOn) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const labelRadius = outerRadius + 14;
    const lx = cx + Math.cos(angle) * labelRadius;
    const ly = cy + Math.sin(angle) * labelRadius;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "11px Figtree, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i), lx, ly);
  }
}

function drawEuclidWheel(payload) {
  drawEuclidWheelOn(els.euclidWheel, payload);
}

function renderEuclidPanel(instance, elements = null) {
  const payload = instance.evaluateResult && instance.evaluateResult.vizModel
    ? instance.evaluateResult.vizModel.pattern
    : null;
  const previewEl = elements && elements.euclidPreview ? elements.euclidPreview : els.euclidPreview;
  if (previewEl) {
    previewEl.textContent = formatEuclidPreview(payload);
  }
  const canvas = elements && elements.euclidCanvas ? elements.euclidCanvas : els.euclidWheel;
  drawEuclidWheelOn(canvas, payload);
}

function copyText(text) {
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}











































function shouldIgnoreShortcut(event) {
  const target = event.target;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

let recomputeTimer = null;
function scheduleRecompute() {
  if (recomputeTimer) {
    clearTimeout(recomputeTimer);
  }
  recomputeTimer = setTimeout(() => {
    saveInputs();
    recompute();
  }, 150);
}

function bindLayoutSplitter() {
  const splitter = els.layoutSplitter;
  if (!splitter) return;
  const layout = splitter.parentElement;
  if (!layout) return;
  const stored = localStorage.getItem(storageKeys.layoutSplit);
  if (stored) {
    const value = parseFloat(stored);
    if (Number.isFinite(value)) {
      const clamped = Math.max(30, Math.min(70, value));
      layout.style.setProperty("--layout-left", `${clamped}%`);
      layout.style.setProperty("--layout-right", `${100 - clamped}%`);
    }
  }
  const onMouseMove = (event) => {
    const rect = layout.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const raw = (x / rect.width) * 100;
    const clamped = Math.max(30, Math.min(70, raw));
    layout.style.setProperty("--layout-left", `${clamped}%`);
    layout.style.setProperty("--layout-right", `${100 - clamped}%`);
  };
  const onMouseUp = () => {
    layout.classList.remove("resizing");
    const current = layout.style.getPropertyValue("--layout-left");
    if (current) {
      const value = parseFloat(current);
      if (Number.isFinite(value)) {
        localStorage.setItem(storageKeys.layoutSplit, value.toFixed(2));
      }
    }
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };
  splitter.addEventListener("mousedown", (event) => {
    event.preventDefault();
    layout.classList.add("resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

function bindInstrumentSplitter() {
  const splitter = els.instrumentSplitter;
  if (!splitter) return;
  const layout = splitter.parentElement;
  if (!layout) return;
  const stored = localStorage.getItem(storageKeys.instrumentSplit);
  if (stored) {
    const value = parseFloat(stored);
    if (Number.isFinite(value)) {
      const clamped = Math.max(20, Math.min(80, value));
      layout.style.setProperty("--instrument-left", `${clamped}%`);
      layout.style.setProperty("--instrument-right", `${100 - clamped}%`);
    }
  }
  const onMouseMove = (event) => {
    const rect = layout.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const raw = (x / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, raw));
    layout.style.setProperty("--instrument-left", `${clamped}%`);
    layout.style.setProperty("--instrument-right", `${100 - clamped}%`);
  };
  const onMouseUp = () => {
    layout.classList.remove("resizing");
    const current = layout.style.getPropertyValue("--instrument-left");
    if (current) {
      const value = parseFloat(current);
      if (Number.isFinite(value)) {
        localStorage.setItem(storageKeys.instrumentSplit, value.toFixed(2));
      }
    }
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    renderKeyboard();
    renderFretboard();
  };
  splitter.addEventListener("mousedown", (event) => {
    event.preventDefault();
    layout.classList.add("resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

const workspacePanels = {
  homes: new Map()
};

function capturePanelHome(panel) {
  if (!panel || workspacePanels.homes.has(panel)) return;
  workspacePanels.homes.set(panel, {
    parent: panel.parentElement,
    nextSibling: panel.nextElementSibling
  });
}

function restorePanelHome(panel) {
  const home = workspacePanels.homes.get(panel);
  if (!home || !home.parent) return;
  if (home.nextSibling && home.nextSibling.parentElement === home.parent) {
    home.parent.insertBefore(panel, home.nextSibling);
  } else {
    home.parent.appendChild(panel);
  }
}

function setDockCollapsed(collapsed) {
  if (!els.workspaceDock) return;
  els.workspaceDock.classList.toggle("is-collapsed", collapsed);
  if (els.workspaceDockSplitter) {
    els.workspaceDockSplitter.classList.toggle("is-hidden", collapsed);
  }
  if (els.dockToggleBtn) {
    els.dockToggleBtn.textContent = collapsed ? "Show" : "Hide";
  }
  localStorage.setItem(storageKeys.workspaceDockCollapsed, collapsed ? "1" : "0");
}

function initWorkspaceDock() {
  if (!els.workspaceDock) return null;
  if (els.workspaceDock.dataset.ready !== "true") {
    els.workspaceDock.dataset.ready = "true";
    const storedHeight = localStorage.getItem(storageKeys.workspaceDockHeight);
    if (storedHeight && els.workspaceView) {
      const parsed = parseFloat(storedHeight);
      if (Number.isFinite(parsed)) {
        els.workspaceView.style.setProperty("--dock-height", `${parsed}px`);
      }
    }
    const collapsed = localStorage.getItem(storageKeys.workspaceDockCollapsed) === "1";
    if (els.dockToggleBtn) {
      els.dockToggleBtn.addEventListener("click", () => {
        const isCollapsed = els.workspaceDock.classList.contains("is-collapsed");
        setDockCollapsed(!isCollapsed);
      });
    }
    if (els.workspaceDockSplitter) {
      els.workspaceDockSplitter.addEventListener("mousedown", (event) => {
        if (els.workspaceDock.classList.contains("is-collapsed")) return;
        event.preventDefault();
        const view = els.workspaceView;
        if (!view) return;
        const onMouseMove = (moveEvent) => {
          const rect = view.getBoundingClientRect();
          const raw = rect.bottom - moveEvent.clientY;
          const minDock = 120;
          const maxDock = Math.max(minDock, rect.height - 160);
          const clamped = Math.max(minDock, Math.min(maxDock, raw));
          view.style.setProperty("--dock-height", `${clamped}px`);
          localStorage.setItem(storageKeys.workspaceDockHeight, `${clamped}`);
        };
        const onMouseUp = () => {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });
    }
    setDockCollapsed(collapsed);
  }
  const inventoryPanel = document.querySelector(".inventory-panel");
  const deskPanel = document.querySelector(".desk-panel");
  [inventoryPanel, deskPanel].forEach(capturePanelHome);
  return { inventoryPanel, deskPanel };
}

function mountDockPanels(panels) {
  if (!els.workspaceDockBody) return;
  els.workspaceDockBody.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "workspace-dock-grid";
  if (panels && panels.inventoryPanel) grid.appendChild(panels.inventoryPanel);
  if (panels && panels.deskPanel) grid.appendChild(panels.deskPanel);
  els.workspaceDockBody.appendChild(grid);
}

if (els.guitarTuning) {
  els.guitarTuning.addEventListener("input", () => {
    saveInputs();
    renderFretboard();
  });
  els.guitarTuning.addEventListener("change", () => {
    saveInputs();
    renderFretboard();
  });
}
if (els.deskGridStep) {
  els.deskGridStep.addEventListener("input", () => {
    saveInputs();
    renderDesk();
  });
  els.deskGridStep.addEventListener("change", () => {
    saveInputs();
    renderDesk();
  });
}
if (els.filter) {
  els.filter.addEventListener("input", () => {
    localStorage.setItem(storageKeys.filter, els.filter.value);
    updateTable();
  });
}
if (els.midiOut) {
  els.midiOut.addEventListener("click", () => {
    requestMidiAccess();
  });
  els.midiOut.addEventListener("change", () => {
    localStorage.setItem(storageKeys.midiOut, els.midiOut.value);
  });
}
if (els.midiPreview) {
  els.midiPreview.addEventListener("click", previewSelected);
}
if (els.deskRemoveBtn) {
  els.deskRemoveBtn.addEventListener("click", () => {
    if (!state.selectedDeskId) return;
    const removed = removeSelectedDeskItem();
    if (removed) {
      saveDesk();
      renderDesk();
      els.status.textContent = "Removed clip.";
    }
  });
}
bindInventoryActions();
bindInventorySearch();
window.addEventListener("resize", () => {
  renderPlot();
  renderKeyboard();
  renderFretboard();
});
bindLayoutSplitter();
bindInstrumentSplitter();
window.addEventListener("keydown", (event) => {
  if (shouldIgnoreShortcut(event)) return;
  if (event.key === "v" || event.key === "V") {
    event.preventDefault();
    previewSelected();
    return;
  }
  if (event.key === "b" || event.key === "B") {
    event.preventDefault();
    playIntervalSequence();
    return;
  }
  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    playArpeggioSequence();
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const recs = state.resultsByO[state.activeO] || [];
    if (!recs.length) return;
    const current = state.selected || recs[0];
    let idx = recs.findIndex((r) => r === current);
    if (idx < 0) idx = 0;
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    const nextIdx = (idx + delta + recs.length) % recs.length;
    const next = recs[nextIdx];
    if (next) {
      event.preventDefault();
      state.selected = next;
      localStorage.setItem(storageKeys.selectedPerm, next.perm.join(" "));
      render();
    }
  }
});

bindFavoritePromptButtons();
if (els.plot) {
  els.plot.addEventListener("mousemove", (event) => {
    const rect = els.plot.getBoundingClientRect();
    const scaleX = els.plot.width / rect.width;
    const scaleY = els.plot.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
    const L = state.activeO * state.params.edoSteps;
    let hit = null;
    if (rec) {
      const pad = 48;
      const height = els.plot.height - pad * 2;
      const yValue = ((els.plot.height - pad - y) / height) * L;
      const nearest = rec.pitches.reduce((best, p) => {
        const dist = Math.abs(p - yValue);
        if (!best || dist < best.dist) return { pitch: p, dist };
        return best;
      }, null);
      if (nearest && nearest.dist <= 0.4) {
        hit = nearest.pitch;
      }
    }
    if (hit === null) {
      setHoverPitch(null);
      return;
    }
    setHoverPitch(hit);
  });

  els.plot.addEventListener("mouseleave", () => {
    setHoverPitch(null);
  });
}

if (els.selectedInfo) {
  els.selectedInfo.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (!target) return;
    if (!target.matches(".pitch-item, .pitch-name, .pitch-pc")) return;
    const pitch = parseInt(target.dataset.pitch, 10);
    if (!Number.isFinite(pitch)) return;
    setHoverPitch(pitch);
  });
}

initLayoutMode();
loadInputs();
renderMidiParams();
loadFavorites();
loadInventory();
loadDesk();
setGuardReporter((message) => {
  if (els.status) {
    els.status.textContent = message;
  }
});
initLensMode();
bindLensNavScroll();
initDashboardLensElements();
const loadedWorkspace = loadWorkspace();
if (!loadedWorkspace) {
  initDefaultTracks();
}
if (typeof window !== "undefined") {
  window.__appState = state;
  window.__lensInstances = lensInstances;
}
renderTrackWorkspace();
const panels = initWorkspaceDock();
workspaceDockPanels = panels;
if (panels) {
  mountDockPanels(panels);
}
renderInventory();
renderDesk();
render();

if (import.meta.env && import.meta.env.DEV) {
  import("./dev/selfTest.js");
}
