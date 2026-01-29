// Purpose: prefixDominanceEngine.js provides exports: computePrefixDominanceAnchors.
// Interacts with: no imports.
// Role: placement engine module within the broader app graph.
export function computePrefixDominanceAnchors(L, perm, params) {
  const n = perm.length;
  const dominanceBeta = params.anchorBeta;
  const dominanceRho = params.anchorRho;
  const amin = Math.max(...perm.map((d) => dominanceRho * d));
  const amax = Math.min(...perm.map((d) => L - (1 - dominanceRho) * d));
  if (!Number.isFinite(amin) || !Number.isFinite(amax) || amin > amax) {
    return null;
  }
  if (n === 0) {
    return {
      anchorFloats: [],
      weights: [],
      prefixSums: [],
      prefixFractions: [],
      totalWeight: 0,
      amin,
      amax
    };
  }
  let weights = perm.map((d) => Math.pow(d, dominanceBeta));
  let totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (!(totalWeight > 0)) {
    weights = perm.map(() => 1);
    totalWeight = n;
  }
  const span = amax - amin;
  let prefix = 0;
  const prefixSums = [];
  const prefixFractions = [];
  const anchorFloats = perm.map((d, idx) => {
    const u = prefix / totalWeight;
    const a = amin + u * span;
    prefixSums.push(prefix);
    prefixFractions.push(u);
    prefix += weights[idx];
    void d;
    return Math.min(amax, Math.max(amin, a));
  });
  return {
    anchorFloats,
    weights,
    prefixSums,
    prefixFractions,
    totalWeight,
    amin,
    amax
  };
}
