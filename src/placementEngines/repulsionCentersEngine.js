export function createRepulsionCentersEngine(deps) {
  const {
    clamp,
    centerBoundsForPerm,
    neutralCentersFromBounds,
    repulsionDeltasForPerm,
    projectedPairwiseSolve,
    accumulateRepulsionForces,
    repulsionDiagnostics
  } = deps;
  return {
    id: "repulse",
    label: "repulsion-centers",
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
  };
}
