// Purpose: xdxLens.js provides exports: evaluateXdxLens, xdxLens.
// Interacts with: imports: ../core/displayHelpers.js, ../core/invariants.js, ../core/materialTypes.js, ./inputResolution.js, ./paramSchemaTypes.js.
// Role: lens domain layer module within the broader app graph.
import { MATERIAL_TYPES } from "../core/materialTypes.js";
import { formatNumericTree, flattenNumericTree } from "../core/displayHelpers.js";
import { makeDraft } from "../core/invariants.js";
import { resolveValuesForRole } from "./inputResolution.js";
import { createParamSchema, enumField, numberField, typedListField } from "./paramSchemaTypes.js";

const LENS_ID = "xdx";
const MODE_X_TO_DX = "x->dx (points to intervals)";
const MODE_DX_TO_X = "dx->x (intervals to points)";
const MODE_LABELS = {
  [MODE_X_TO_DX]: "x → dx",
  [MODE_DX_TO_X]: "dx → x"
};

function normalizeMode(value) {
  return value === MODE_DX_TO_X ? MODE_DX_TO_X : MODE_X_TO_DX;
}

function normalizeStart(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function flattenList(value) {
  if (!Array.isArray(value)) return [];
  return flattenNumericTree(value);
}

function extractResolvedValues(resolved) {
  if (!resolved || !resolved.ok) return [];
  if (resolved.draft && resolved.draft.payload && Array.isArray(resolved.draft.payload.values)) {
    return flattenNumericTree(resolved.draft.payload.values);
  }
  if (Array.isArray(resolved.values) && resolved.values.length) {
    return flattenNumericTree(resolved.values);
  }
  return [];
}

function computeIntervals(points) {
  const output = [];
  for (let idx = 0; idx < points.length - 1; idx += 1) {
    output.push(points[idx + 1] - points[idx]);
  }
  return output;
}

function computePoints(intervals, start) {
  const result = [start];
  let running = start;
  intervals.forEach((interval) => {
    running += interval;
    result.push(running);
  });
  return result;
}

export function evaluateXdxLens(ctx = {}) {
  if (!ctx.context || typeof ctx.context.lensId !== "string" || typeof ctx.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const context = ctx.context || {};
  const instance = context.instance;
  if (!instance) {
    throw new Error("Lens instance context missing.");
  }
  const lensInputs = Array.isArray(instance.lens && instance.lens.inputs) ? instance.lens.inputs : [];
  const spec = lensInputs[0] || null;
  const resolved = spec ? resolveValuesForRole({
    instance,
    roleSpec: spec,
    upstreamInstance: context.upstreamInstance,
    getLensInstanceById: context.getLensInstanceById,
    draftCatalog: context.draftCatalog
  }) : null;
  const params = ctx.params && typeof ctx.params === "object" ? ctx.params : {};
  const typedValues = flattenList(params.values);
  const resolvedValues = extractResolvedValues(resolved);
  const hasResolved = resolvedValues.length > 0;
  const sourceValues = hasResolved ? resolvedValues : typedValues;
  if (!sourceValues.length) {
    return {
      ok: false,
      drafts: [],
      errors: ["Provide a numeric list of points or intervals."]
    };
  }
  const mode = normalizeMode(params.mode);
  const start = normalizeStart(params.start);
  const resultValues = mode === MODE_DX_TO_X
    ? computePoints(sourceValues, start)
    : computeIntervals(sourceValues);
  const roleName = spec && spec.role ? spec.role : "input";
  const resolvedSourceName = resolved && resolved.draft
    ? (resolved.draft.summary || resolved.draft.type || roleName)
    : `${roleName} literal`;
  const sourceLabel = hasResolved ? resolvedSourceName : "typed values";
  const formattedSource = formatNumericTree(sourceValues, { maxLength: 120 });
  const formattedResult = formatNumericTree(resultValues, { maxLength: 120 });
  const summaryParts = [MODE_LABELS[mode]];
  if (formattedResult) summaryParts.push(formattedResult);
  if (formattedSource) summaryParts.push(`${sourceLabel}: ${formattedSource}`);
  const summary = summaryParts.join(" | ");
  const lensId = context.lensId;
  const lensInstanceId = context.lensInstanceId;
  const draft = makeDraft({
    lensId,
    lensInstanceId,
    type: MATERIAL_TYPES.PitchList,
    summary,
    values: resultValues.slice()
  });
  return {
    ok: true,
    drafts: [draft],
    vizModel: {
      mode,
      modeLabel: MODE_LABELS[mode],
      start,
      sourceLabel,
      inputValues: sourceValues.slice(),
      resultValues: resultValues.slice()
    },
    warnings: []
  };
}

export const xdxLens = {
  meta: {
    id: LENS_ID,
    name: "Point Interval Converter",
    hasVisualizer: false,
    kind: "transformer"
  },
  defaultParams: {
    mode: MODE_X_TO_DX,
    start: 0,
    values: [],
    valuesText: ""
  },
  paramSchema: createParamSchema([
    enumField({
      key: "mode",
      label: "Conversion",
      options: [MODE_X_TO_DX, MODE_DX_TO_X],
      help: "Choose x->dx to turn points into intervals, or dx->x to accumulate intervals into points."
    }),
    numberField({
      key: "start",
      label: "Start value",
      help: "Initial value used when reconstructing points from intervals."
    }),
    typedListField({
      label: "Values",
      sourceKey: "valuesText",
      targetKey: "values",
      parserId: "userList",
      help: "Enter points or intervals separated by spaces, commas, or brackets."
    })
  ]),
  inputs: [
    {
      role: "source",
      accepts: "numericTree",
      required: false,
      allowUpstream: true,
      help: "Optional upstream draft to convert; falls back to manual values."
    }
  ],
  evaluate: evaluateXdxLens
};
