// Purpose: defaultParams.js provides exports: defaultParams.
// Interacts with: no imports.
// Role: core domain layer module within the broader app graph.
export const defaultParams = {
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
  fRefHz: 55.0
};
