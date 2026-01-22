const RATIO_TARGETS = [
  [1, 1],           // unison
  [9, 8], [16, 15], // seconds
  [5, 4], [6, 5],   // thirds
  [4, 3], [3, 2],   // fourth/fifth
  [8, 5], [5, 3],   // sixths
  [16, 9], [15, 8], // sevenths
  [2, 1],           // octave
  [45, 32]          // tritone proxy
];

const defaultParams = {
  // Pitch/EDO geometry and compound interval handling.
  edoSteps: 12,
  compoundReliefM: 0.55,
  // Ratio cost targets and weighting.
  sigmaCents: 20.0,
  ratioLambda: 0.20,
  // Roughness model and weighting.
  roughAlpha: 0.0,
  roughPartialsK: 12,
  ampPower: 1.0,
  roughA: 3.5,
  roughB: 5.75,
  // Register damping.
  registerDampingK: 1.6,
  // Anchor placement parameters (v2).
  anchorAlpha: 0.3,
  anchorBeta: 1.0,
  anchorRho: 0.5,
  // Center repulsion placement parameters (Engine A).
  repulseGamma: 1.0,
  repulseKappa: 0.4,
  repulseLambda: 0.1,
  repulseEta: 0.08,
  repulseIterations: 60,
  repulseAlpha: 1.0,
  midiTailMs: 200,
  // Reference tuning.
  fRefHz: 55.0,
};

function hueForInterval(interval, windowL) {
  const L = windowL || 1;
  const halfMax = Math.max(1, Math.ceil(L / 2));
  const baseIndex = Math.floor(interval / 2);
  const baseHue = (baseIndex / halfMax) * 180;
  const hue = baseHue + (interval % 2 === 1 ? 180 : 0);
  return (hue + 240) % 360;
}

function intervalColor(interval) {
  const maxInterval = state.hoverWindowL || interval || 1;
  const hue = hueForInterval(interval, maxInterval);
  return `hsl(${hue}, 60%, 45%)`;
}

const state = {
  resultsByO: {},
  activeO: null,
  selected: null,
  anchorsByO: {},
  params: { ...defaultParams },
  hoverPitch: null,
  hoverPoints: [],
  hoverWindowL: null,
  gRef: null,
  oddBias: [],
  favorites: [],
  pendingOddBias: null,
  favoritePromptHandlers: null
};

const els = {
  intervals: document.getElementById("intervals"),
  edo: document.getElementById("edo"),
  baseNote: document.getElementById("baseNote"),
  baseOctave: document.getElementById("baseOctave"),
  minO: document.getElementById("minO"),
  maxO: document.getElementById("maxO"),
  xSpacing: document.getElementById("xSpacing"),
  runBtn: document.getElementById("runBtn"),
  status: document.getElementById("status"),
  tabBar: document.getElementById("tabBar"),
  plot: document.getElementById("plot"),
  selectedInfo: document.getElementById("selectedInfo"),
  hoverInfo: document.getElementById("hoverInfo"),
  keyboard: document.getElementById("keyboard"),
  resultsTable: document.getElementById("resultsTable"),
  filter: document.getElementById("filter"),
  useDamping: document.getElementById("useDamping"),
  oddBias: document.getElementById("oddBias"),
  favoritesList: document.getElementById("favoritesList"),
  anchorSummary: document.getElementById("anchorSummary"),
  anchorMath: document.getElementById("anchorMath"),
  midiOut: document.getElementById("midiOut"),
  midiPreview: document.getElementById("midiPreview"),
  guitarTuning: document.getElementById("guitarTuning"),
  placementMode: document.getElementById("placementMode"),
  placementParams: document.getElementById("placementParams"),
  midiParams: document.getElementById("midiParams"),
  fretboard: document.getElementById("fretboard"),
  favoritePrompt: document.getElementById("favoritePrompt"),
  favoritePromptText: document.getElementById("favoritePromptText"),
  favoriteSwitchBtn: document.getElementById("favoriteSwitchBtn"),
  favoriteImportBtn: document.getElementById("favoriteImportBtn"),
  favoriteCancelBtn: document.getElementById("favoriteCancelBtn")
};

let midiAccess = null;
let midiOutputs = [];

const storageKeys = {
  intervals: "intervalApplet.intervals",
  edo: "intervalApplet.edo",
  baseNote: "intervalApplet.baseNote",
  baseOctave: "intervalApplet.baseOctave",
  minO: "intervalApplet.minO",
  maxO: "intervalApplet.maxO",
  xSpacing: "intervalApplet.xSpacing",
  useDamping: "intervalApplet.useDamping",
  oddBias: "intervalApplet.oddBias",
  favorites: "intervalApplet.favorites",
  activeO: "intervalApplet.activeO",
  filter: "intervalApplet.filter",
  midiOut: "intervalApplet.midiOut",
  selectedPerm: "intervalApplet.selectedPerm",
  anchorAlpha: "intervalApplet.anchorAlpha",
  anchorBeta: "intervalApplet.anchorBeta",
  anchorRho: "intervalApplet.anchorRho",
  placementMode: "intervalApplet.placementMode",
  guitarTuning: "intervalApplet.guitarTuning",
  repulseGamma: "intervalApplet.repulseGamma",
  repulseKappa: "intervalApplet.repulseKappa",
  repulseLambda: "intervalApplet.repulseLambda",
  repulseEta: "intervalApplet.repulseEta",
  repulseIterations: "intervalApplet.repulseIterations",
  repulseAlpha: "intervalApplet.repulseAlpha",
  midiTailMs: "intervalApplet.midiTailMs"
};

function parseIntervals(text) {
  return text
    .split(/[,\s]+/)
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lowBiasSplit(length) {
  // Legacy low-bias split: odd intervals place more length below the anchor.
  const down = Math.floor((length + 1) / 2);
  const up = length - down;
  return [down, up];
}

function biasedSplit(length, flipOdd) {
  // Optional odd-only flip to swap which side gets the extra step.
  const [down, up] = lowBiasSplit(length);
  if (length % 2 === 1 && flipOdd) {
    return [up, down];
  }
  return [down, up];
}

function safeAnchorRange(L, intervals) {
  // Legacy safe range: anchors must keep all endpoints inside [0, L].
  const downs = [];
  const ups = [];
  intervals.forEach((l) => {
    const [down, up] = lowBiasSplit(l);
    downs.push(down);
    ups.push(up);
  });
  const amin = Math.max(...downs);
  const amax = L - Math.max(...ups);
  return [amin, amax];
}

function equalSpacedAnchors(amin, amax, n) {
  // Legacy equal-spacing within the safe interior.
  if (n <= 0) return [];
  if (n === 1) return [amin];
  const span = amax - amin;
  const gaps = n - 1;
  const base = Math.floor(span / gaps);
  const rem = span % gaps;
  const increments = [];
  for (let i = 0; i < gaps; i++) {
    increments.push(i < rem ? base + 1 : base);
  }
  const anchors = [amin];
  increments.forEach((inc) => anchors.push(anchors[anchors.length - 1] + inc));
  return anchors;
}

function endpointsForPerm(anchors, perm) {
  // Legacy endpoint placement: use per-column odd-bias to choose the split.
  return anchors.map((a, idx) => {
    const l = perm[idx];
    const flipOdd = state.oddBias[idx] === "up";
    const [down, up] = biasedSplit(l, flipOdd);
    return [a - down, a + up];
  });
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

function quantizeInterval(anchor, length, rho, oddBias) {
  // Q: pick integer anchor mark then apply the quantized split.
  const A = Math.floor(anchor);
  const { down, up } = quantizedSplit(length, rho, oddBias);
  const low = A - down;
  const high = A + up;
  return { A, low, high, down, up };
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

function anchorsForPerm(L, perm, params) {
  // v2 anchor generation: alpha/beta control how slack weights shape placement.
  const n = perm.length;
  const rho = params.anchorRho;
  const alpha = params.anchorAlpha;
  const beta = params.anchorBeta;
  const splits = perm.map((d, idx) => quantizedSplit(d, rho, state.oddBias[idx]));
  // Safe anchor range is based on the active split policy.
  const amin = Math.max(...splits.map((s) => s.down));
  const amax = L - Math.max(...splits.map((s) => s.up));
  if (!Number.isFinite(amin) || !Number.isFinite(amax) || amin > amax) {
    return null;
  }
  if (n === 1) {
    const a = amin;
    return {
      anchorFloats: [a],
      anchors: [Math.floor(a)],
      splits,
      slack: [L - perm[0]],
      weights: [1],
      prefixSums: [0],
      prefixFractions: [0],
      totalWeight: 1,
      amin,
      amax
    };
  }
  const span = amax - amin;
  // Slack-based weights: larger slack gets more influence as beta increases.
  const slack = perm.map((d) => L - d);
  const weights = slack.map((s) => Math.pow(s, beta));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  let prefix = 0;
  const eps = 1e-9;
  const prefixFractions = [];
  const prefixSums = [];
  const anchorFloats = perm.map((d, idx) => {
    // t: index-based position, u: prefix-weighted position.
    const t = idx / (n - 1);
    const u = prefix / totalWeight;
    const a0 = amin + t * span;
    const a1 = amin + u * span;
    const a = (1 - alpha) * a0 + alpha * a1;
    prefix += weights[idx];
    void d;
    prefixSums.push(prefix - weights[idx]);
    prefixFractions.push(u);
    // Clamp for safety against floating-point drift at the bounds.
    return Math.min(amax, Math.max(amin, a));
  });
  // Quantize anchors to the integer lattice, keeping them inside [amin, amax].
  const anchors = anchorFloats.map((a) => Math.max(amin, Math.min(amax, Math.floor(a + eps))));
  return {
    anchorFloats,
    anchors,
    splits,
    slack,
    weights,
    prefixSums,
    prefixFractions,
    totalWeight,
    amin,
    amax
  };
}

const placementEngines = {
  alphaBeta: {
    id: "v2",
    label: "v2 (parametric)",
    solveCenters(L, perm, params) {
      const anchorData = anchorsForPerm(L, perm, params);
      if (!anchorData) return null;
      return {
        engineId: "v2",
        centers: anchorData.anchorFloats.slice(),
        anchors: anchorData.anchors.slice(),
        splits: anchorData.splits,
        anchorRange: { amin: anchorData.amin, amax: anchorData.amax },
        bounds: anchorData.anchorFloats.map(() => ({ min: anchorData.amin, max: anchorData.amax })),
        debugFlags: {
          showBounds: true,
          showSplits: true,
          showEndpointsFloat: true,
          showWeights: true
        },
        meta: {
          slack: anchorData.slack,
          weights: anchorData.weights,
          prefixSums: anchorData.prefixSums,
          prefixFractions: anchorData.prefixFractions,
          totalWeight: anchorData.totalWeight
        }
      };
    }
  },
  repulsion: {
    id: "repulse",
    label: "A (center repulsion)",
    solveCenters(L, perm, params) {
      const rho = params.anchorRho;
      const bounds = centerBoundsForPerm(L, perm, rho);
      const neutral = neutralCentersFromBounds(bounds);
      const { deltas } = repulsionDeltasForPerm(perm, params.repulseGamma, params.repulseKappa, L);
      const repelled = projectedPairwiseSolve(
        neutral,
        bounds,
        params.repulseIterations,
        params.repulseEta,
        (centers, forces) => accumulateRepulsionForces(centers, forces, deltas, params.repulseLambda)
      );
      const alpha = Number.isFinite(params.repulseAlpha)
        ? clamp(params.repulseAlpha, 0, 1)
        : 1;
      const blended = Number.isFinite(alpha)
        ? repelled.map((c, idx) => {
          const mix = (1 - alpha) * neutral[idx] + alpha * c;
          return clamp(mix, bounds[idx].min, bounds[idx].max);
        })
        : repelled.slice();
      return {
        engineId: "repulse",
        centers: blended,
        anchors: null,
        splits: null,
        anchorRange: null,
        bounds,
        debugFlags: {
          showBounds: true,
          showSplits: true,
          showEndpointsFloat: true,
          showWeights: false
        },
        diagnostics: repulsionDiagnostics(blended, deltas, params.repulseLambda)
      };
    }
  }
};

function resolvePlacementEngine(mode) {
  if (mode === "repulse") return placementEngines.repulsion;
  return placementEngines.alphaBeta;
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

function engineLabelForId(id) {
  if (id === "v1") return "v1 (legacy)";
  if (id === "repulse") return placementEngines.repulsion.label;
  if (id === "v2") return placementEngines.alphaBeta.label;
  return id || "";
}

function endpointsListFromEndpoints(endpoints) {
  // Preserve duplicates for index-aligned comparisons.
  return endpoints.flat().sort((a, b) => a - b);
}

function betaZeroPitchesForPerm(perm, params, L) {
  // Alternate placement with beta=0 for visual comparison.
  const anchorData = anchorsForPerm(L, perm, { ...params, anchorBeta: 0 });
  if (!anchorData) return null;
  const endpoints = anchorData.anchorFloats.map((a, idx) => {
    const d = perm[idx];
    const bias = state.oddBias[idx];
    const { low, high } = quantizeInterval(a, d, params.anchorRho, bias);
    return [low, high];
  });
  return {
    pitches: pitchesFromEndpoints(endpoints),
    endpointList: endpointsListFromEndpoints(endpoints)
  };
}

function alphaZeroPitchesForPerm(perm, params, L) {
  // Alternate placement with alpha=0 for visual comparison.
  const anchorData = anchorsForPerm(L, perm, { ...params, anchorAlpha: 0 });
  if (!anchorData) return null;
  const endpoints = anchorData.anchorFloats.map((a, idx) => {
    const d = perm[idx];
    const bias = state.oddBias[idx];
    const { low, high } = quantizeInterval(a, d, params.anchorRho, bias);
    return [low, high];
  });
  return {
    pitches: pitchesFromEndpoints(endpoints),
    endpointList: endpointsListFromEndpoints(endpoints)
  };
}

function pitchesFromEndpoints(endpoints) {
  const s = new Set();
  endpoints.forEach(([lo, hi]) => {
    s.add(lo);
    s.add(hi);
  });
  return Array.from(s).sort((a, b) => a - b);
}

function inducedIntervals(pitches) {
  const out = [];
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      out.push(pitches[j] - pitches[i]);
    }
  }
  return out.sort((a, b) => a - b);
}

function ratioCost(cents, sigma, ratioLambda) {
  // Match interval to nearest target ratio with a height penalty.
  let best = Number.POSITIVE_INFINITY;
  let bestRatio = [1, 1];
  let bestHeight = 0;
  for (const [n, d] of RATIO_TARGETS) {
    const target = 1200 * Math.log2(n / d);
    const height = Math.log2(n * d);
    const cost = Math.pow(Math.abs(cents - target) / sigma, 2) + ratioLambda * height;
    if (cost < best) {
      best = cost;
      bestRatio = [n, d];
      bestHeight = height;
    }
  }
  return { cost: best, ratio: bestRatio, height: bestHeight };
}

function registerDamping(lo, L, k) {
  // Optional register penalty: higher registers receive less damping.
  if (state.params.useDamping) {
    return Math.exp(-k * (lo / L));
  }
  return 1;
}

function compoundRelief(dSteps, N, m) {
  // Reduce tension for larger compound intervals (per octave).
  return Math.exp(-m * Math.floor(dSteps / N));
}

function f0FromLo(lo, N, fRefHz) {
  // Convert a pitch-space step into a reference fundamental frequency.
  return fRefHz * Math.pow(2, lo / N);
}

const roughCache = new Map();

function roughnessKharm(cents, f0Hz, K, ampPower, a, b) {
  // Spectral roughness via pairwise partial interactions (cached for speed).
  const key = `${cents.toFixed(3)}|${f0Hz.toFixed(3)}|${K}|${ampPower}|${a}|${b}`;
  if (roughCache.has(key)) return roughCache.get(key);
  const r = Math.pow(2, cents / 1200);
  let total = 0;
  for (let i = 1; i <= K; i++) {
    const fi = i * f0Hz;
    const ai = 1 / Math.pow(i, ampPower);
    for (let j = 1; j <= K; j++) {
      const gj = j * (r * f0Hz);
      const aj = 1 / Math.pow(j, ampPower);
      const df = Math.abs(fi - gj);
      const fbar = 0.5 * (fi + gj);
      const bandwidth = 1.72 * Math.pow(fbar, 0.65);
      const x = bandwidth > 0 ? df / bandwidth : 0;
      const phi = Math.exp(-a * x) - Math.exp(-b * x);
      total += ai * aj * phi;
    }
  }
  roughCache.set(key, total);
  return total;
}

function calibrateAlpha(params, gamma) {
  // Scale roughness into the same magnitude range as ratio cost.
  const L = params.edoSteps * 3;
  const lo = Math.floor(L / 4);
  const f0Hz = f0FromLo(lo, params.edoSteps, params.fRefHz);
  const ratioVals = [];
  const roughVals = [];
  for (let dMod = 1; dMod < params.edoSteps; dMod++) {
    const cents = 1200 * (dMod / params.edoSteps);
    const { cost } = ratioCost(cents, params.sigmaCents, params.ratioLambda);
    const rough = roughnessKharm(
      cents,
      f0Hz,
      params.roughPartialsK,
      params.ampPower,
      params.roughA,
      params.roughB
    );
    ratioVals.push(cost);
    roughVals.push(rough);
  }
  const medRatio = median(ratioVals);
  const medRough = median(roughVals);
  if (medRough === 0) return 0;
  return gamma * (medRatio / medRough);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return 0.5 * (sorted[mid - 1] + sorted[mid]);
  }
  return sorted[mid];
}

function dyadPenalty(lo, hi, params, L) {
  // Combined dyad tension: ratio cost + scaled roughness, then register/compound factors.
  const dSteps = hi - lo;
  const dMod = dSteps % params.edoSteps;
  const cents = 1200 * (dMod / params.edoSteps);
  const { cost } = ratioCost(cents, params.sigmaCents, params.ratioLambda);
  const f0Hz = f0FromLo(lo, params.edoSteps, params.fRefHz);
  const rough = roughnessKharm(
    cents,
    f0Hz,
    params.roughPartialsK,
    params.ampPower,
    params.roughA,
    params.roughB
  );
  const r = registerDamping(lo, L, params.registerDampingK);
  const c = compoundRelief(dSteps, params.edoSteps, params.compoundReliefM);
  return (cost + params.roughAlpha * rough) * r * c;
}

function dyadPenaltyDetails(lo, hi, params, L) {
  // Same as dyadPenalty but returns raw pieces for hover inspection.
  const dSteps = hi - lo;
  const dMod = dSteps % params.edoSteps;
  const cents = 1200 * (dMod / params.edoSteps);
  const { cost } = ratioCost(cents, params.sigmaCents, params.ratioLambda);
  const f0Hz = f0FromLo(lo, params.edoSteps, params.fRefHz);
  const rough = roughnessKharm(
    cents,
    f0Hz,
    params.roughPartialsK,
    params.ampPower,
    params.roughA,
    params.roughB
  );
  const r = registerDamping(lo, L, params.registerDampingK);
  const c = compoundRelief(dSteps, params.edoSteps, params.compoundReliefM);
  const g = (cost + params.roughAlpha * rough) * r * c;
  return { g, dSteps };
}

function computeReferenceG(params) {
  // Reference dyad (1-step) used for scaling hover values.
  const LRef = 36;
  const loRef = Math.floor(LRef / 2);
  const hiRef = loRef + 1;
  const { g } = dyadPenaltyDetails(loRef, hiRef, params, LRef);
  return g;
}

function sonorityPenalty(pitches, params, L) {
  // Total tension = sum over all dyad penalties in the chord.
  let total = 0;
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      total += dyadPenalty(pitches[i], pitches[j], params, L);
    }
  }
  return total;
}

function intervalCounts(intervals) {
  const counts = new Map();
  intervals.forEach((d) => {
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
}

function octaveReducedIntervalVector(pitches, N) {
  const pcs = Array.from(new Set(pitches.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  if (pcs.length < 2) return Array(Math.floor(N / 2)).fill(0);
  const maxIc = Math.floor(N / 2);
  const vec = Array(maxIc).fill(0);
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      const d = (pcs[j] - pcs[i]) % N;
      const ic = Math.min(d, N - d);
      if (ic > 0 && ic <= maxIc) {
        vec[ic - 1] += 1;
      }
    }
  }
  return vec;
}

function normalOrder(pcs, N) {
  const unique = Array.from(new Set(pcs.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  const n = unique.length;
  if (n <= 1) return unique;
  let best = null;
  let bestSpan = null;
  for (let i = 0; i < n; i++) {
    const rotated = unique.slice(i).concat(unique.slice(0, i).map((p) => p + N));
    const span = rotated[rotated.length - 1] - rotated[0];
    if (best === null || span < bestSpan) {
      best = rotated;
      bestSpan = span;
    } else if (span === bestSpan) {
      for (let k = n - 1; k > 0; k--) {
        const intBest = best[k] - best[0];
        const intRot = rotated[k] - rotated[0];
        if (intRot < intBest) {
          best = rotated;
          break;
        }
        if (intRot > intBest) {
          break;
        }
      }
    }
  }
  return best;
}

function primeFormRahnForte(pitches, N) {
  const pcs = Array.from(new Set(pitches.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  if (pcs.length === 0) return [];
  if (pcs.length === 1) return [0];
  const norm = normalOrder(pcs, N);
  const normT = norm.map((p) => (p - norm[0] + N) % N);
  const inv = pcs.map((p) => (-p + N) % N);
  const invNorm = normalOrder(inv, N);
  const invT = invNorm.map((p) => (p - invNorm[0] + N) % N);
  return compareArrays(normT, invT) <= 0 ? normT : invT;
}

function compareArrays(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

function uniquePermutations(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const uniq = Array.from(counts.keys()).sort((a, b) => a - b);
  const total = values.length;
  const results = [];
  const current = [];

  function backtrack() {
    if (current.length === total) {
      results.push(current.slice());
      return;
    }
    for (const v of uniq) {
      const c = counts.get(v) || 0;
      if (c === 0) continue;
      counts.set(v, c - 1);
      current.push(v);
      backtrack();
      current.pop();
      counts.set(v, c);
    }
  }

  backtrack();
  return results;
}

function computeForWindow(intervals, params, O) {
  // v1 vs newer engines: legacy anchors vs pluggable center solvers.
  const L = O * params.edoSteps;
  const mode = params.placementMode || "v2";
  const isLegacy = mode === "v1";
  const engine = isLegacy ? null : resolvePlacementEngine(mode);
  let legacyAnchors = null;
  let legacyRange = null;
  if (isLegacy) {
    const [amin, amax] = safeAnchorRange(L, intervals);
    legacyAnchors = equalSpacedAnchors(amin, amax, intervals.length);
    legacyRange = { amin, amax };
  }
  const perms = uniquePermutations(intervals);
  const records = perms.map((perm) => {
    let endpoints = null;
    let endpointsFloat = null;
    let anchors = null;
    let anchorFloats = null;
    let anchorRange = null;
    let splits = null;
    let slack = null;
    let weights = null;
    let prefixSums = null;
    let prefixFractions = null;
    let totalWeight = null;
    let centerBounds = null;
    let centerDiagnostics = null;
    let debugFlags = null;
    let engineId = isLegacy ? "v1" : engine.id;
    if (isLegacy) {
      // Legacy placement: anchors fixed, odd-bias only flips split for odd d.
      endpoints = endpointsForPerm(legacyAnchors, perm);
      endpointsFloat = endpoints.map(([low, high]) => [low, high]);
      const splitsLegacy = perm.map((d, idx) => {
        const flipOdd = state.oddBias[idx] === "up";
        const [down, up] = biasedSplit(d, flipOdd);
        return { down, up };
      });
      anchors = legacyAnchors;
      anchorFloats = legacyAnchors.map((a) => a);
      debugFlags = {
        showBounds: true,
        showSplits: true,
        showEndpointsFloat: false,
        showWeights: false
      };
      splits = splitsLegacy;
      anchorRange = legacyRange;
      if (legacyRange) {
        centerBounds = perm.map(() => ({ min: legacyRange.amin, max: legacyRange.amax }));
      }
    } else {
      const placement = engine.solveCenters(L, perm, params);
      if (!placement) return null;
      engineId = placement.engineId;
      anchorFloats = placement.centers;
      centerBounds = placement.bounds || null;
      debugFlags = placement.debugFlags || null;
      const rho = params.anchorRho;
      endpointsFloat = anchorFloats.map((c, idx) => rhoPlace(c, perm[idx], rho));
      const anchorsList = [];
      const splitsList = [];
      endpoints = anchorFloats.map((c, idx) => {
        const d = perm[idx];
        const bias = state.oddBias[idx];
        const { A, low, high, down, up } = quantizeInterval(c, d, rho, bias);
        anchorsList.push(A);
        splitsList.push({ down, up });
        return [low, high];
      });
      if (placement.engineId === "v2") {
        anchors = placement.anchors;
        splits = placement.splits;
        anchorRange = placement.anchorRange;
        if (placement.meta) {
          slack = placement.meta.slack;
          weights = placement.meta.weights;
          prefixSums = placement.meta.prefixSums;
          prefixFractions = placement.meta.prefixFractions;
          totalWeight = placement.meta.totalWeight;
        }
      } else {
        anchors = anchorsList;
        splits = splitsList;
        anchorRange = placement.anchorRange;
      }
      if (!anchorRange && centerBounds) {
        anchorRange = anchorRangeFromBounds(centerBounds);
      }
      centerDiagnostics = placement.diagnostics || null;
    }
    const centersForDiag = anchorFloats || anchors || [];
    if (!centerDiagnostics) {
      centerDiagnostics = {
        minDistance: minPairwiseDistance(centersForDiag),
        energy: null,
        violations: null
      };
    } else if (!Number.isFinite(centerDiagnostics.minDistance)) {
      centerDiagnostics.minDistance = minPairwiseDistance(centersForDiag);
    }
    const pitches = pitchesFromEndpoints(endpoints);
    const induced = inducedIntervals(pitches);
    const total = sonorityPenalty(pitches, params, L);
    const pairCount = pitches.length * (pitches.length - 1) / 2;
    return {
      perm,
      endpoints,
      endpointsFloat,
      centers: anchorFloats,
      anchors,
      anchorFloats,
      anchorRange,
      splits,
      slack,
      weights,
      prefixSums,
      prefixFractions,
      totalWeight,
      centerBounds,
      centerDiagnostics,
      debugFlags,
      engine: engineId,
      pitches,
      induced,
      inducedCounts: intervalCounts(induced),
      total,
      perPair: pairCount ? total / pairCount : 0,
      iv: octaveReducedIntervalVector(pitches, params.edoSteps),
      primeForm: primeFormRahnForte(pitches, params.edoSteps)
    };
  }).filter(Boolean);
  records.sort((a, b) => a.perPair - b.perPair);
  return { L, records };
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
    const isFav = state.favorites.some((f) => f.key === favKey);
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
      toggleFavorite(rec);
      renderFavorites();
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
    `<div class="meta-line metric-block"><div class="metric-label">intervals</div><div class="metric-values">${renderIntervals(rec.induced)}</div></div>`,
    `<div class="meta-line metric-block"><div class="metric-label">counts</div><div class="metric-values">${renderCounts(rec.inducedCounts)}</div></div>`,
    `<div class="meta-line" id="hoverCountsLine">hover counts: —</div>`,
    `<div class="meta-line">IV: ${rec.iv.join(" ")}</div>`,
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

function updateHoverInfo() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec || state.hoverPitch === null) {
    els.hoverInfo.textContent = "Hover a pitch to see dyad details.";
    return;
  }
  const L = state.activeO * state.params.edoSteps;
  const base = state.hoverPitch;
  const rows = rec.pitches
    .filter((p) => p !== base)
    .map((p) => {
      const lo = Math.min(base, p);
      const hi = Math.max(base, p);
      const { g, dSteps } = dyadPenaltyDetails(lo, hi, state.params, L);
      const gScaled = state.gRef ? (g / state.gRef) * 100 : g * 100;
      return { other: p, dSteps, g, gScaled };
    })
    .sort((a, b) => a.dSteps - b.dSteps);
  const lines = rows.map(
    (row) =>
      `p=${base} ↔ ${row.other}  <span class="d-tag" style="color: ${intervalColor(row.dSteps)}">d=${row.dSteps}</span>  g=${row.g.toFixed(2)}  g*=${row.gScaled.toFixed(2)}`
  );
  els.hoverInfo.innerHTML = lines.join("<br>");
}

function renderPlot() {
  const canvas = els.plot;
  const ctx = canvas.getContext("2d");
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) return;

  const wrap = canvas.parentElement;
  if (wrap) {
    const targetWidth = Math.max(320, wrap.clientWidth - 24);
    const maxHeight = Math.floor(window.innerHeight * 0.55);
    const targetHeight = Math.max(320, Math.min(560, maxHeight));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  const O = state.activeO;
  const L = O * state.params.edoSteps;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pad = 48;
  const width = canvas.width - pad * 2;
  const height = canvas.height - pad * 2;
  const intervalCols = rec.endpoints.length;
  const quarter = width / 4;
  const intervalWidth = quarter;
  const intervalLeft = pad;
  const auxLeft = pad + 2 * quarter;
  const compositeX = pad + 3 * quarter;

  function yToPx(y) {
    return canvas.height - pad - (y / L) * height;
  }

  function xIntervalToPx(i) {
    if (intervalCols <= 0) return intervalLeft + intervalWidth / 2;
    const span = intervalWidth / (intervalCols + 1);
    return intervalLeft + (i + 1) * span;
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  for (let y = 0; y <= L; y++) {
    const px = yToPx(y);
    ctx.beginPath();
    ctx.moveTo(pad, px);
    ctx.lineTo(canvas.width - pad, px);
    ctx.stroke();
  }

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y <= L; y += state.params.edoSteps) {
    const px = yToPx(y);
    ctx.beginPath();
    ctx.moveTo(pad, px);
    ctx.lineTo(canvas.width - pad, px);
    ctx.stroke();
  }

  if (rec.anchorRange) {
    // Safe interior band used for anchor placement.
    const top = yToPx(rec.anchorRange.amax);
    const bottom = yToPx(rec.anchorRange.amin);
    const bandY = Math.min(top, bottom);
    const bandH = Math.abs(bottom - top);
    ctx.save();
    ctx.fillStyle = "rgba(15, 76, 92, 0.08)";
    ctx.fillRect(pad, bandY, canvas.width - pad * 2, bandH);
    ctx.restore();
  }

  ctx.fillStyle = "#1b1b1b";
  ctx.font = "12px 'Palatino Linotype', serif";
  state.hoverPoints = [];
  rec.endpoints.forEach(([lo, hi], idx) => {
    const x = xIntervalToPx(idx);
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yToPx(lo));
    ctx.lineTo(x, yToPx(hi));
    ctx.stroke();

    const a = rec.anchors[idx];
    ctx.beginPath();
    ctx.arc(x, yToPx(lo), 3.5, 0, Math.PI * 2);
    ctx.fill();
    state.hoverPoints.push({ pitch: lo, x, y: yToPx(lo), type: "endpoint" });
    ctx.beginPath();
    ctx.arc(x, yToPx(hi), 3.5, 0, Math.PI * 2);
    ctx.fill();
    state.hoverPoints.push({ pitch: hi, x, y: yToPx(hi), type: "endpoint" });
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x, yToPx(a), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Float anchor ring shows where the continuous anchor lands before quantization.
    const aFloat = rec.anchorFloats ? rec.anchorFloats[idx] : a;
    ctx.save();
    ctx.strokeStyle = "rgba(15, 76, 92, 0.8)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, yToPx(aFloat), 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillText(`a=${a}`, x + 6, yToPx(a) + 4);
    ctx.fillText(`lo=${lo}`, x + 6, yToPx(lo) + 12);
    ctx.fillText(`hi=${hi}`, x + 6, yToPx(hi) - 4);
  });

  const xAll = compositeX;
  const xAlpha = auxLeft + quarter / 3;
  const xBeta = auxLeft + (2 * quarter) / 3;
  state.hoverPoints = rec.pitches.map((p) => ({
    pitch: p,
    x: xAll,
    y: yToPx(p)
  }));
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  rec.endpoints.forEach(([lo, hi], idx) => {
    const x = xIntervalToPx(idx);
    [lo, hi].forEach((p) => {
      const y = yToPx(p);
      ctx.beginPath();
      ctx.moveTo(xAll, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
  });
  ctx.restore();

  rec.pitches.forEach((p) => {
    ctx.beginPath();
    ctx.arc(xAll, yToPx(p), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`${p}`, xAll + 6, yToPx(p) + 4);
    state.hoverPoints.push({ pitch: p, x: xAll, y: yToPx(p), type: "all" });
  });

  if (state.hoverPitch !== null) {
    const y = yToPx(state.hoverPitch);
    ctx.save();
    ctx.fillStyle = "rgba(255, 210, 0, 0.35)";
    ctx.strokeStyle = "rgba(255, 180, 0, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(xAll, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (state.params.placementMode === "v2" && state.hoverPitch !== null) {
    const betaZeroData = betaZeroPitchesForPerm(rec.perm, state.params, L);
    if (betaZeroData) {
      const compositeList = endpointsListFromEndpoints(rec.endpoints);
      ctx.save();
      ctx.fillStyle = "rgba(15, 76, 92, 0.8)";
      ctx.strokeStyle = "rgba(15, 76, 92, 0.6)";
      ctx.lineWidth = 1;
      ctx.font = "12px 'Palatino Linotype', serif";
      betaZeroData.pitches.forEach((p) => {
        ctx.beginPath();
        ctx.arc(xBeta, yToPx(p), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const label = `${p}`;
        const metrics = ctx.measureText(label);
        ctx.fillText(label, xBeta - metrics.width - 6, yToPx(p) + 3);
      });
      const betaSorted = betaZeroData.endpointList;
      const compSorted = compositeList;
      const count = Math.min(betaSorted.length, compSorted.length);
      ctx.strokeStyle = "rgba(200, 40, 40, 0.6)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < count; i++) {
        const yFrom = yToPx(betaSorted[i]);
        const yTo = yToPx(compSorted[i]);
        ctx.beginPath();
        ctx.moveTo(xBeta + 3, yFrom);
        ctx.lineTo(xAll - 3, yTo);
        ctx.stroke();
      }
      const label = "β=0";
      const metrics = ctx.measureText(label);
      const labelPaddingX = 6;
      const labelPaddingY = 4;
      const labelWidth = metrics.width + labelPaddingX * 2;
      const labelHeight = 16 + labelPaddingY;
      const labelX = xBeta - labelWidth / 2;
      const labelY = pad - labelHeight - 8;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = "rgba(15, 76, 92, 0.6)";
      ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
      ctx.fillStyle = "rgba(15, 76, 92, 0.9)";
      ctx.fillText(label, labelX + labelPaddingX, labelY + labelHeight - 6);
      ctx.restore();
    }

    const alphaZeroData = alphaZeroPitchesForPerm(rec.perm, state.params, L);
    if (alphaZeroData) {
      const compositeList = endpointsListFromEndpoints(rec.endpoints);
      ctx.save();
      ctx.fillStyle = "rgba(40, 80, 200, 0.8)";
      ctx.strokeStyle = "rgba(40, 80, 200, 0.6)";
      ctx.lineWidth = 1;
      ctx.font = "12px 'Palatino Linotype', serif";
      alphaZeroData.pitches.forEach((p) => {
        ctx.beginPath();
        ctx.arc(xAlpha, yToPx(p), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const label = `${p}`;
        const metrics = ctx.measureText(label);
        ctx.fillText(label, xAlpha - metrics.width - 6, yToPx(p) + 3);
      });
      const alphaSorted = alphaZeroData.endpointList;
      const compSorted = compositeList;
      const count = Math.min(alphaSorted.length, compSorted.length);
      ctx.strokeStyle = "rgba(40, 80, 200, 0.6)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < count; i++) {
        const yFrom = yToPx(alphaSorted[i]);
        const yTo = yToPx(compSorted[i]);
        ctx.beginPath();
        ctx.moveTo(xAlpha + 3, yFrom);
        ctx.lineTo(xAll - 3, yTo);
        ctx.stroke();
      }
      const label = "α=0";
      const metrics = ctx.measureText(label);
      const labelPaddingX = 6;
      const labelPaddingY = 4;
      const labelWidth = metrics.width + labelPaddingX * 2;
      const labelHeight = 16 + labelPaddingY;
      const labelX = xAlpha - labelWidth / 2;
      const labelY = pad - labelHeight - 8;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = "rgba(40, 80, 200, 0.6)";
      ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
      ctx.fillStyle = "rgba(40, 80, 200, 0.9)";
      ctx.fillText(label, labelX + labelPaddingX, labelY + labelHeight - 6);
      ctx.restore();
    }
  }

  if (state.hoverPitch !== null) {
    const baseIndex = rec.pitches.indexOf(state.hoverPitch);
    const spineBase = xAll + 20;
    const upItems = rec.pitches
      .filter((p) => p > state.hoverPitch)
      .map((p) => ({ p, interval: Math.abs(p - state.hoverPitch) }))
      .sort((a, b) => a.interval - b.interval);
    const downItems = rec.pitches
      .filter((p) => p < state.hoverPitch)
      .map((p) => ({ p, interval: Math.abs(p - state.hoverPitch) }))
      .sort((a, b) => a.interval - b.interval);
    state.hoverWindowL = L || 1;
    const spineStep = 15;
    const drawSet = (items) => {
      items.forEach((item, idx) => {
        const p = item.p;
        const y1 = yToPx(state.hoverPitch);
        const y2 = yToPx(p);
        const dx = idx * spineStep;
        const hue = hueForInterval(item.interval, state.hoverWindowL);
        ctx.strokeStyle = `hsla(${hue}, 60%, 45%, 0.85)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xAll, y2);
        ctx.lineTo(spineBase + dx, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(spineBase + dx, y1);
        ctx.lineTo(spineBase + dx, y2);
        ctx.stroke();

        const midY = (y1 + y2) / 2;
        const label = `${item.interval}`;
        const labelX = spineBase + dx;
        const labelY = midY;
        ctx.font = "12px 'Palatino Linotype', serif";
        const metrics = ctx.measureText(label);
        const paddingX = 4;
        const paddingY = 4;
        const boxW = metrics.width + paddingX * 2;
        const boxH = 16 + paddingY;
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH);
        ctx.strokeStyle = `hsla(${hue}, 60%, 45%, 0.85)`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH);
        ctx.fillStyle = `hsla(${hue}, 60%, 35%, 0.95)`;
        ctx.fillText(label, labelX - metrics.width / 2, labelY + 4);
      });
    };

    drawSet(upItems);
    drawSet(downItems);
    void baseIndex;
    ctx.fillStyle = "#1b1b1b";
  } else {
    state.hoverWindowL = null;
  }
}

function renderCounts(inducedCounts) {
  const maxPerLine = 8;
  const parts = inducedCounts.map(([d, c]) => (
    `<span class="count-item" data-interval="${d}" data-total="${c}">${d}(${c})</span>`
  ));
  const rows = [];
  for (let i = 0; i < parts.length; i += maxPerLine) {
    rows.push(parts.slice(i, i + maxPerLine));
  }
  return rows.map((row) => `<div class="metric-row">${row.join("")}</div>`).join("");
}

function renderIntervals(intervals) {
  const maxPerLine = 8;
  const counts = {};
  const groups = [];
  intervals.forEach((d) => {
    const last = groups[groups.length - 1];
    if (!last || last.value !== d) {
      groups.push({ value: d, items: [d] });
    } else {
      last.items.push(d);
    }
  });
  const rows = [];
  let current = [];
  let currentCount = 0;
  groups.forEach((group) => {
    const items = group.items.map((d) => {
      counts[d] = (counts[d] || 0) + 1;
      return `<span class="interval-item" data-interval="${d}" data-occurrence="${counts[d]}">${d}</span>`;
    });
    const groupCount = items.length;
    const wouldExceed = currentCount > 0 && currentCount + groupCount > maxPerLine;
    if (wouldExceed) {
      rows.push(current);
      current = [];
      currentCount = 0;
    }
    current = current.concat(items);
    currentCount += groupCount;
    if (currentCount >= maxPerLine) {
      rows.push(current);
      current = [];
      currentCount = 0;
    }
  });
  if (currentCount > 0) {
    rows.push(current);
  }
  return rows.map((row) => `<div class="metric-row">${row.join("")}</div>`).join("");
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
  if (hasWeights) {
    columns.push(
      { key: "slack", label: "s", format: (v) => formatNumber(v, 0) },
      { key: "weight", label: "w", format: (v) => formatNumber(v, 2) },
      { key: "prefix", label: "u (P/W)", format: (v) => v }
    );
  }
  const metrics = hasWeights ? anchorMetricsFromRecord(rec) : null;
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
      slack: metrics ? metrics.slack[idx] : null,
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
  if (rec.slack && rec.weights && rec.prefixFractions && rec.prefixSums && rec.totalWeight) {
    return {
      slack: rec.slack,
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
  return { slack, weights, prefixSums, prefixFractions, totalWeight };
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

function intervalCountsFromPitch(pitches, pitch) {
  const counts = new Map();
  pitches.forEach((p) => {
    if (p !== pitch) {
      const d = Math.abs(p - pitch);
      counts.set(d, (counts.get(d) || 0) + 1);
    }
  });
  return counts;
}

function clearCountHighlights() {
  const items = els.selectedInfo.querySelectorAll(".count-item, .interval-item");
  items.forEach((el) => {
    el.classList.remove("highlight");
    el.classList.remove("partial");
    el.classList.remove("hover-count");
    el.removeAttribute("data-hover");
    el.style.removeProperty("--hover-hue");
    el.style.color = "";
    el.style.borderColor = "";
  });
  const pitchItems = els.selectedInfo.querySelectorAll(".pitch-item, .pitch-name, .pitch-pc");
  pitchItems.forEach((el) => el.classList.remove("pitch-highlight"));
}

function highlightCounts(countMap) {
  const totals = new Map();
  els.selectedInfo.querySelectorAll(".count-item").forEach((el) => {
    const interval = parseInt(el.dataset.interval, 10);
    const total = parseInt(el.dataset.total || "0", 10);
    totals.set(interval, total);
  });
  const countItems = els.selectedInfo.querySelectorAll(".count-item");
  countItems.forEach((el) => {
    const interval = parseInt(el.dataset.interval, 10);
    if (countMap.has(interval)) {
      el.classList.add("highlight");
      const total = totals.get(interval) || 0;
      const localCount = countMap.get(interval) || 0;
      if (total && localCount < total) {
        el.classList.add("partial");
      }
      el.classList.add("hover-count");
      el.dataset.hover = `${localCount}`;
      const maxInterval = state.hoverWindowL || interval || 1;
      const hue = hueForInterval(interval, maxInterval);
      el.style.setProperty("--hover-hue", hue);
      el.style.color = `hsl(${hue}, 60%, 45%)`;
      el.style.borderColor = `hsla(${hue}, 60%, 45%, 0.85)`;
    } else {
      el.classList.remove("highlight");
      el.classList.remove("partial");
      el.classList.remove("hover-count");
      el.removeAttribute("data-hover");
      el.style.color = "";
      el.style.borderColor = "";
    }
  });
  const intervalItems = els.selectedInfo.querySelectorAll(".interval-item");
  intervalItems.forEach((el) => {
    const interval = parseInt(el.dataset.interval, 10);
    const occurrence = parseInt(el.dataset.occurrence || "0", 10);
    if (countMap.has(interval) && occurrence <= (countMap.get(interval) || 0)) {
      el.classList.add("highlight");
      const total = totals.get(interval) || 0;
      const localCount = countMap.get(interval) || 0;
      if (total && localCount < total) {
        el.classList.add("partial");
      }
      const maxInterval = state.hoverWindowL || interval || 1;
      const hue = hueForInterval(interval, maxInterval);
      el.style.color = `hsl(${hue}, 60%, 45%)`;
      el.style.borderColor = `hsla(${hue}, 60%, 45%, 0.85)`;
    } else {
      el.classList.remove("highlight");
      el.classList.remove("partial");
      el.style.color = "";
      el.style.borderColor = "";
    }
  });
  const pitchItems = els.selectedInfo.querySelectorAll(".pitch-item, .pitch-name, .pitch-pc");
  pitchItems.forEach((el) => {
    const pitch = parseInt(el.dataset.pitch, 10);
    if (pitch === state.hoverPitch) {
      el.classList.add("pitch-highlight");
    } else {
      el.classList.remove("pitch-highlight");
    }
  });
}

function updateHoverCountsLine(countMap) {
  const line = document.getElementById("hoverCountsLine");
  if (!line) return;
  if (!countMap || countMap.size === 0) {
    line.textContent = "hover counts: —";
    return;
  }
  const parts = Array.from(countMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([d, c]) => `${d}(${c})`);
  line.textContent = `hover counts: ${parts.join(" ")}`;
}

function renderKeyboard() {
  if (!els.keyboard) return;
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  const edo = state.params.edoSteps;
  if (!rec || edo !== 12) {
    els.keyboard.innerHTML = "<div class=\"meta-line\">Keyboard view uses 12-EDO.</div>";
    return;
  }
  const O = state.activeO;
  const L = O * edo;
  const baseMidi = getBaseMidi();
  const activeSet = new Set(rec.pitches.map((p) => p));
  const hoverPitch = state.hoverPitch;
  const whiteKeys = [];
  const blackKeys = [];
  let whiteIndex = 0;
  const styles = getComputedStyle(els.keyboard);
  const whiteWidth = parseFloat(styles.getPropertyValue("--white-width")) || 22;
  const blackWidth = parseFloat(styles.getPropertyValue("--black-width")) || 14;
  for (let step = 0; step <= L; step++) {
    const midi = baseMidi + step;
    const note = ((midi % 12) + 12) % 12;
    const isBlack = note === 1 || note === 3 || note === 6 || note === 8 || note === 10;
    if (!isBlack) {
      const classes = ["white-key"];
      if (activeSet.has(step)) classes.push("active");
      if (hoverPitch === step) classes.push("hover");
      whiteKeys.push(`<div class="${classes.join(" ")}" data-pitch="${step}"></div>`);
      whiteIndex += 1;
    } else {
      const left = whiteIndex * whiteWidth - blackWidth / 2;
      const classes = ["black-key"];
      if (activeSet.has(step)) classes.push("active");
      if (hoverPitch === step) classes.push("hover");
      blackKeys.push(`<div class="${classes.join(" ")}" data-pitch="${step}" style="left:${left}px"></div>`);
    }
  }
  els.keyboard.innerHTML = `
    <div class="keyboard-keys">
      <div class="white-keys">${whiteKeys.join("")}</div>
      <div class="black-keys">${blackKeys.join("")}</div>
    </div>
  `;
}

function parseGuitarTuning(text) {
  if (!text) return [];
  const tokens = text.trim().includes(" ")
    ? text.trim().split(/\s+/)
    : (text.match(/[A-Ga-g](?:#|b)?/g) || []);
  const semis = {
    C: 0, "C#": 1, Db: 1,
    D: 2, "D#": 3, Eb: 3,
    E: 4,
    F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10,
    B: 11
  };
  return tokens.map((t) => semis[t.toUpperCase()] ?? null).filter((v) => v !== null);
}

function noteNameFromMidi(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[pc]}${octave}`;
}

function renderFretboard() {
  if (!els.fretboard) return;
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  const edo = state.params.edoSteps;
  if (!rec || edo !== 12) {
    els.fretboard.innerHTML = "<div class=\"meta-line\">Fretboard view uses 12-EDO.</div>";
    return;
  }
  const tuning = parseGuitarTuning(els.guitarTuning.value || "EADGBE");
  if (!tuning.length) {
    els.fretboard.innerHTML = "<div class=\"meta-line\">Enter a tuning to show the fretboard.</div>";
    return;
  }
  const baseMidi = getBaseMidi();
  const pitchMidis = rec.pitches.map((p) => baseMidi + p);
  const activeMidis = new Set(pitchMidis);
  const midiToPitch = new Map(pitchMidis.map((midi, idx) => [midi, rec.pitches[idx]]));
  const hoverMidi = state.hoverPitch === null ? null : baseMidi + state.hoverPitch;
  const L = state.activeO * edo;
  const styles = getComputedStyle(els.fretboard);
  const baseWidth = parseFloat(styles.getPropertyValue("--fret-width")) || 29;
  const paddingLeft = parseFloat(styles.paddingLeft) || 0;
  const paddingRight = parseFloat(styles.paddingRight) || 0;
  const availableWidth = Math.max(0, els.fretboard.clientWidth - paddingLeft - paddingRight);
  const fretDecay = Math.pow(1 / 1.3, 1 / 11);
  let widths = Array.from({ length: 25 }, (_, idx) => {
    if (idx === 0) return baseWidth;
    const width = baseWidth * Math.pow(fretDecay, idx - 1);
    return Math.max(baseWidth * 0.6, width);
  });
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  if (totalWidth > 0) {
    const scale = 1.1;
    widths = widths.map((w) => w * scale);
  }
  els.fretboard.style.setProperty("--nut-left", `${widths[0]}px`);
  const openMidis = [];
  tuning.forEach((pc, idx) => {
    if (idx === 0) {
      const offsetDown = (baseMidi - pc + 12) % 12;
      openMidis.push(baseMidi - offsetDown);
      return;
    }
    const prev = openMidis[idx - 1];
    let offsetUp = (pc - (prev % 12) + 12) % 12;
    if (offsetUp === 0) offsetUp = 12;
    openMidis.push(prev + offsetUp);
  });
  const rows = [...openMidis].reverse().map((openMidi) => {
    const cells = [];
    for (let fret = 0; fret <= 24; fret++) {
      const midi = openMidi + fret;
      const isActive = activeMidis.has(midi);
      const pitch = midiToPitch.get(midi);
      const hue = Number.isFinite(pitch) ? hueForInterval(pitch, L || 1) : 0;
      const dotClass = ["fret-dot"];
      if (hoverMidi === midi) dotClass.push("hover");
      const title = noteNameFromMidi(midi);
      const dot = isActive
        ? `<span class="${dotClass.join(" ")}" style="--fret-hue:${hue}">${pitch}</span>`
        : "";
      const cellClass = `fret-cell${(fret % 12 === 0 || fret % 12 === 3 || fret % 12 === 5 || fret % 12 === 7 || fret % 12 === 9) ? " marker" : ""}`;
      cells.push(`<div class="${cellClass}" style="width:${widths[fret].toFixed(2)}px" title="${title}">${dot}</div>`);
    }
    return `<div class="fret-row">${cells.join("")}</div>`;
  });
  const markers = [];
  for (let fret = 0; fret <= 24; fret++) {
    const label = fret === 0
      ? "OPEN"
      : (fret % 12 === 0 || fret % 12 === 3 || fret % 12 === 5
        || fret % 12 === 7 || fret % 12 === 9) ? `${fret}` : "";
    markers.push(`<div class="fret-marker" style="width:${widths[fret].toFixed(2)}px">${label}</div>`);
  }
  els.fretboard.innerHTML = `
    <div class="fretboard-rows">${rows.join("")}</div>
    <div class="fretboard-markers">${markers.join("")}</div>
  `;
}

function setHoverPitch(pitch) {
  if (pitch === null) {
    if (state.hoverPitch !== null) {
      state.hoverPitch = null;
      clearCountHighlights();
      renderPlot();
      updateHoverInfo();
      updateHoverCountsLine(null);
      renderKeyboard();
      renderFretboard();
    }
    return;
  }
  if (pitch !== state.hoverPitch) {
    state.hoverPitch = pitch;
    state.hoverWindowL = state.activeO * state.params.edoSteps;
    const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
    if (rec) {
      const counts = intervalCountsFromPitch(rec.pitches, pitch);
      highlightCounts(counts);
      updateHoverCountsLine(counts);
    }
    renderPlot();
    updateHoverInfo();
    renderKeyboard();
    renderFretboard();
  }
}

function render() {
  buildTabs(Object.keys(state.resultsByO).map(Number));
  updateTable();
  renderPlot();
  updateMeta();
  updateHoverInfo();
  renderKeyboard();
  renderFretboard();
  renderFavorites();
  const rec = (state.resultsByO[state.activeO] || [])[0];
  if (rec) {
    els.anchorSummary.textContent = `anchors: ${rec.anchors.join(" ")}`;
  } else {
    els.anchorSummary.textContent = "";
  }
}

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
  const Os = [];
  let permCount = 0;
  for (let O = minO; O <= maxO; O++) {
    const { records } = computeForWindow(intervals, state.params, O);
    state.resultsByO[O] = records;
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
  renderPlacementParams(els.placementMode.value || "v2");
  renderMidiParams();
  const storedFilter = localStorage.getItem(storageKeys.filter);
  if (storedFilter) els.filter.value = storedFilter;
}

function loadFavorites() {
  const stored = localStorage.getItem(storageKeys.favorites);
  if (!stored) {
    state.favorites = [];
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    state.favorites = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.favorites = [];
  }
}

function saveFavorites() {
  localStorage.setItem(storageKeys.favorites, JSON.stringify(state.favorites));
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

function captureFavoriteSnapshot(rec) {
  return {
    intervals: els.intervals.value,
    O: state.activeO,
    perm: rec.perm,
    pitches: rec.pitches,
    placementMode: els.placementMode.value || "v2",
    placementParams: capturePlacementParamValues(),
    oddBias: state.oddBias.slice(),
    edo: els.edo.value,
    baseNote: els.baseNote.value,
    baseOctave: els.baseOctave.value,
    minO: els.minO.value,
    maxO: els.maxO.value,
    xSpacing: els.xSpacing.value,
    useDamping: els.useDamping.value
  };
}

function favoriteKeyFromSnapshot(snapshot) {
  return JSON.stringify({
    intervals: snapshot.intervals,
    O: snapshot.O,
    perm: snapshot.perm,
    placementMode: snapshot.placementMode,
    placementParams: snapshot.placementParams,
    oddBias: snapshot.oddBias,
    edo: snapshot.edo,
    useDamping: snapshot.useDamping
  });
}

function favoriteKey(rec) {
  const O = state.activeO;
  return `${els.intervals.value}|O${O}|${rec.perm.join(",")}|${rec.pitches.join(",")}`;
}

function toggleFavorite(rec) {
  const snapshot = captureFavoriteSnapshot(rec);
  const key = favoriteKeyFromSnapshot(snapshot);
  const legacyKey = favoriteKey(rec);
  const idx = state.favorites.findIndex((f) => f.key === key || f.key === legacyKey);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
  } else {
    state.favorites.push({
      key,
      snapshot,
      intervals: els.intervals.value,
      O: state.activeO,
      perm: rec.perm,
      pitches: rec.pitches,
      total: rec.total,
      perPair: rec.perPair
    });
  }
  saveFavorites();
}

function applyFavoriteSnapshot(snapshot) {
  els.intervals.value = snapshot.intervals || els.intervals.value;
  els.edo.value = snapshot.edo || els.edo.value;
  els.baseNote.value = snapshot.baseNote || els.baseNote.value;
  els.baseOctave.value = snapshot.baseOctave || els.baseOctave.value;
  els.minO.value = snapshot.minO || els.minO.value;
  els.maxO.value = snapshot.maxO || els.maxO.value;
  els.xSpacing.value = snapshot.xSpacing || els.xSpacing.value;
  els.useDamping.value = snapshot.useDamping || els.useDamping.value;
  els.placementMode.value = snapshot.placementMode || els.placementMode.value;
  renderPlacementParams(els.placementMode.value || "v2");
  const paramValues = snapshot.placementParams || {};
  Object.entries(paramValues).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
  });
  if (Array.isArray(snapshot.oddBias)) {
    state.pendingOddBias = snapshot.oddBias.slice();
    localStorage.setItem(storageKeys.oddBias, JSON.stringify(snapshot.oddBias));
  }
  saveInputs();
  recompute();
}

function captureCurrentSettingsSnapshot() {
  return {
    intervals: els.intervals.value,
    O: state.activeO,
    perm: null,
    pitches: null,
    placementMode: els.placementMode.value || "v2",
    placementParams: capturePlacementParamValues(),
    oddBias: state.oddBias.slice(),
    edo: els.edo.value,
    baseNote: els.baseNote.value,
    baseOctave: els.baseOctave.value,
    minO: els.minO.value,
    maxO: els.maxO.value,
    xSpacing: els.xSpacing.value,
    useDamping: els.useDamping.value
  };
}

function snapshotsDiffer(a, b) {
  if (!a || !b) return false;
  const keys = [
    "intervals",
    "placementMode",
    "edo",
    "useDamping"
  ];
  if (keys.some((key) => `${a[key]}` !== `${b[key]}`)) return true;
  const paramsA = { ...(a.placementParams || {}) };
  const paramsB = { ...(b.placementParams || {}) };
  delete paramsA.midiTailMs;
  delete paramsB.midiTailMs;
  const paramKeys = new Set([...Object.keys(paramsA), ...Object.keys(paramsB)]);
  for (const key of paramKeys) {
    if (`${paramsA[key]}` !== `${paramsB[key]}`) return true;
  }
  const biasA = Array.isArray(a.oddBias) ? a.oddBias.join("|") : "";
  const biasB = Array.isArray(b.oddBias) ? b.oddBias.join("|") : "";
  return biasA !== biasB;
}

function openFavoritePrompt(message, handlers) {
  if (!els.favoritePrompt) return;
  els.favoritePromptText.textContent = message;
  state.favoritePromptHandlers = handlers;
  els.favoritePrompt.classList.remove("hidden");
}

function closeFavoritePrompt() {
  if (!els.favoritePrompt) return;
  els.favoritePrompt.classList.add("hidden");
  state.favoritePromptHandlers = null;
}

function finalizeFavoriteSelection(fav, targetO) {
  const recs = state.resultsByO[targetO] || [];
  const match = recs.find((r) => r.perm.join(" ") === fav.perm.join(" "));
  if (match) {
    state.activeO = targetO;
    state.selected = match;
    localStorage.setItem(storageKeys.activeO, targetO.toString());
    localStorage.setItem(storageKeys.selectedPerm, match.perm.join(" "));
    render();
  }
}

function renderFavorites() {
  els.favoritesList.innerHTML = "";
  if (!state.favorites.length) {
    els.favoritesList.textContent = "No favorites yet.";
    return;
  }
  const table = document.createElement("table");
  table.className = "favorites-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Permutation</th>
        <th>Pitches</th>
        <th>O</th>
        <th>Tension</th>
        <th>Per pair</th>
        <th>Engine</th>
        <th>Select</th>
        <th>Remove</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  state.favorites.forEach((fav) => {
    const row = document.createElement("tr");
    const total = typeof fav.total === "number" ? fav.total.toFixed(3) : "n/a";
    const perPair = typeof fav.perPair === "number" ? fav.perPair.toFixed(3) : "n/a";
    const engineLabel = fav.snapshot ? engineLabelForId(fav.snapshot.placementMode) : "";
    const btn = document.createElement("button");
    btn.textContent = "Select";
    btn.addEventListener("click", () => {
      const snapshot = fav.snapshot;
      if (snapshot) {
        const currentSnapshot = captureCurrentSettingsSnapshot();
        const snapshotMode = snapshot.placementMode || "v2";
        if (snapshotsDiffer(currentSnapshot, snapshot)) {
          const message = `Favorite settings differ from current. (Engine: ${engineLabelForId(snapshotMode)}.) Choose how to load it.`;
          openFavoritePrompt(message, {
            onSwitch: () => {
              applyFavoriteSnapshot(snapshot);
              finalizeFavoriteSelection(fav, snapshot.O);
            },
            onImport: () => {
              els.intervals.value = snapshot.intervals || els.intervals.value;
              saveInputs();
              recompute();
              finalizeFavoriteSelection(fav, snapshot.O);
            },
            onCancel: () => {}
          });
          return;
        }
        applyFavoriteSnapshot(snapshot);
        finalizeFavoriteSelection(fav, snapshot.O);
        return;
      }
      finalizeFavoriteSelection(fav, fav.O);
    });
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.className = "ghost";
    removeBtn.addEventListener("click", () => {
      const idx = state.favorites.findIndex((f) => f.key === fav.key);
      if (idx >= 0) {
        state.favorites.splice(idx, 1);
        saveFavorites();
        renderFavorites();
      }
    });
    const cells = [
      fav.perm.join(" "),
      fav.pitches.join(" "),
      `O${fav.O}`,
      total,
      perPair,
      engineLabel || "—"
    ];
    cells.forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      row.appendChild(td);
    });
    const selectTd = document.createElement("td");
    selectTd.appendChild(btn);
    row.appendChild(selectTd);
    const removeTd = document.createElement("td");
    removeTd.appendChild(removeBtn);
    row.appendChild(removeTd);
    tbody.appendChild(row);
  });
  els.favoritesList.appendChild(table);
}

async function requestMidiAccess() {
  if (!navigator.requestMIDIAccess) {
    els.status.textContent = "Web MIDI not supported in this browser";
    return null;
  }
  if (midiAccess) return midiAccess;
  try {
    midiAccess = await navigator.requestMIDIAccess();
    midiAccess.onstatechange = refreshMidiOutputs;
    refreshMidiOutputs();
    return midiAccess;
  } catch (err) {
    els.status.textContent = "MIDI access denied";
    return null;
  }
}

function refreshMidiOutputs() {
  midiOutputs = midiAccess ? Array.from(midiAccess.outputs.values()) : [];
  const current = localStorage.getItem(storageKeys.midiOut) || "";
  els.midiOut.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No device";
  els.midiOut.appendChild(empty);
  midiOutputs.forEach((out) => {
    const opt = document.createElement("option");
    opt.value = out.id;
    opt.textContent = out.name || out.id;
    els.midiOut.appendChild(opt);
  });
  if (current) {
    els.midiOut.value = current;
  }
}

function getSelectedOutput() {
  const id = els.midiOut.value;
  if (!id) return null;
  return midiOutputs.find((out) => out.id === id) || null;
}

function previewSelected() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) return;
  requestMidiAccess().then(() => {
    const out = getSelectedOutput();
    if (!out) {
      els.status.textContent = "Select a MIDI output";
      return;
    }
    const baseNote = parseInt(els.baseNote.value, 10) || 0;
    const baseOctave = parseInt(els.baseOctave.value, 10) || 4;
    const baseMidi = (baseOctave + 1) * 12 + baseNote;
    const notes = rec.pitches.map((p) => baseMidi + p).filter((n) => n >= 0 && n <= 127);
    const now = window.performance.now();
    const durationMs = 2000;
    notes.forEach((note) => out.send([0x90, note, 80], now));
    notes.forEach((note) => out.send([0x80, note, 64], now + durationMs));
  });
}

function scheduleNoteOnOff(out, note, onTime, durationMs, velocity) {
  out.send([0x90, note, velocity], onTime);
  out.send([0x80, note, 64], onTime + durationMs);
}

function scheduleNoteOn(out, note, onTime, velocity) {
  out.send([0x90, note, velocity], onTime);
}

function scheduleNoteOff(out, note, offTime) {
  out.send([0x80, note, 64], offTime);
}

function getBaseMidi() {
  const baseNote = parseInt(els.baseNote.value, 10) || 0;
  const baseOctave = parseInt(els.baseOctave.value, 10) || 4;
  return (baseOctave + 1) * 12 + baseNote;
}

function playIntervalSequence() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) return;
  requestMidiAccess().then(() => {
    const out = getSelectedOutput();
    if (!out) {
      els.status.textContent = "Select a MIDI output";
      return;
    }
    const baseMidi = getBaseMidi();
    const now = window.performance.now();
    const durationMs = 420;
    const gapMs = 120;
    const velocity = 80;
    const usedNotes = new Set();
    rec.endpoints.forEach(([low, high], idx) => {
      const start = now + idx * (durationMs + gapMs);
      const lowNote = baseMidi + low;
      const highNote = baseMidi + high;
      if (lowNote >= 0 && lowNote <= 127) {
        scheduleNoteOn(out, lowNote, start, velocity);
        usedNotes.add(lowNote);
      }
      if (highNote >= 0 && highNote <= 127) {
        scheduleNoteOn(out, highNote, start, velocity);
        usedNotes.add(highNote);
      }
    });
    const tailMs = state.params.midiTailMs || 0;
    const endTime = now + rec.endpoints.length * (durationMs + gapMs) + tailMs;
    usedNotes.forEach((note) => scheduleNoteOff(out, note, endTime));
  });
}

function playArpeggioSequence() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) return;
  requestMidiAccess().then(() => {
    const out = getSelectedOutput();
    if (!out) {
      els.status.textContent = "Select a MIDI output";
      return;
    }
    const baseMidi = getBaseMidi();
    const now = window.performance.now();
    const durationMs = 320;
    const gapMs = 90;
    const velocity = 78;
    const usedNotes = new Set();
    rec.pitches.forEach((pitch, idx) => {
      const start = now + idx * (durationMs + gapMs);
      const note = baseMidi + pitch;
      if (note >= 0 && note <= 127) {
        scheduleNoteOn(out, note, start, velocity);
        usedNotes.add(note);
      }
    });
    const tailMs = state.params.midiTailMs || 0;
    const endTime = now + rec.pitches.length * (durationMs + gapMs) + tailMs;
    usedNotes.forEach((note) => scheduleNoteOff(out, note, endTime));
  });
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
window.addEventListener("resize", () => {
  renderPlot();
});
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

if (els.favoriteSwitchBtn) {
  els.favoriteSwitchBtn.addEventListener("click", () => {
    const handlers = state.favoritePromptHandlers;
    closeFavoritePrompt();
    if (handlers && handlers.onSwitch) handlers.onSwitch();
  });
}
if (els.favoriteImportBtn) {
  els.favoriteImportBtn.addEventListener("click", () => {
    const handlers = state.favoritePromptHandlers;
    closeFavoritePrompt();
    if (handlers && handlers.onImport) handlers.onImport();
  });
}
if (els.favoriteCancelBtn) {
  els.favoriteCancelBtn.addEventListener("click", () => {
    const handlers = state.favoritePromptHandlers;
    closeFavoritePrompt();
    if (handlers && handlers.onCancel) handlers.onCancel();
  });
}

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
recompute();
