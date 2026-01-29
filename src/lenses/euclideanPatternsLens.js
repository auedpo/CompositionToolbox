// Purpose: euclideanPatternsLens.js provides exports: euclideanPatternsLens, evaluateEuclideanPatternsLens.
// Interacts with: imports: ../core/displayHelpers.js, ../core/invariants.js.
// Role: lens domain layer module within the broader app graph.
import { formatNumericTree } from "../core/displayHelpers.js";
import { makeDraft } from "../core/invariants.js";

const LENS_ID = "euclideanPatterns";

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rotateRight(values, shift) {
  const n = values.length;
  if (!n) return [];
  const r = ((shift % n) + n) % n;
  if (r === 0) return values.slice();
  return values.slice(n - r).concat(values.slice(0, n - r));
}

function bjorklund(steps, pulses) {
  if (pulses <= 0) return new Array(steps).fill(0);
  if (pulses >= steps) return new Array(steps).fill(1);
  const counts = [];
  const remainders = [pulses];
  let divisor = steps - pulses;
  let level = 0;
  while (true) {
    counts.push(Math.floor(divisor / remainders[level]));
    const remainder = divisor % remainders[level];
    remainders.push(remainder);
    divisor = remainders[level];
    level += 1;
    if (remainders[level] <= 1) break;
  }
  counts.push(divisor);

  function build(levelIndex) {
    if (levelIndex === -1) return [0];
    if (levelIndex === -2) return [1];
    let result = [];
    for (let i = 0; i < counts[levelIndex]; i += 1) {
      result = result.concat(build(levelIndex - 1));
    }
    if (remainders[levelIndex] !== 0) {
      result = result.concat(build(levelIndex - 2));
    }
    return result;
  }

  let pattern = build(level);
  if (pattern.length > steps) {
    pattern = pattern.slice(0, steps);
  } else if (pattern.length < steps) {
    pattern = pattern.concat(new Array(steps - pattern.length).fill(0));
  }
  return pattern;
}

function normalizeParams(params = {}) {
  const steps = Math.max(1, toInt(params.steps, 1));
  const pulsesRaw = toInt(params.pulses, 0);
  const pulses = Math.max(0, Math.min(steps, pulsesRaw));
  const rotation = toInt(params.rotation, 0);
  const outputKind = params.outputKind === "indexMask" ? "indexMask" : "binaryMask";
  const rotationNorm = ((rotation % steps) + steps) % steps;
  return {
    steps,
    pulses,
    rotation,
    rotationNorm,
    outputKind
  };
}

function toIndexMask(binary) {
  const indices = [];
  binary.forEach((value, idx) => {
    if (value) indices.push(idx);
  });
  return indices;
}

export function evaluateEuclideanPatternsLens(ctx = {}) {
  if (!ctx.context || typeof ctx.context.lensId !== "string" || typeof ctx.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const { params = {}, lensInput = {} } = ctx;
  const merged = { ...params, ...lensInput };
  const normalized = normalizeParams(merged);
  const base = bjorklund(normalized.steps, normalized.pulses);
  const rotated = rotateRight(base, normalized.rotationNorm);
  const values = normalized.outputKind === "indexMask" ? toIndexMask(rotated) : rotated;
  const lensId = ctx.context.lensId;
  const lensInstanceId = ctx.context.lensInstanceId;
  const formattedValues = formatNumericTree(values, { maxLength: 120 });
  const draft = makeDraft({
    lensId,
    lensInstanceId,
    type: "Pattern",
    subtype: normalized.outputKind,
    summary: `E(${normalized.steps},${normalized.pulses}) - values: ${formattedValues}`,
    values: values.slice()
  });
  return {
    ok: true,
    drafts: [draft],
    vizModel: {
      pattern: {
        kind: normalized.outputKind,
        values: values.slice(),
        domain: {
          steps: normalized.steps,
          pulses: normalized.pulses,
          rotation: normalized.rotationNorm,
          rotationDir: "right"
        }
      }
    },
    warnings: []
  };
}

export const euclideanPatternsLens = {
  meta: {
    id: LENS_ID,
    name: "Euclidean Patterns",
    hasVisualizer: true,
    kind: "source"
  },
  params: [
    {
      key: "outputKind",
      label: "Output kind",
      kind: "select",
      default: "binaryMask",
      options: [
        { value: "binaryMask", label: "binaryMask" },
        { value: "indexMask", label: "indexMask" }
      ]
    }
  ],
  lensInputs: [
    { key: "steps", label: "Steps (N)", kind: "int", default: 8, min: 1 },
    { key: "pulses", label: "Pulses (K)", kind: "int", default: 3, min: 0 },
    { key: "rotation", label: "Rotation (R)", kind: "int", default: 0 }
  ],
  evaluate: evaluateEuclideanPatternsLens
};

