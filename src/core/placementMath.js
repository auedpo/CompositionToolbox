export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function rhoPlace(anchor, length, rho) {
  const lowStar = anchor - rho * length;
  const highStar = anchor + (1 - rho) * length;
  return [lowStar, highStar];
}

export function quantizedSplit(length, rho, oddBias) {
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

export function centerBoundsForPerm(L, perm, rho, oddBias) {
  const biasList = Array.isArray(oddBias) ? oddBias : [];
  return perm.map((d, idx) => {
    const cmin = rho * d;
    const cmax = L - (1 - rho) * d;
    const bias = biasList[idx] || "down";
    const split = quantizedSplit(d, rho, bias);
    const min = Math.max(cmin, split.down);
    const max = Math.min(cmax, L - split.up);
    if (min > max) {
      return { min: cmin, max: cmax };
    }
    return { min, max };
  });
}

export function neutralCentersFromBounds(bounds) {
  const n = bounds.length;
  if (n === 0) return [];
  return bounds.map((b, idx) => {
    const t = n === 1 ? 0.5 : idx / (n - 1);
    return b.min + t * (b.max - b.min);
  });
}

export function projectedPairwiseSolve(initialCenters, bounds, iterations, step, accumulateForces) {
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

export function repulsionDeltasForPerm(perm, gamma, kappa, L) {
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

export function accumulateRepulsionForces(centers, forces, deltas, lambda) {
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

export function repulsionDiagnostics(centers, deltas, lambda) {
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

export function minPairwiseDistance(centers) {
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

export function anchorRangeFromBounds(bounds) {
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
