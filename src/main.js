import { defaultParams, els, state, storageKeys } from "./state.js";
import { getLens } from "./lenses/lensRegistry.js";
import { loadDesk, loadInventory, saveDesk, saveInventory } from "./core/persistence.js";
import { inventoryStore, deskStore } from "./core/stores.js";
import { calibrateAlpha, computeReferenceG } from "./core/intervalMath.js";
import { engineLabelForId } from "./core/placementLabels.js";
import { renderKeyboard, renderFretboard } from "./ui/keyboardFretboard.js";
import {
  renderIntervals,
  renderPlot,
  setHoverPitch,
  updateHoverInfo
} from "./ui/plotPanel.js";
import {
  playArpeggioSequence,
  playIntervalSequence,
  previewSelected,
  requestMidiAccess
} from "./ui/midiControls.js";
import {
  renderOutputs,
  captureSelectedOutputs,
  sendSelectedOutputsToDesk,
  setOutputsPreviewHandler
} from "./ui/outputsPanel.js";
import {
  renderInventory,
  bindInventoryActions,
  bindInventorySearch
} from "./ui/inventoryPanel.js";
import {
  renderDesk,
  removeSelectedDeskItem
} from "./ui/deskPanel.js";
import {
  bindFavoritePromptButtons,
  favoriteKey,
  loadFavorites,
  renderFavorites,
  toggleFavorite
} from "./ui/favoritesPanel.js";

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
  const inputs = Array.from(container.querySelectorAll("input"));
  inputs.forEach((input) => {
    input.addEventListener("input", scheduleRecompute);
    input.addEventListener("change", scheduleRecompute);
  });
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
  const baseNote = parseInt(els.baseNote.value, 10) || 0;
  const baseOctave = parseInt(els.baseOctave.value, 10) || 4;
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
  renderOutputs();
  renderInventory();
  renderDesk();
  const rec = (state.resultsByO[state.activeO] || [])[0];
  if (rec) {
    els.anchorSummary.textContent = `anchors: ${rec.anchors.join(" ")}`;
  } else {
    els.anchorSummary.textContent = "";
  }
}

setOutputsPreviewHandler((record) => {
  state.selected = record;
  localStorage.setItem(storageKeys.selectedPerm, record.perm.join(" "));
  render();
});

function recompute() {
  const intervals = parseIntervals(els.intervals.value);
  if (intervals.length === 0) return;
  const edoSteps = Math.max(1, parseInt(els.edo.value, 10) || 12);
  const minO = Math.max(1, parseInt(els.minO.value, 10) || 1);
  const maxO = Math.max(minO, parseInt(els.maxO.value, 10) || minO);
  const anchorAlpha = clamp(readPlacementParam("anchorAlpha", defaultParams.anchorAlpha), 0, 1);
  const anchorBeta = Math.max(0, readPlacementParam("anchorBeta", defaultParams.anchorBeta));
  const anchorRho = clamp(readPlacementParam("anchorRho", defaultParams.anchorRho), 0, 1);
  const repulseGamma = Math.max(0, readPlacementParam("repulseGamma", defaultParams.repulseGamma));
  const repulseKappa = Math.max(0, readPlacementParam("repulseKappa", defaultParams.repulseKappa));
  const repulseLambda = Math.max(0, readPlacementParam("repulseLambda", defaultParams.repulseLambda));
  const repulseEta = Math.max(0, readPlacementParam("repulseEta", defaultParams.repulseEta));
  const repulseIterations = readPlacementParamInt(
    "repulseIterations",
    defaultParams.repulseIterations,
    1
  );
  const repulseAlpha = clamp(readPlacementParam("repulseAlpha", defaultParams.repulseAlpha), 0, 1);
  const midiTailMs = Math.max(0, readPlacementParamInt("midiTailMs", defaultParams.midiTailMs, 0));

  const placementMode = els.placementMode.value || "v2";
  state.params = {
    ...defaultParams,
    edoSteps,
    useDamping: els.useDamping.value !== "off",
    placementMode,
    anchorAlpha,
    anchorBeta,
    anchorRho,
    repulseGamma,
    repulseKappa,
    repulseLambda,
    repulseEta,
    repulseIterations,
    repulseAlpha,
    midiTailMs
  };
  state.params.roughAlpha = calibrateAlpha(state.params, 0.5);
  state.gRef = computeReferenceG(state.params);
  renderOddBiasToggles(intervals);
  state.resultsByO = {};
  state.outputsByO = {};
  state.selectedOutputKeys = new Set();
  const Os = [];
  let permCount = 0;
  const lens = getLens("intervalPlacement");
  if (!lens) {
    els.status.textContent = "Interval placement lens not available";
    return;
  }
  for (let O = minO; O <= maxO; O++) {
    const { records, outputs } = lens.run({
      intervals,
      params: state.params,
      oddBias: state.oddBias,
      windowOctaves: O
    });
    state.resultsByO[O] = records;
    state.outputsByO[O] = outputs;
    Os.push(O);
    permCount = Math.max(permCount, records.length);
  }
  const savedO = parseInt(localStorage.getItem(storageKeys.activeO) || "", 10);
  state.activeO = Os.includes(savedO) ? savedO : (Os.includes(3) ? 3 : Os[0]);
  const savedPerm = (localStorage.getItem(storageKeys.selectedPerm) || "").trim();
  state.selected = null;
  if (savedPerm) {
    const recs = state.resultsByO[state.activeO] || [];
    const match = recs.find((r) => r.perm.join(" ") === savedPerm);
    if (match) state.selected = match;
  }
  if (!state.selected) {
    const recs = state.resultsByO[state.activeO] || [];
    const first = recs[0];
    if (first) {
      state.selected = first;
      localStorage.setItem(storageKeys.selectedPerm, first.perm.join(" "));
    }
  }
  els.status.textContent = `Computed ${permCount} permutations across ${Os.length} windows`;
  render();
}

function saveInputs() {
  localStorage.setItem(storageKeys.intervals, els.intervals.value);
  localStorage.setItem(storageKeys.edo, els.edo.value);
  localStorage.setItem(storageKeys.baseNote, els.baseNote.value);
  localStorage.setItem(storageKeys.baseOctave, els.baseOctave.value);
  localStorage.setItem(storageKeys.minO, els.minO.value);
  localStorage.setItem(storageKeys.maxO, els.maxO.value);
  localStorage.setItem(storageKeys.xSpacing, els.xSpacing.value);
  localStorage.setItem(storageKeys.useDamping, els.useDamping.value);
  localStorage.setItem(storageKeys.placementMode, els.placementMode.value);
  localStorage.setItem(storageKeys.guitarTuning, els.guitarTuning.value);
  if (els.deskGridStep) {
    localStorage.setItem(storageKeys.deskGridStep, els.deskGridStep.value);
  }
  placementParamIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || !storageKeys[id]) return;
    localStorage.setItem(storageKeys[id], el.value);
  });
  midiParamIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || !storageKeys[id]) return;
    localStorage.setItem(storageKeys[id], el.value);
  });
}

function loadInputs() {
  const storedIntervals = localStorage.getItem(storageKeys.intervals);
  if (storedIntervals) els.intervals.value = storedIntervals;
  const storedEdo = localStorage.getItem(storageKeys.edo);
  if (storedEdo) els.edo.value = storedEdo;
  const storedBaseNote = localStorage.getItem(storageKeys.baseNote);
  if (storedBaseNote) els.baseNote.value = storedBaseNote;
  const storedBaseOctave = localStorage.getItem(storageKeys.baseOctave);
  if (storedBaseOctave) els.baseOctave.value = storedBaseOctave;
  const storedMin = localStorage.getItem(storageKeys.minO);
  if (storedMin) els.minO.value = storedMin;
  const storedMax = localStorage.getItem(storageKeys.maxO);
  if (storedMax) els.maxO.value = storedMax;
  const storedSpacing = localStorage.getItem(storageKeys.xSpacing);
  if (storedSpacing) els.xSpacing.value = storedSpacing;
  const storedDamping = localStorage.getItem(storageKeys.useDamping);
  if (storedDamping) els.useDamping.value = storedDamping;
  const storedPlacementMode = localStorage.getItem(storageKeys.placementMode);
  if (storedPlacementMode) els.placementMode.value = storedPlacementMode;
  const storedTuning = localStorage.getItem(storageKeys.guitarTuning);
  if (storedTuning) els.guitarTuning.value = storedTuning;
  const storedDeskGrid = localStorage.getItem(storageKeys.deskGridStep);
  if (storedDeskGrid && els.deskGridStep) {
    els.deskGridStep.value = storedDeskGrid;
  }
  renderPlacementParams(els.placementMode.value || "v2");
  renderMidiParams();
  const storedFilter = localStorage.getItem(storageKeys.filter);
  if (storedFilter) els.filter.value = storedFilter;
  const storedInventoryFilter = localStorage.getItem(storageKeys.inventoryFilter);
  if (storedInventoryFilter && els.inventorySearch) {
    els.inventorySearch.value = storedInventoryFilter;
    state.inventoryFilter = storedInventoryFilter;
  }
}





function capturePlacementParamValues() {
  const values = {};
  placementParamIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    values[id] = el.value;
  });
  midiParamIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    values[id] = el.value;
  });
  return values;
}

function getFavoritesDeps() {
  return {
    capturePlacementParamValues,
    render,
    renderPlacementParams,
    saveInputs,
    recompute
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

function setToggleGroupValue(group, value) {
  const buttons = Array.from(document.querySelectorAll(`.toggle-btn[data-toggle-group="${group}"]`));
  buttons.forEach((btn) => {
    const isActive = btn.dataset.value === value;
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("ghost", !isActive);
  });
}

function bindToggleGroups() {
  const buttons = Array.from(document.querySelectorAll(".toggle-btn[data-toggle-group]"));
  if (!buttons.length) return;
  const activeByGroup = new Map();
  buttons.forEach((btn) => {
    const group = btn.dataset.toggleGroup;
    if (!group) return;
    if (!activeByGroup.has(group)) {
      activeByGroup.set(group, btn.dataset.value);
    }
  });
  activeByGroup.forEach((value, group) => setToggleGroupValue(group, value));
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.toggleGroup;
      const value = btn.dataset.value;
      if (!group || value === undefined) return;
      setToggleGroupValue(group, value);
      scheduleEuclidUpdate();
    });
  });
}

let euclidDraft = null;
let euclidCapturedId = null;
let euclidRecomputeTimer = null;

function readEuclidParams() {
  if (!els.euclidSteps || !els.euclidPulses || !els.euclidRotation) {
    return null;
  }
  const stepsRaw = parseInt(els.euclidSteps.value, 10);
  const steps = Number.isFinite(stepsRaw) ? Math.max(1, stepsRaw) : 1;
  if (els.euclidRotation) {
    els.euclidRotation.min = `${-steps}`;
    els.euclidRotation.max = `${steps}`;
  }
  const pulsesRaw = parseInt(els.euclidPulses.value, 10);
  const pulses = Number.isFinite(pulsesRaw) ? Math.max(0, Math.min(steps, pulsesRaw)) : 0;
  const rotationRaw = parseInt(els.euclidRotation.value, 10);
  const rotation = Number.isFinite(rotationRaw)
    ? Math.max(-steps, Math.min(steps, rotationRaw))
    : 0;
  const outputBtn = document.querySelector(".toggle-btn[data-toggle-group=\"outputKind\"].active");
  const outputKind = outputBtn && outputBtn.dataset.value === "indexMask" ? "indexMask" : "binaryMask";
  const rotationNorm = steps ? ((rotation % steps) + steps) % steps : 0;
  els.euclidSteps.value = `${steps}`;
  els.euclidPulses.value = `${pulses}`;
  els.euclidRotation.value = `${rotation}`;
  if (els.euclidRotationValue) {
    els.euclidRotationValue.textContent = `${rotation}`;
  }
  return { steps, pulses, rotation, rotationNorm, outputKind };
}

function formatEuclidPreview(draft) {
  if (!draft || !draft.data) return "No draft yet.";
  const kind = draft.data.kind;
  const values = Array.isArray(draft.data.values) ? draft.data.values : [];
  if (kind === "indexMask") {
    return `[${values.join(", ")}]`;
  }
  return values.join("");
}

function drawEuclidWheel(draft) {
  const canvas = els.euclidWheel;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!draft || !draft.data) return;
  const domain = draft.data.domain || {};
  const steps = Number.isFinite(domain.steps) ? domain.steps : 0;
  if (!steps) return;
  const values = Array.isArray(draft.data.values) ? draft.data.values : [];
  let mask = [];
  if (draft.data.kind === "indexMask") {
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
  const indexBtn = document.querySelector(".toggle-btn[data-toggle-group=\"indexBase\"].active");
  const indexBase = indexBtn && indexBtn.dataset.value === "1" ? 1 : 0;
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
    ctx.fillText(String(i + indexBase), lx, ly);
  }
}

function scheduleEuclidUpdate() {
  if (euclidRecomputeTimer) {
    clearTimeout(euclidRecomputeTimer);
  }
  euclidRecomputeTimer = setTimeout(() => {
    updateEuclidDraft();
  }, 80);
}

function updateEuclidDraft() {
  const params = readEuclidParams();
  if (!params) return;
  const lens = getLens("euclideanPatterns");
  if (!lens) {
    return;
  }
  const result = lens.run({ params, state });
  euclidDraft = result && Array.isArray(result.outputs) ? result.outputs[0] : null;
  euclidCapturedId = null;
  renderEuclidPanel();
}

function renderEuclidPanel() {
  if (els.euclidPreview) {
    els.euclidPreview.textContent = formatEuclidPreview(euclidDraft);
  }
  drawEuclidWheel(euclidDraft);
  const hasDraft = !!euclidDraft;
  if (els.euclidCaptureBtn) els.euclidCaptureBtn.disabled = !hasDraft;
  if (els.euclidSendBtn) els.euclidSendBtn.disabled = !hasDraft;
}

function buildEuclidName(draft) {
  const domain = (draft && draft.data && draft.data.domain) || {};
  const steps = Number.isFinite(domain.steps) ? domain.steps : "?";
  const pulses = Number.isFinite(domain.pulses) ? domain.pulses : "?";
  const rotation = Number.isFinite(domain.rotation) ? domain.rotation : 0;
  return `E(${steps},${pulses}) r${rotation}`;
}

function captureEuclidDraft() {
  if (!euclidDraft) return null;
  const name = buildEuclidName(euclidDraft);
  const material = inventoryStore.add(euclidDraft, { name });
  if (!material) return null;
  euclidCapturedId = material.id;
  state.lastCapturedMaterialId = material.id;
  state.selectedInventoryId = material.id;
  saveInventory();
  renderInventory();
  return material;
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

function handlePlacementModeChange() {
  renderPlacementParams(els.placementMode.value || "v2");
  saveInputs();
  scheduleRecompute();
}

els.runBtn.addEventListener("click", () => {
  saveInputs();
  recompute();
});
[
  els.intervals,
  els.edo,
  els.baseNote,
  els.baseOctave,
  els.minO,
  els.maxO,
  els.xSpacing,
  els.useDamping
].forEach((el) => {
  el.addEventListener("input", scheduleRecompute);
  el.addEventListener("change", scheduleRecompute);
});
els.guitarTuning.addEventListener("input", () => {
  saveInputs();
  renderFretboard();
});
els.guitarTuning.addEventListener("change", () => {
  saveInputs();
  renderFretboard();
});
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
els.placementMode.addEventListener("change", handlePlacementModeChange);
els.placementMode.addEventListener("input", handlePlacementModeChange);
els.filter.addEventListener("input", () => {
  localStorage.setItem(storageKeys.filter, els.filter.value);
  updateTable();
});
els.midiOut.addEventListener("click", () => {
  requestMidiAccess();
});
els.midiOut.addEventListener("change", () => {
  localStorage.setItem(storageKeys.midiOut, els.midiOut.value);
});
els.midiPreview.addEventListener("click", previewSelected);
if (els.captureOutputsBtn) {
  els.captureOutputsBtn.addEventListener("click", () => {
    captureSelectedOutputs();
  });
}
if (els.sendToDeskBtn) {
  els.sendToDeskBtn.addEventListener("click", () => {
    sendSelectedOutputsToDesk();
  });
}
if (els.deskRemoveBtn) {
  els.deskRemoveBtn.addEventListener("click", () => {
    if (!state.selectedDeskId) return;
    const removed = removeSelectedDeskItem();
    if (removed) {
      saveDesk();
      renderDesk();
      els.status.textContent = "Removed desk item.";
    }
  });
}
if (els.euclidCaptureBtn) {
  els.euclidCaptureBtn.addEventListener("click", () => {
    if (!euclidDraft) {
      return;
    }
    const material = captureEuclidDraft();
    void material;
  });
}
if (els.euclidSendBtn) {
  els.euclidSendBtn.addEventListener("click", () => {
    if (!euclidDraft) {
      return;
    }
    let material = euclidCapturedId ? inventoryStore.get(euclidCapturedId) : null;
    if (!material) {
      material = captureEuclidDraft();
    }
    if (!material) {
      return;
    }
    deskStore.add({ materialId: material.id, start: 0, lane: 0 });
    saveDesk();
    renderDesk();
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

els.selectedInfo.addEventListener("mouseover", (event) => {
  const target = event.target;
  if (!target) return;
  if (!target.matches(".pitch-item, .pitch-name, .pitch-pc")) return;
  const pitch = parseInt(target.dataset.pitch, 10);
  if (!Number.isFinite(pitch)) return;
  setHoverPitch(pitch);
});

loadInputs();
loadFavorites();
loadInventory();
loadDesk();
initLensMode();
bindToggleGroups();
renderEuclidPanel();
if (els.euclidSteps && els.euclidPulses && els.euclidRotation) {
  [els.euclidSteps, els.euclidPulses, els.euclidRotation].forEach((el) => {
    el.addEventListener("input", scheduleEuclidUpdate);
    el.addEventListener("change", scheduleEuclidUpdate);
  });
  updateEuclidDraft();
}
recompute();
