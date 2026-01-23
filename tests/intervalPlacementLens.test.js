import assert from "node:assert/strict";
import { runIntervalPlacementLens } from "../src/lenses/intervalPlacementLens.js";
import { calibrateAlpha } from "../src/core/intervalMath.js";

const params = {
  edoSteps: 12,
  compoundReliefM: 0.55,
  sigmaCents: 20.0,
  ratioLambda: 0.20,
  roughAlpha: 0.0,
  roughPartialsK: 12,
  ampPower: 1.0,
  roughA: 3.5,
  roughB: 5.75,
  registerDampingK: 1.6,
  anchorAlpha: 0.3,
  anchorBeta: 1.0,
  anchorRho: 0.5,
  repulseGamma: 1.0,
  repulseKappa: 0.4,
  repulseLambda: 0.1,
  repulseEta: 0.08,
  repulseIterations: 60,
  repulseAlpha: 1.0,
  midiTailMs: 200,
  fRefHz: 55.0,
  useDamping: true,
  placementMode: "v2"
};
params.roughAlpha = calibrateAlpha(params, 0.5);

const input = {
  intervals: [11, 7, 16],
  params,
  oddBias: ["down", "down", "down"],
  windowOctaves: 3,
  timestamp: "2025-01-01T00:00:00.000Z"
};

const resultA = runIntervalPlacementLens(input);
const resultB = runIntervalPlacementLens(input);

assert.deepStrictEqual(resultA.records, resultB.records);
assert.deepStrictEqual(resultA.outputs, resultB.outputs);

console.log("intervalPlacementLens determinism ok");
