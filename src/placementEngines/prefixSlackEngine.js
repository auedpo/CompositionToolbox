// Purpose: prefixSlackEngine.js provides exports: createPrefixSlackEngine.
// Interacts with: no imports.
// Role: placement engine module within the broader app graph.
export function createPrefixSlackEngine(anchorsForPerm) {
  return {
    id: "v2",
    label: "prefix-slack",
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
  };
}
