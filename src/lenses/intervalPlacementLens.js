// Purpose: intervalPlacementLens.js provides exports: anchorsForPerm, evaluateIntervalPlacementLens, intervalPlacementLens, placementEngineLabel, quantizeInterval.
// Interacts with: imports: ../core/defaultParams.js, ../core/displayHelpers.js, ../core/intervalMath.js, ../core/invariants.js, ../core/materialTypes.js... (+5 more).
// Role: lens domain layer module within the broader app graph.
import { computePrefixDominanceAnchors } from "../placementEngines/prefixDominanceEngine.js";
import { createPrefixSlackEngine } from "../placementEngines/prefixSlackEngine.js";
import { createRepulsionCentersEngine } from "../placementEngines/repulsionCentersEngine.js";
import { MATERIAL_TYPES } from "../core/materialTypes.js";
import { formatNumericTree } from "../core/displayHelpers.js";
import { makeDraft } from "../core/invariants.js";
import {
  clamp,
  rhoPlace,
  quantizedSplit,
  centerBoundsForPerm,
  neutralCentersFromBounds,
  projectedPairwiseSolve,
  repulsionDeltasForPerm,
  accumulateRepulsionForces,
  repulsionDiagnostics,
  minPairwiseDistance,
  anchorRangeFromBounds
} from "../core/placementMath.js";
import {
  inducedIntervals,
  intervalCounts,
  octaveReducedIntervalVector,
  pitchesFromEndpoints,
  primeFormRahnForte,
  sonorityPenalty,
  calibrateAlpha
} from "../core/intervalMath.js";
import { defaultParams } from "../core/defaultParams.js";
import { resolveValuesForRole } from "./inputResolution.js";

const LENS_ID = "intervalPlacement";
const LENS_VERSION = "1.0";

function lowBiasSplit(length) {
  const down = Math.floor((length + 1) / 2);
  const up = length - down;
  return [down, up];
}

function biasedSplit(length, flipOdd) {
  const [down, up] = lowBiasSplit(length);
  if (length % 2 === 1 && flipOdd) {
    return [up, down];
  }
  return [down, up];
}

function safeAnchorRange(L, intervals) {
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

function endpointsForPerm(anchors, perm, oddBias) {
  return anchors.map((a, idx) => {
    const l = perm[idx];
    const flipOdd = oddBias[idx] === "up";
    const [down, up] = biasedSplit(l, flipOdd);
    return [a - down, a + up];
  });
}

export function quantizeInterval(anchor, length, rho, oddBias) {
  const A = Math.floor(anchor);
  const { down, up } = quantizedSplit(length, rho, oddBias);
  const low = A - down;
  const high = A + up;
  return { A, low, high, down, up };
}

export function anchorsForPerm(L, perm, params, oddBias) {
  const n = perm.length;
  const rho = params.anchorRho;
  const alpha = params.anchorAlpha;
  const beta = params.anchorBeta;
  const splits = perm.map((d, idx) => quantizedSplit(d, rho, oddBias[idx]));
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
  const slack = perm.map((d) => L - d);
  const weights = slack.map((s) => Math.pow(s, beta));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  let prefix = 0;
  const eps = 1e-9;
  const prefixFractions = [];
  const prefixSums = [];
  const anchorFloats = perm.map((d, idx) => {
    const t = idx / (n - 1);
    const u = prefix / totalWeight;
    const a0 = amin + t * span;
    const a1 = amin + u * span;
    const a = (1 - alpha) * a0 + alpha * a1;
    prefix += weights[idx];
    void d;
    prefixSums.push(prefix - weights[idx]);
    prefixFractions.push(u);
    return Math.min(amax, Math.max(amin, a));
  });
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

function createPlacementEngines(oddBias) {
  return {
    prefixSlack: createPrefixSlackEngine((L, perm, params) => anchorsForPerm(L, perm, params, oddBias)),
    prefixDominance: {
      id: "prefixDominance",
      label: "prefix-dominance",
      solveCenters(L, perm, params) {
        const anchorData = computePrefixDominanceAnchors(L, perm, params);
        if (!anchorData) return null;
        return {
          engineId: "prefixDominance",
          centers: anchorData.anchorFloats.slice(),
          anchors: null,
          splits: null,
          anchorRange: { amin: anchorData.amin, amax: anchorData.amax },
          bounds: anchorData.anchorFloats.map(() => ({ min: anchorData.amin, max: anchorData.amax })),
          debugFlags: {
            showBounds: true,
            showSplits: false,
            showEndpointsFloat: true,
            showWeights: true
          },
          meta: {
            weights: anchorData.weights,
            prefixSums: anchorData.prefixSums,
            prefixFractions: anchorData.prefixFractions,
            totalWeight: anchorData.totalWeight
          }
        };
      }
    },
    repulsion: createRepulsionCentersEngine({
      clamp,
      centerBoundsForPerm: (L, perm, rho) => centerBoundsForPerm(L, perm, rho, oddBias),
      neutralCentersFromBounds,
      repulsionDeltasForPerm,
      projectedPairwiseSolve,
      accumulateRepulsionForces,
      repulsionDiagnostics
    })
  };
}

function resolvePlacementEngine(mode, placementEngines) {
  if (mode === "repulse") return placementEngines.repulsion;
  if (mode === "prefixDominance") return placementEngines.prefixDominance;
  return placementEngines.prefixSlack;
}

export function placementEngineLabel(id) {
  if (id === "v1") return "uniform-centers";
  if (id === "repulse") return "repulsion-centers";
  if (id === "prefixDominance") return "prefix-dominance";
  if (id === "v2") return "prefix-slack";
  return id || "";
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

function normalizeOddBias(intervals, oddBias) {
  const fallback = intervals.map(() => "down");
  if (!Array.isArray(oddBias)) return fallback;
  if (oddBias.length !== intervals.length) return fallback;
  return oddBias.map((bias, idx) => (intervals[idx] % 2 === 1 ? bias : "down"));
}

function buildPitchListDraft(record, { lensId, lensInstanceId }) {
  const title = formatNumericTree(record.pitches, { maxLength: 64 }) || `perm ${record.perm.join(" ")}`;
  const description = [
    record.perm && record.perm.length ? `perm ${record.perm.join(" ")}` : null,
    record.engine ? `engine ${placementEngineLabel(record.engine)}` : null
  ].filter(Boolean).join(" | ");
  return makeDraft({
    lensId,
    lensInstanceId,
    type: MATERIAL_TYPES.PitchList,
    summary: description ? `${title} - ${description}` : title,
    values: record.pitches.slice()
  });
}

function computeForWindow(intervals, params, oddBias, windowOctaves) {
  const L = windowOctaves * params.edoSteps;
  const mode = params.placementMode || "v2";
  const isLegacy = mode === "v1";
  const placementEngines = createPlacementEngines(oddBias);
  const engine = isLegacy ? null : resolvePlacementEngine(mode, placementEngines);
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
      endpoints = endpointsForPerm(legacyAnchors, perm, oddBias);
      endpointsFloat = endpoints.map(([low, high]) => [low, high]);
      const splitsLegacy = perm.map((d, idx) => {
        const flipOdd = oddBias[idx] === "up";
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
        const bias = oddBias[idx];
        const { A, low, high, down, up } = quantizeInterval(c, d, rho, bias);
        anchorsList.push(A);
        splitsList.push({ down, up });
        return [low, high];
      });
      if (placement.engineId === "v2") {
        anchors = placement.anchors;
        splits = placement.splits;
        anchorRange = placement.anchorRange;
      } else {
        anchors = anchorsList;
        splits = splitsList;
        anchorRange = placement.anchorRange;
      }
      if (placement.meta) {
        slack = placement.meta.slack ?? slack;
        weights = placement.meta.weights ?? weights;
        prefixSums = placement.meta.prefixSums ?? prefixSums;
        prefixFractions = placement.meta.prefixFractions ?? prefixFractions;
        totalWeight = placement.meta.totalWeight ?? totalWeight;
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

export function evaluateIntervalPlacementLens(input = {}) {
  if (!input.context || typeof input.context.lensId !== "string" || typeof input.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const context = input.context || {};
  const instance = context.instance;
  if (!instance) {
    throw new Error("Lens instance context missing.");
  }
  const lensInputs = Array.isArray(instance.lens.inputs) ? instance.lens.inputs : [];
  const spec = lensInputs.find((entry) => entry.role === "intervals");
  const resolved = spec ? resolveValuesForRole({
    instance,
    roleSpec: spec,
    upstreamInstance: context.upstreamInstance,
    getLensInstanceById: context.getLensInstanceById,
    draftCatalog: context.draftCatalog
  }) : null;
  if (!resolved || !resolved.ok) {
    const message = resolved && resolved.message
      ? resolved.message
      : `Input ${spec ? spec.role : "intervals"} required.`;
    return {
      ok: false,
      drafts: [],
      notices: [{ level: "warn", message }]
    };
  }
  const intervals = Array.isArray(resolved.values)
    ? resolved.values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  if (!intervals.length) {
    return {
      ok: false,
      drafts: [],
      errors: ["Enter at least one interval."]
    };
  }
  const params = { ...defaultParams, ...(input.params || {}) };
  params.useDamping = params.useDamping !== false;
  params.roughAlpha = calibrateAlpha(params, 0.5);
  const windowOctaves = Number.isFinite(params.windowOctaves)
    ? params.windowOctaves
    : 3;
  const rawBias = Array.isArray(input.lensInput && input.lensInput.oddBias)
    ? input.lensInput.oddBias
    : []; 
  const biasFlags = rawBias.map((v) => (v === 1 ? "up" : "down"));
  const oddBias = normalizeOddBias(intervals, biasFlags);
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { L, records } = computeForWindow(intervals, params, oddBias, windowOctaves);
  const lensId = input.context.lensId;
  const lensInstanceId = input.context.lensInstanceId;
  const outputs = records.map((record) => buildPitchListDraft(record, { lensId, lensInstanceId }));
  const end = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    ok: true,
    drafts: outputs,
    vizModel: {
      records,
      intervals,
      oddBias,
      windowOctaves,
      params,
      diagnostics: {
        windowL: L,
        permCount: records.length,
        durationMs: end - start
      }
    },
    warnings: []
  };
}

export const intervalPlacementLens = {
  meta: {
    id: LENS_ID,
    name: "Interval Placement",
    hasVisualizer: true,
    kind: "source"
  },
  defaultParams: {
    placementMode: "v2",
    edoSteps: 12,
    baseNote: "0",
    baseOctave: 4,
    windowOctaves: 3,
    xSpacing: 0.8,
    useDamping: true,
    anchorAlpha: 0.3,
    anchorBeta: 1.0,
    anchorRho: 0.5,
    repulseGamma: 1.0,
    repulseKappa: 0.4,
    repulseLambda: 0.1,
    repulseEta: 0.08,
    repulseIterations: 60,
    repulseAlpha: 1.0,
    fRefHz: 55.0
  },
  inputs: [
    {
      role: "intervals",
      accepts: "numericTree",
      required: true,
      allowUpstream: true,
      fallbackLiteralKey: "intervals"
    }
  ],
  params: [
    { key: "placementMode", label: "Placement mode", kind: "select", default: "v2", options: [
      { value: "v1", label: "uniform-centers" },
      { value: "v2", label: "prefix-slack" },
      { value: "prefixDominance", label: "prefix-dominance" },
      { value: "repulse", label: "repulsion-centers" }
    ] },
    { key: "edoSteps", label: "N-EDO", kind: "int", default: 12, min: 1 },
    { key: "baseNote", label: "Base note", kind: "select", default: "0", options: [
      { value: "0", label: "C" },
      { value: "1", label: "C#" },
      { value: "2", label: "D" },
      { value: "3", label: "D#" },
      { value: "4", label: "E" },
      { value: "5", label: "F" },
      { value: "6", label: "F#" },
      { value: "7", label: "G" },
      { value: "8", label: "G#" },
      { value: "9", label: "A" },
      { value: "10", label: "A#" },
      { value: "11", label: "B" }
    ] },
    { key: "baseOctave", label: "Base octave", kind: "int", default: 4 },
    { key: "xSpacing", label: "X spacing", kind: "number", default: 0.8, min: 0.1, step: 0.1 },
    { key: "useDamping", label: "Register damping", kind: "bool", default: true },
    { key: "anchorAlpha", label: "Anchor alpha", kind: "number", default: 0.3, min: 0, max: 1, step: 0.05 },
    { key: "anchorBeta", label: "Anchor beta", kind: "number", default: 1.0, min: 0, step: 0.1 },
    { key: "anchorRho", label: "Anchor rho", kind: "number", default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: "repulseGamma", label: "Repulse gamma", kind: "number", default: 1.0, min: 0, step: 0.1 },
    { key: "repulseKappa", label: "Repulse kappa", kind: "number", default: 0.4, min: 0, step: 0.05 },
    { key: "repulseLambda", label: "Repulse lambda", kind: "number", default: 0.1, min: 0, step: 0.05 },
    { key: "repulseEta", label: "Repulse eta", kind: "number", default: 0.08, min: 0, step: 0.01 },
    { key: "repulseIterations", label: "Repulse iterations", kind: "int", default: 60, min: 1 },
    { key: "repulseAlpha", label: "Repulse alpha", kind: "number", default: 1.0, min: 0, max: 1, step: 0.05 },
    { key: "fRefHz", label: "Reference Hz", kind: "number", default: 55.0, min: 1 }
  ],
  lensInputs: [
    { key: "intervals", label: "Intervals (steps)", kind: "list:int", default: [11, 7, 16], help: "Comma or space separated." },
    { key: "windowOctaves", label: "Window (octaves)", kind: "int", default: 3, min: 1 },
    { key: "oddBias", label: "Odd bias (0=down,1=up)", kind: "list:int", default: [] }
  ],
  evaluate: evaluateIntervalPlacementLens
};

