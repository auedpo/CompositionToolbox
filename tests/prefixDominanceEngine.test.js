import assert from "node:assert/strict";
import { computePrefixDominanceAnchors } from "../src/placementEngines/prefixDominanceEngine.js";

function approxEqual(actual, expected, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= eps, `Expected ${actual} ≈ ${expected}`);
}

{
  const L = 24;
  const perm = [12, 5, 8];
  const params = { anchorBeta: 0, anchorRho: 0.5 };
  const result = computePrefixDominanceAnchors(L, perm, params);
  assert.ok(result);
  const { anchorFloats, amin, amax } = result;
  const span = amax - amin;
  const n = perm.length;
  anchorFloats.forEach((anchor, idx) => {
    const expected = amin + (idx / n) * span;
    approxEqual(anchor, expected);
  });
}

{
  const L = 24;
  const params = { anchorBeta: 2, anchorRho: 0.5 };
  const permA = [12, 5, 8];
  const permB = [5, 8, 12];
  const a = computePrefixDominanceAnchors(L, permA, params);
  const b = computePrefixDominanceAnchors(L, permB, params);
  assert.ok(a && b);
  assert.ok(a.anchorFloats[1] > b.anchorFloats[1]);
  assert.ok(a.anchorFloats[2] > b.anchorFloats[2]);
}

{
  const L = 30;
  const perm = [3, 7, 10];
  const params = { anchorBeta: 1.3, anchorRho: 0.35 };
  const result = computePrefixDominanceAnchors(L, perm, params);
  assert.ok(result);
  const { anchorFloats, amin, amax } = result;
  anchorFloats.forEach((anchor) => {
    assert.ok(anchor >= amin && anchor <= amax);
  });
}

{
  const L = 6;
  const perm = [7];
  const params = { anchorBeta: 1, anchorRho: 0.9 };
  const result = computePrefixDominanceAnchors(L, perm, params);
  assert.equal(result, null);
}

console.log("Prefix dominance engine tests passed.");
