// Purpose: shiftSweep.js provides exports: evaluateShiftSweepLens, shiftSweepLens.
// Interacts with: imports: ../../core/displayHelpers.js, ../../core/invariants.js, ../inputResolution.js.
// Role: lens domain layer module within the broader app graph.
import { formatNumericTree, flattenNumericTree } from "../../core/displayHelpers.js";
import { makeDraft } from "../../core/invariants.js";
import { resolveValuesForRole } from "../inputResolution.js";

const LENS_ID = "shiftSweep";

function extractNumberList(draft) {
  if (!draft || !draft.payload || draft.payload.kind !== "numericTree") return [];
  return flattenNumericTree(draft.payload.values);
}

function clampInt(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (typeof min === "number" && parsed < min) return min;
  if (typeof max === "number" && parsed > max) return max;
  return parsed;
}

function rotate(values, shift) {
  const count = values.length;
  if (!count) return [];
  const normalized = ((shift % count) + count) % count;
  if (normalized === 0) return values.slice();
  return values.slice(normalized).concat(values.slice(0, normalized));
}

function applyMod(value, mod) {
  if (!Number.isFinite(value)) return value;
  const base = Math.abs(mod);
  if (!base) return value;
  const remainder = value % base;
  return remainder < 0 ? remainder + base : remainder;
}

function hashValues(values) {
  const text = values.map((value) => (Number.isFinite(value) ? value : String(value))).join(",");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

export function evaluateShiftSweepLens(ctx = {}) {
  if (!ctx.context || typeof ctx.context.lensId !== "string" || typeof ctx.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const context = ctx.context || {};
  const instance = context.instance;
  if (!instance) {
    throw new Error("Lens instance context missing.");
  }
  const lensInputs = Array.isArray(instance.lens.inputs) ? instance.lens.inputs : [];
  const spec = lensInputs[0];
  const resolved = spec ? resolveValuesForRole({
    instance,
    roleSpec: spec,
    upstreamInstance: context.upstreamInstance,
    getLensInstanceById: context.getLensInstanceById,
    draftCatalog: context.draftCatalog
  }) : null;
  if (!resolved || !resolved.ok) {
    const message = resolved && resolved.message
      ? resolved.message
      : `Input ${spec ? spec.role : "source"} required.`;
    return {
      ok: false,
      drafts: [],
      notices: [{ level: "warn", message }]
    };
  }
  const entry = resolved.draft || null;
  const values = entry
    ? extractNumberList(entry)
    : (Array.isArray(resolved.values) ? flattenNumericTree(resolved.values) : []);
  if (!values.length) {
    return {
      ok: false,
      drafts: [],
      errors: ["Selected draft does not expose a numeric list."]
    };
  }
  const params = ctx.params || {};
  const op = params.op === "rotate" ? "rotate" : "add";
  const count = clampInt(params.count, 8, 1, 64);
  const step = clampInt(params.step, 1);
  const useMod = Boolean(params.useMod);
  const modValue = clampInt(params.mod, 12, 2);
  const modActive = useMod;
  const modBase = modActive ? modValue : null;

  const baseValues = values.slice();
  const valueHash = hashValues(baseValues);
  const lensId = ctx.context.lensId;
  const lensInstanceId = ctx.context.lensInstanceId;
  const drafts = [];

  for (let k = 0; k < count; k += 1) {
    const offset = k * step;
    let values2 = op === "add"
      ? baseValues.map((value) => value + offset)
      : rotate(baseValues, offset);
    if (modActive) {
      values2 = values2.map((value) => applyMod(value, modBase));
    }
    const formatted = formatNumericTree(values2, { maxLength: 120 }) || "Shift Sweep";
    const draftId = `${lensInstanceId}:shiftSweep:${op}:${k}:${step}:${modActive ? modBase : "nomod"}:${valueHash}`;
    drafts.push(makeDraft({
      draftId,
      lensId,
      lensInstanceId,
      type: "list",
      subtype: "numberList",
      summary: `${formatted} - ${op} ${op === "add" ? "+" : "rot "} ${offset}${modActive ? ` mod${modBase}` : ""}`,
      values: values2.slice()
    }));
  }

  const sourceName = entry
    ? (entry.summary || entry.name || entry.type)
    : "literal values";
  const vizModel = {
    operationLabel: "Shift Sweep",
    inputValues: baseValues.slice(),
    operands: [step, count],
    modActive,
    modValue: modActive ? modBase : null,
    sourceName
  };

  return {
    ok: true,
    drafts,
    vizModel,
    warnings: []
  };
}

export const shiftSweepLens = {
  meta: {
    id: LENS_ID,
    name: "Shift Sweep",
    hasVisualizer: true,
    kind: "transformer"
  },
  inputs: [
    {
      role: "source",
      required: true,
      help: "Select a draft that exposes a numeric list."
    }
  ],
  params: [
    {
      key: "op",
      label: "Operation",
      kind: "select",
      default: "add",
      options: [
        { value: "add", label: "Add" },
        { value: "rotate", label: "Rotate" }
      ]
    },
    {
      key: "count",
      label: "Draft count",
      kind: "int",
      default: 8,
      min: 1,
      max: 64,
      step: 1
    },
    {
      key: "step",
      label: "Step",
      kind: "int",
      default: 1,
      step: 1
    },
    {
      key: "useMod",
      label: "Apply mod",
      kind: "bool",
      default: false
    },
    {
      key: "mod",
      label: "Mod value",
      kind: "int",
      default: 12,
      min: 2,
      step: 1
    }
  ],
  evaluate: evaluateShiftSweepLens
};
