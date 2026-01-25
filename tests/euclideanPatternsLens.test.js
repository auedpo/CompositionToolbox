import assert from "node:assert/strict";
import { evaluateEuclideanPatternsLens } from "../src/lenses/euclideanPatternsLens.js";

function sum(values) {
  return values.reduce((acc, v) => acc + v, 0);
}

function gapsForMask(mask) {
  const indices = [];
  mask.forEach((value, idx) => {
    if (value) indices.push(idx);
  });
  const n = mask.length;
  if (indices.length <= 1) return [n];
  const gaps = [];
  for (let i = 0; i < indices.length - 1; i++) {
    gaps.push(indices[i + 1] - indices[i]);
  }
  gaps.push(indices[0] + n - indices[indices.length - 1]);
  return gaps;
}

function rotateRight(values, shift) {
  const n = values.length;
  if (!n) return [];
  const r = ((shift % n) + n) % n;
  if (r === 0) return values.slice();
  return values.slice(n - r).concat(values.slice(0, n - r));
}

function getBinaryMask(steps, pulses, rotation) {
  const { drafts } = evaluateEuclideanPatternsLens({
    generatorInput: { steps, pulses, rotation },
    params: { outputKind: "binaryMask" }
  });
  return drafts[0].payload;
}

const maskA = getBinaryMask(8, 3, 0);
assert.equal(maskA.length, 8);
assert.equal(sum(maskA), 3);
const gapsA = gapsForMask(maskA);
assert.ok(Math.max(...gapsA) - Math.min(...gapsA) <= 1);

const maskB = getBinaryMask(16, 5, 0);
assert.equal(maskB.length, 16);
assert.equal(sum(maskB), 5);
const gapsB = gapsForMask(maskB);
assert.ok(Math.max(...gapsB) - Math.min(...gapsB) <= 1);

const base = getBinaryMask(8, 3, 0);
const rotated = getBinaryMask(8, 3, 1);
assert.deepStrictEqual(rotated, rotateRight(base, 1));

const zeroMask = getBinaryMask(5, 0, 0);
assert.deepStrictEqual(zeroMask, [0, 0, 0, 0, 0]);

const fullMask = getBinaryMask(5, 5, 0);
assert.deepStrictEqual(fullMask, [1, 1, 1, 1, 1]);

console.log("euclideanPatternsLens checks ok");
