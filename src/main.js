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
  renderTransformerInputs
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
import { ensureSingleInputTransformerSelections } from "./transformerPipeline.js";

function parseIntervals(text) {
  return text
    .split(/[,\s]+/)
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}





function rhoPlace(anchor, length, rho) {
  // Continuous placement intent (not directly used for lattice endpoints).
  const lowStar = anchor - rho * length;
  const highStar = anchor + (1 - rho) * length;
  return [lowStar, highStar];
}

function quantizedSplit(length, rho, oddBias) {
  // Lattice projection policy: choose integer down/up to preserve length.
  // Odd-bias only affects the rounding choice for odd lengths.
  const eps = 1e-9;
  const downIdeal = rho * length;
  let down;
  if (length % 2 === 0) {
    down = Math.round(downIdeal);
  } else {
    down = oddBias === "up"
      ? Math.floor(downIdeal + eps)
      : Math.ceil(downIdeal - eps);
  }
  down = Math.max(0, Math.min(length, down));
  return { down, up: length - down };
}



// Placement engine utilities.
function centerBoundsForPerm(L, perm, rho) {
  return perm.map((d, idx) => {
    const cmin = rho * d;
    const cmax = L - (1 - rho) * d;
    const bias = state.oddBias[idx];
    const split = quantizedSplit(d, rho, bias);
    const min = Math.max(cmin, split.down);
    const max = Math.min(cmax, L - split.up);
    if (min > max) {
      return { min: cmin, max: cmax };
    }
    return { min, max };
  });
}

function neutralCentersFromBounds(bounds) {
  const n = bounds.length;
  if (n === 0) return [];
  return bounds.map((b, idx) => {
    const t = n === 1 ? 0.5 : idx / (n - 1);
    return b.min + t * (b.max - b.min);
  });
}

function projectedPairwiseSolve(initialCenters, bounds, iterations, step, accumulateForces) {
  const n = initialCenters.length;
  const centers = initialCenters.slice();
  const forces = new Array(n).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    forces.fill(0);
    accumulateForces(centers, forces);
    for (let i = 0; i < n; i++) {
      const next = centers[i] + step * forces[i];
      centers[i] = clamp(next, bounds[i].min, bounds[i].max);
    }
  }
  return centers;
}

function repulsionDeltasForPerm(perm, gamma, kappa, L) {
  const n = perm.length;
  const denom = Math.max(1e-9, L);
  const radii = perm.map((d) => Math.pow(d / denom, gamma));
  const deltas = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const delta = kappa * (radii[i] + radii[j]);
      deltas[i][j] = delta;
      deltas[j][i] = delta;
    }
  }
  return { radii, deltas };
}

function accumulateRepulsionForces(centers, forces, deltas, lambda) {
  const n = centers.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = centers[i] - centers[j];
      const dabs = Math.abs(dist);
      const v = deltas[i][j] - dabs;
      if (v > 0) {
        const sign = dist >= 0 ? 1 : -1;
        const F = 2 * lambda * v * sign;
        forces[i] += F;
        forces[j] -= F;
      }
    }
  }
}

function repulsionDiagnostics(centers, deltas, lambda) {
  const n = centers.length;
  let minDistance = Number.POSITIVE_INFINITY;
  let energy = 0;
  const violations = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = Math.abs(centers[i] - centers[j]);
      minDistance = Math.min(minDistance, dist);
      const v = deltas[i][j] - dist;
      if (v > 0) {
        energy += lambda * v * v;
        violations.push({ i, j, violation: v });
      }
    }
  }
  if (!Number.isFinite(minDistance)) minDistance = 0;
  return { minDistance, energy, violations };
}

function minPairwiseDistance(centers) {
  const n = centers.length;
  if (n < 2) return 0;
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      minDistance = Math.min(minDistance, Math.abs(centers[i] - centers[j]));
    }
  }
  return Number.isFinite(minDistance) ? minDistance : 0;
}

function anchorRangeFromBounds(bounds) {
  if (!bounds || !bounds.length) return null;
  let amin = Number.POSITIVE_INFINITY;
  let amax = Number.NEGATIVE_INFINITY;
  bounds.forEach((b) => {
    amin = Math.min(amin, b.min);
    amax = Math.max(amax, b.max);
  });
  if (!Number.isFinite(amin) || !Number.isFinite(amax)) return null;
  return { amin, amax };
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

function createStableId(prefix) {
  const base = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}_${base}` : base;
}

function getOrderedTracks() {
  return Array.isArray(state.tracks) ? state.tracks.slice() : [];
}

function getTrackNumber(trackId) {
  const ordered = getOrderedTracks();
  const index = ordered.findIndex((track) => track.id === trackId);
  return index >= 0 ? index + 1 : 0;
}

function getGeneratorLabel(trackId) {
  const number = getTrackNumber(trackId);
  return number ? `${number}G` : "G";
}

function getTransformerLabel(trackId, transformerInstanceId) {
  const track = getTrackById(trackId);
  if (!track) return "T";
  const idx = track.transformerInstanceIds.indexOf(transformerInstanceId);
  const number = getTrackNumber(trackId);
  const k = idx >= 0 ? idx + 1 : 0;
  if (!number || !k) return `${number || "?"}G?T`;
  return `${number}G${k}T`;
}

function getLensInstanceLabel(instance) {
  if (!instance) return "";
  if (instance.lane === "G") return getGeneratorLabel(instance.trackId);
  return getTransformerLabel(instance.trackId, instance.id);
}

function getLensHeaderLabel(instance) {
  const label = getLensInstanceLabel(instance);
  const name = instance.lens && instance.lens.meta ? instance.lens.meta.name : "Lens";
  return `${label} - ${name}`;
}

function getLensDraftsHeader(instance) {
  const label = getLensInstanceLabel(instance);
  const name = instance.lens && instance.lens.meta ? instance.lens.meta.name : "Lens";
  return `Drafts from ${label} - ${name}`;
}

function setFocusedLensInstance(lensId, instanceId) {
  if (!lensId || !instanceId) return;
  focusedLensInstances.set(lensId, instanceId);
  if (lensId === "intervalPlacement") {
    state.focusedIntervalPlacementId = instanceId;
  }
}

function getFocusedLensInstanceId(lensId) {
  return focusedLensInstances.get(lensId) || null;
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
    if (next) setFocusedLensInstance(lensId, next.id);
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

function renderWorkspaceIntervalPlacementViz(instance) {
  if (!instance) return;
  const visual = intervalPlacementVisualizers.get(instance.id);
  if (!visual) return;
  const rec = getRecordForInstance(instance);
  if (!rec) {
    drawPlotOnCanvas(visual.canvas, null, { updateHoverPoints: false });
    visual.summary.textContent = "No draft yet.";
    visual.selectedInfo.textContent = "";
    visual.hoverInfo.textContent = "";
    return;
  }
  drawPlotOnCanvas(visual.canvas, rec, { updateHoverPoints: false, targetHeight: 320 });
  const anchors = Array.isArray(rec.anchors) ? rec.anchors : [];
  const perm = Array.isArray(rec.perm) ? rec.perm : [];
  const pitches = Array.isArray(rec.pitches) ? rec.pitches : [];
  visual.summary.textContent = `anchors: ${anchors.join(" ")}`;
  visual.selectedInfo.textContent = perm.join(" ");
  visual.hoverInfo.textContent = pitches.join(" ");
}

function createTrack(name) {
  const track = {
    id: createStableId("track"),
    name: name || "Untitled track",
    generatorInstanceId: null,
    transformerInstanceIds: []
  };
  state.tracks.push(track);
  return track;
}

function listGeneratorLenses() {
  return listLenses().filter((lens) => lens.meta && lens.meta.kind === "generator");
}

function listTransformerLenses() {
  return listLenses().filter((lens) => lens.meta && lens.meta.kind === "transformer");
}

function createInstanceForTrack(lens, trackId, lane) {
  const instanceId = createStableId("lens");
  const instance = createLensInstance(lens, instanceId);
  instance.id = instanceId;
  instance.lensId = lens.meta.id;
  instance.kind = lens.meta.kind;
  instance.trackId = trackId;
  instance.lane = lane;
  lensInstances.set(instanceId, instance);
  state.lensInstancesById.set(instanceId, instance);
  applyGlobalMidiParamsToInstance(instance);
  return instance;
}

function serializeWorkspace() {
  return {
    version: 1,
    tracks: getOrderedTracks().map((track) => ({
      id: track.id,
      name: track.name || "Untitled track",
      generatorInstanceId: track.generatorInstanceId || null,
      transformerInstanceIds: Array.isArray(track.transformerInstanceIds)
        ? track.transformerInstanceIds.slice()
        : []
    })),
    lensInstances: Array.from(lensInstances.values()).map((instance) => ({
      id: instance.id,
      lensId: instance.lens && instance.lens.meta ? instance.lens.meta.id : instance.lensId,
      trackId: instance.trackId || null,
      lane: instance.lane || null,
      paramsValues: { ...(instance.paramsValues || {}) },
      generatorInputValues: { ...(instance.generatorInputValues || {}) },
      selectedInputDraftIdsByRole: { ...(instance.selectedInputDraftIdsByRole || {}) },
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
  if (!snapshot || !snapshot.id || !snapshot.lensId) return null;
  const lens = getLens(snapshot.lensId);
  if (!lens) return null;
  const instance = createLensInstance(lens, snapshot.id);
  instance.id = snapshot.id;
  instance.lensId = lens.meta.id;
  instance.kind = lens.meta.kind;
  instance.trackId = snapshot.trackId || null;
  instance.lane = snapshot.lane || null;
  instance.paramsValues = { ...instance.paramsValues, ...(snapshot.paramsValues || {}) };
  instance.generatorInputValues = { ...instance.generatorInputValues, ...(snapshot.generatorInputValues || {}) };
  instance.selectedInputDraftIdsByRole = { ...(snapshot.selectedInputDraftIdsByRole || {}) };
  instance.activeDraftId = snapshot.activeDraftId || null;
  instance.activeDraftIndex = Number.isFinite(snapshot.activeDraftIndex)
    ? snapshot.activeDraftIndex
    : null;
  lensInstances.set(instance.id, instance);
  state.lensInstancesById.set(instance.id, instance);
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
  state.tracks = parsed.tracks.map((track) => ({
    id: track.id,
    name: track.name || "Untitled track",
    generatorInstanceId: track.generatorInstanceId || null,
    transformerInstanceIds: Array.isArray(track.transformerInstanceIds)
      ? track.transformerInstanceIds.slice()
      : []
  }));
  lensInstances.clear();
  state.lensInstancesById.clear();
  focusedLensInstances.clear();
  state.focusedIntervalPlacementId = null;
  const createdIds = new Set();
  parsed.lensInstances.forEach((snapshot) => {
      const instance = restoreLensInstance(snapshot);
    if (instance) createdIds.add(instance.id);
  });
  state.tracks.forEach((track) => {
    if (track.generatorInstanceId && !createdIds.has(track.generatorInstanceId)) {
      track.generatorInstanceId = null;
    }
    track.transformerInstanceIds = (track.transformerInstanceIds || []).filter((id) => createdIds.has(id));
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
    draftsHeader: root.querySelector(".lens-column.lens-right .lens-title"),
    euclidPreview: root.querySelector("#euclidPreview"),
    euclidCanvas: root.querySelector("#euclidWheel")
  };
}

function setLensElementLabels(instance, elements) {
  if (!elements || !instance) return;
  if (elements.headerTitle) {
    elements.headerTitle.textContent = getLensHeaderLabel(instance);
  }
  if (elements.draftsHeader) {
    elements.draftsHeader.textContent = getLensDraftsHeader(instance);
  }
}

function getLensContext(instance) {
  return {
    lensId: instance.lens.meta.id,
    timestamp: Date.now()
  };
}

function addDraftToInventory(draft) {
  const name = (draft.summary && draft.summary.title) ? draft.summary.title : `${draft.type} draft`;
  const material = inventoryStore.add(draft, { name });
  if (!material) return null;
  state.lastCapturedMaterialId = material.id;
  state.selectedInventoryId = material.id;
  saveInventory();
  renderInventory();
  return material;
}

function addDraftToDesk(draft) {
  const material = addDraftToInventory(draft);
  if (!material) return null;
  const { lane, duration } = getDeskPlacementSettings();
  const start = nextDeskStart(lane);
  deskStore.add({ materialId: material.id, start, duration, lane });
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
      : instance.currentDrafts.findIndex((draft) => draft.id === instance.activeDraftId);
    if (activeIdx >= 0) {
      state.selected = viz.records[activeIdx] || null;
    }
  if (!state.selected) {
    state.selected = viz.records[0] || null;
  }
}

function handleLensUpdate(instance) {
  const lensId = instance.lens.meta.id;
  const trackElements = lensElements.get(instance.id);
  const focusedId = getFocusedLensInstanceId(lensId);
  const dashboardElements = focusedId === instance.id ? dashboardLensElements.get(lensId) : null;
  const targets = [trackElements, dashboardElements].filter(Boolean);
  let syncedIntervalPlacement = false;
  const isIntervalPlacement = lensId === "intervalPlacement";

  targets.forEach((elements) => {
    renderLensNotices(elements.notices, instance);
    setLensElementLabels(instance, elements);
    const draftHandlers = {
        onSelect: (draft) => {
          const idx = instance.currentDrafts.findIndex((item) => item.id === draft.id);
          instance.activeDraftIndex = idx >= 0 ? idx : null;
          instance.activeDraftId = draft.id;
          instance.activeDraft = idx >= 0 ? instance.currentDrafts[idx] : null;
          renderLensDrafts(elements.drafts, instance, draftHandlers);
          if (isIntervalPlacement) {
            setFocusedLensInstance(lensId, instance.id);
            const currentFocused = getFocusedLensInstanceId(lensId);
          if (currentFocused === instance.id) {
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
          ensureSingleInputTransformerSelections(getOrderedTracks(), lensInstances, scheduleLens);
          refreshTransformerInputs();
        },
      onAddToInventory: (draft) => {
        addDraftToInventory(draft);
      },
      onAddToDesk: (draft) => {
        addDraftToDesk(draft);
      }
    };
    renderLensDrafts(elements.drafts, instance, draftHandlers);
    if (lensId === "euclideanPatterns") {
      renderEuclidPanel(instance, elements);
    }
  });

  const focusedAfterTargets = getFocusedLensInstanceId(lensId);
  if (!syncedIntervalPlacement && isIntervalPlacement && focusedAfterTargets === instance.id) {
    syncIntervalPlacementState(instance);
    render();
    renderWorkspaceIntervalPlacementViz(instance);
  }
    if (instance.lane === "G") {
      ensureSingleInputTransformerSelections(getOrderedTracks(), lensInstances, scheduleLens);
    } else {
      ensureSingleInputTransformerSelections(getOrderedTracks(), lensInstances, scheduleLens);
    }
    refreshTransformerInputs();
  }

function scheduleLens(instance) {
  scheduleLensEvaluation(instance, {
    getContext: () => getLensContext(instance),
    getDraftCatalog: () => collectDraftCatalog(Array.from(lensInstances.values())),
    onUpdate: handleLensUpdate,
    debounceMs: 80
  });
}

function refreshTransformerInputs() {
  const draftCatalog = collectDraftCatalog(Array.from(lensInstances.values()));
  const metaById = buildDraftMetaById();
  const trackOrder = getOrderedTracks().map((track) => track.id);
  lensInstances.forEach((instance) => {
    if (instance.lens.meta.kind !== "transformer") return;
    const elements = lensElements.get(instance.id);
    if (elements) {
      renderTransformerInputs(
        elements.inputs,
        instance.lens.inputs,
        draftCatalog,
        instance.selectedInputDraftIdsByRole,
        (role, value) => {
          instance.selectedInputDraftIdsByRole[role] = value;
          scheduleLens(instance);
        },
        { metaById, trackOrder }
      );
    }
    const focusedId = getFocusedLensInstanceId(instance.lens.meta.id);
    if (focusedId === instance.id) {
      const dash = dashboardLensElements.get(instance.lens.meta.id);
      if (dash) {
        renderTransformerInputs(
          dash.inputs,
          instance.lens.inputs,
          draftCatalog,
          instance.selectedInputDraftIdsByRole,
          (role, value) => {
            instance.selectedInputDraftIdsByRole[role] = value;
            scheduleLens(instance);
          },
          { metaById, trackOrder }
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
  } else if (lens.meta.kind === "transformer" && Array.isArray(lens.inputs) && lens.inputs.length) {
    renderTransformerInputs(
      elements.inputs,
      lens.inputs,
      collectDraftCatalog(Array.from(lensInstances.values())),
      instance.selectedInputDraftIdsByRole,
      (role, value) => {
        instance.selectedInputDraftIdsByRole[role] = value;
        scheduleLens(instance);
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
    const instance = createInstanceForTrack(intervalLens, first.id, "G");
    first.generatorInstanceId = instance.id;
    setFocusedLensInstance(intervalLens.meta.id, instance.id);
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
    if (track.generatorInstanceId) {
      const instance = lensInstances.get(track.generatorInstanceId);
      if (instance) {
        const label = getGeneratorLabel(track.id);
        (instance.currentDrafts || []).forEach((draft) => {
          metaById.set(draft.id, {
            trackId: track.id,
            trackNumber,
            trackName,
            label,
            lensName: instance.lens.meta.name,
            lensInstanceId: instance.id,
            isActive: instance.activeDraftId === draft.id
          });
        });
      }
    }
      track.transformerInstanceIds.forEach((instanceId) => {
        const instance = lensInstances.get(instanceId);
        if (!instance) return;
        const label = getTransformerLabel(track.id, instanceId);
        (instance.currentDrafts || []).forEach((draft) => {
          metaById.set(draft.id, {
            trackId: track.id,
            trackNumber,
            trackName,
            label,
            lensName: instance.lens.meta.name,
            lensInstanceId: instance.id,
            isActive: instance.activeDraftId === draft.id
          });
        });
      });
  });
  return metaById;
}

function clearSelectionsForDraftIds(draftIds) {
  const toClear = new Set(draftIds);
  if (!toClear.size) return;
  lensInstances.forEach((instance) => {
    if (instance.lens.meta.kind !== "transformer") return;
    const selected = instance.selectedInputDraftIdsByRole || {};
    Object.keys(selected).forEach((role) => {
      if (toClear.has(selected[role])) {
        selected[role] = null;
      }
    });
    scheduleLens(instance);
  });
}

function pruneMissingSelections() {
  const draftIds = new Set(collectDraftCatalog(Array.from(lensInstances.values())).map((draft) => draft.id));
  lensInstances.forEach((instance) => {
    if (instance.lens.meta.kind !== "transformer") return;
    const selected = instance.selectedInputDraftIdsByRole || {};
    let changed = false;
    Object.keys(selected).forEach((role) => {
      if (selected[role] && !draftIds.has(selected[role])) {
        selected[role] = null;
        changed = true;
      }
    });
    if (changed) scheduleLens(instance);
  });
}

function propagateActiveDrafts(instance) {
  if (!instance) return;
  ensureSingleInputTransformerSelections(getOrderedTracks(), lensInstances, scheduleLens);
}

function removeLensInstance(instanceId) {
  const instance = lensInstances.get(instanceId);
  if (!instance) return;
  const track = getTrackById(instance.trackId);
  const removedDrafts = (instance.currentDrafts || []).map((draft) => draft.id);
  if (track) {
    if (instance.lane === "G") {
      track.generatorInstanceId = null;
    } else {
      track.transformerInstanceIds = track.transformerInstanceIds.filter((id) => id !== instanceId);
    }
  }
  lensInstances.delete(instanceId);
  state.lensInstancesById.delete(instanceId);
  intervalPlacementVisualizers.delete(instanceId);
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
  const headerTitle = document.createElement("h3");
  headerTitle.textContent = "Visualizer";
  const popoutBtn = document.createElement("button");
  popoutBtn.type = "button";
  popoutBtn.className = "ghost popout-btn";
  popoutBtn.textContent = "Pop-out";
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
  headerBar.appendChild(headerTitle);
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
  intervalPlacementVisualizers.set(instance.id, {
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

function moveTransformer(trackId, instanceId, delta) {
  const track = getTrackById(trackId);
  if (!track) return;
  const index = track.transformerInstanceIds.indexOf(instanceId);
  if (index < 0) return;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= track.transformerInstanceIds.length) return;
  moveArrayItem(track.transformerInstanceIds, index, nextIndex);
  renderTrackWorkspace();
}

  function seedTransformerDefaults(instance, trackId) {
    const track = getTrackById(trackId);
    if (!track || !track.generatorInstanceId) return;
    const generator = lensInstances.get(track.generatorInstanceId);
  if (!generator) return;
  const drafts = generator.currentDrafts || [];
  if (!drafts.length) return;
  (instance.lens.inputs || []).forEach((spec) => {
    if (instance.selectedInputDraftIdsByRole[spec.role]) return;
    const match = drafts.find((draft) => {
      if (!draft || !draft.type) return false;
      if (Array.isArray(spec.accepts) && spec.accepts.length && !spec.accepts.includes(draft.type)) return false;
      if (Array.isArray(spec.acceptsSubtypes) && spec.acceptsSubtypes.length && !spec.acceptsSubtypes.includes(draft.subtype)) return false;
      return true;
    });
      if (match && generator.activeDraftId === match.id) {
        instance.selectedInputDraftIdsByRole[spec.role] = match.id;
      } else if (match) {
        instance.selectedInputDraftIdsByRole[spec.role] = match.id;
      }
    });
  }

  function buildLensPanel(instance, opts = {}) {
  const lens = instance.lens;
  const root = document.createElement("section");
  root.className = `lens-layout lens-compact track-lens ${opts.className || ""}`.trim();
  root.dataset.lensInstanceId = instance.id;

  const rail = document.createElement("div");
  rail.className = "lens-rail";
  const railLabel = document.createElement("span");
  railLabel.textContent = instance.lane === "G" ? "Generator" : "Transformer";
  rail.appendChild(railLabel);
  root.appendChild(rail);

  const left = document.createElement("div");
  left.className = "lens-column lens-left";
  const leftHeader = document.createElement("div");
  leftHeader.className = "lens-column-header";
  const headerTitle = document.createElement("div");
  headerTitle.className = "lens-title";
  headerTitle.textContent = getLensHeaderLabel(instance);
  const headerActions = document.createElement("div");
  headerActions.className = "lens-panel-actions";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "ghost";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    const confirmMsg = instance.lane === "G"
      ? "Remove generator lens from this track?"
      : "Remove transformer lens from this track?";
      if (window.confirm(confirmMsg)) {
        removeLensInstance(instance.id);
        renderTrackWorkspace();
      }
    });
  headerActions.appendChild(removeBtn);
  if (lens.meta && lens.meta.id) {
    const focusBtn = document.createElement("button");
    focusBtn.type = "button";
    focusBtn.className = "ghost";
    focusBtn.textContent = "Focus";
    focusBtn.addEventListener("click", () => {
      setFocusedLensInstance(lens.meta.id, instance.id);
      renderFocusedDashboard();
      refreshTransformerInputs();
    });
    headerActions.appendChild(focusBtn);
  }
  leftHeader.appendChild(headerTitle);
  leftHeader.appendChild(headerActions);
  left.appendChild(leftHeader);
  const leftBody = document.createElement("div");
  leftBody.className = "lens-column-body";
  const inputSection = document.createElement("div");
  inputSection.className = "lens-section";
  const inputHeader = document.createElement("div");
  inputHeader.className = "lens-section-header";
  inputHeader.textContent = "Input";
  const inputBody = document.createElement("div");
  inputBody.className = "lens-section-body";
  inputBody.dataset.lensInputs = "true";
  inputSection.appendChild(inputHeader);
  inputSection.appendChild(inputBody);
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
  leftBody.appendChild(inputSection);
  leftBody.appendChild(paramSection);
  left.appendChild(leftBody);
  root.appendChild(left);

  const middle = document.createElement("div");
  middle.className = "lens-column lens-middle";
  const middleHeader = document.createElement("div");
  middleHeader.className = "lens-column-header";
  const middleTitle = document.createElement("div");
  middleTitle.className = "lens-title";
  middleTitle.textContent = "Visualizer";
  middleHeader.appendChild(middleTitle);
  middle.appendChild(middleHeader);
  const middleBody = document.createElement("div");
  middleBody.className = "lens-column-body";
  middleBody.dataset.lensViz = "true";
  let euclidPreview = null;
  let euclidCanvas = null;
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
    placeholder.textContent = "No visualizer for this lens.";
    middleBody.appendChild(placeholder);
  }
  middle.appendChild(middleBody);
  root.appendChild(middle);

  const right = document.createElement("div");
  right.className = "lens-column lens-right";
  const rightHeader = document.createElement("div");
  rightHeader.className = "lens-column-header";
  const draftsHeader = document.createElement("div");
  draftsHeader.className = "lens-title";
  draftsHeader.textContent = getLensDraftsHeader(instance);
  rightHeader.appendChild(draftsHeader);
  right.appendChild(rightHeader);
  const rightBody = document.createElement("div");
  rightBody.className = "lens-column-body";
  const notices = document.createElement("div");
  notices.className = "lens-notices";
  const drafts = document.createElement("div");
  drafts.className = "drafts-list";
  rightBody.appendChild(notices);
  rightBody.appendChild(drafts);
  right.appendChild(rightBody);
  root.appendChild(right);

  const elements = {
    root,
    inputs: inputBody,
    params: paramBody,
    notices,
    drafts,
    viz: middleBody,
    headerTitle,
    draftsHeader,
    euclidPreview,
    euclidCanvas
  };
  lensElements.set(instance.id, elements);
  bindLensInputsForInstance(instance, elements, { idPrefix: instance.id });
  scheduleLens(instance);
  return root;
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
      refreshTransformerInputs();
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
    const generatorMenu = document.createElement("div");
    generatorMenu.className = "track-menu";
    const generatorBtn = document.createElement("button");
    generatorBtn.type = "button";
    generatorBtn.className = "track-menu-trigger ghost";
    generatorBtn.textContent = "+ generator";
    generatorBtn.disabled = Boolean(track.generatorInstanceId);
    if (generatorBtn.disabled) generatorBtn.classList.add("is-disabled");
    generatorMenu.appendChild(generatorBtn);
    const generatorList = document.createElement("div");
    generatorList.className = "track-menu-list";
    const generatorLenses = listGeneratorLenses();
    if (!generatorLenses.length) {
      const empty = document.createElement("div");
      empty.className = "track-menu-empty";
      empty.textContent = "No generator lenses";
      generatorList.appendChild(empty);
    } else {
      generatorLenses.forEach((lens) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "track-menu-item";
        item.textContent = lens.meta.name;
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          if (track.generatorInstanceId) return;
          const instance = createInstanceForTrack(lens, track.id, "G");
          track.generatorInstanceId = instance.id;
          setFocusedLensInstance(lens.meta.id, instance.id);
          (lens.generatorInputs || []).forEach((spec) => {
            instance.generatorInputValues[spec.key] = loadLensSpecValue(lens.meta.id, "inputs", spec);
          });
          (lens.params || []).forEach((spec) => {
            instance.paramsValues[spec.key] = loadLensSpecValue(lens.meta.id, "params", spec);
          });
          renderTrackWorkspace();
        });
        generatorList.appendChild(item);
      });
    }
    generatorMenu.appendChild(generatorList);
    generatorBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      transformerMenu.classList.remove("is-open");
      generatorMenu.classList.toggle("is-open");
    });

    const transformerMenu = document.createElement("div");
    transformerMenu.className = "track-menu";
    const transformerBtn = document.createElement("button");
    transformerBtn.type = "button";
    transformerBtn.className = "track-menu-trigger ghost";
    transformerBtn.textContent = "+ transformer";
    transformerMenu.appendChild(transformerBtn);
    const transformerList = document.createElement("div");
    transformerList.className = "track-menu-list";
    const transformerLenses = listTransformerLenses();
    if (!transformerLenses.length) {
      const empty = document.createElement("div");
      empty.className = "track-menu-empty";
      empty.textContent = "No transformer lenses";
      transformerList.appendChild(empty);
    } else {
      transformerLenses.forEach((lens) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "track-menu-item";
        item.textContent = lens.meta.name;
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          const instance = createInstanceForTrack(lens, track.id, "T");
          track.transformerInstanceIds.push(instance.id);
          seedTransformerDefaults(instance, track.id);
          renderTrackWorkspace();
        });
        transformerList.appendChild(item);
      });
    }
    transformerMenu.appendChild(transformerList);
    transformerBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      generatorMenu.classList.remove("is-open");
      transformerMenu.classList.toggle("is-open");
    });
    const removeTrackBtn = document.createElement("button");
    removeTrackBtn.type = "button";
    removeTrackBtn.className = "ghost";
    removeTrackBtn.textContent = "Remove Track";
    removeTrackBtn.addEventListener("click", () => {
      const hasLenses = track.generatorInstanceId || track.transformerInstanceIds.length;
      if (hasLenses && !window.confirm("Remove this track and all its lenses?")) return;
      if (track.generatorInstanceId) removeLensInstance(track.generatorInstanceId);
      track.transformerInstanceIds.forEach((id) => removeLensInstance(id));
      state.tracks = state.tracks.filter((entry) => entry.id !== track.id);
      renderTrackWorkspace();
    });
    actions.appendChild(generatorMenu);
    actions.appendChild(transformerMenu);
    actions.appendChild(removeTrackBtn);
    left.appendChild(actions);

    const body = document.createElement("div");
    body.className = "track-body";

    const generatorLane = document.createElement("div");
    generatorLane.className = "track-lane";
    const generatorTitle = document.createElement("div");
    generatorTitle.className = "track-lane-title";
    generatorTitle.textContent = "Generator lane";
    generatorLane.appendChild(generatorTitle);
    if (track.generatorInstanceId) {
      const instance = lensInstances.get(track.generatorInstanceId);
      if (instance) {
        generatorLane.appendChild(buildLensPanel(instance));
      }
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "track-placeholder";
      placeholder.textContent = "No generator in this track.";
      generatorLane.appendChild(placeholder);
    }
    body.appendChild(generatorLane);

    const transformerLane = document.createElement("div");
    transformerLane.className = "track-lane";
    const transformerTitle = document.createElement("div");
    transformerTitle.className = "track-lane-title";
    transformerTitle.textContent = "Transformers lane";
    transformerLane.appendChild(transformerTitle);
    if (!track.transformerInstanceIds.length) {
      const placeholder = document.createElement("div");
      placeholder.className = "track-placeholder";
      placeholder.textContent = "No transformers in this track.";
      transformerLane.appendChild(placeholder);
    } else {
      track.transformerInstanceIds.forEach((instanceId, idx) => {
        const instance = lensInstances.get(instanceId);
        if (!instance) return;
        const panel = buildLensPanel(instance, { className: "track-transformer" });
        const actions = panel.querySelector(".lens-panel-actions");
        if (actions) {
          const upBtn = document.createElement("button");
          upBtn.type = "button";
          upBtn.className = "ghost";
          upBtn.textContent = "Up";
          upBtn.disabled = idx === 0;
          upBtn.addEventListener("click", () => moveTransformer(track.id, instanceId, -1));
          const downBtn = document.createElement("button");
          downBtn.type = "button";
          downBtn.className = "ghost";
          downBtn.textContent = "Down";
          downBtn.disabled = idx === track.transformerInstanceIds.length - 1;
          downBtn.addEventListener("click", () => moveTransformer(track.id, instanceId, 1));
          actions.appendChild(upBtn);
          actions.appendChild(downBtn);
        }
        transformerLane.appendChild(panel);
      });
    }
    body.appendChild(transformerLane);

    card.appendChild(left);
    card.appendChild(body);
    list.appendChild(card);
  });
  container.appendChild(list);
  syncFocusedLensInstances();
  renderFocusedDashboard();
  refreshTransformerInputs();
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
        const idx = instance.currentDrafts.findIndex((item) => item.id === draft.id);
        instance.activeDraftIndex = idx >= 0 ? idx : null;
        instance.activeDraftId = draft.id;
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
        refreshTransformerInputs();
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
if (panels) {
  mountDockPanels(panels);
}
renderInventory();
renderDesk();
render();
