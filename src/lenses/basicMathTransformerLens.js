import { MATERIAL_TYPES } from "../core/materialTypes.js";
import { formatNumericTree, flattenNumericTree } from "../core/displayHelpers.js";
import { makeDraft } from "../core/invariants.js";
import { resolveValuesForRole } from "./inputResolution.js";
import { createParamSchema, booleanField, enumField, numberField, typedListField } from "./paramSchemaTypes.js";

const LENS_ID = "basicMath";

const OPERATION_OPTIONS = [
  { value: "add", label: "Addition" },
  { value: "subtract", label: "Subtraction" },
  { value: "multiply", label: "Multiplication" },
  { value: "divide", label: "Division" },
  { value: "exponent", label: "Exponentiation" },
  { value: "sqrt", label: "Square root" },
  { value: "factorial", label: "Factorial" },
  { value: "log", label: "Logarithm" }
];

const OPERATION_DEFS = OPERATION_OPTIONS.reduce((map, option) => {
  map[option.value] = option;
  return map;
}, {});

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNumericArray(source) {
  if (Array.isArray(source)) {
    return source.map((value) => Number(value)).filter(Number.isFinite);
  }
  return [];
}

function extractInputValues(draft) {
  if (!draft || !draft.payload || draft.payload.kind !== "numericTree") return [];
  return flattenNumericTree(draft.payload.values);
}

function fallbackOperandFor(operation) {
  switch (operation) {
    case "add":
    case "subtract":
      return 0;
    case "multiply":
    case "divide":
      return 1;
    case "exponent":
      return 2;
    case "log":
      return Math.E;
    default:
      return undefined;
  }
}

function applyMathOperation(operation, value, operand) {
  const current = Number(value);
  if (!Number.isFinite(current)) return NaN;
  const hasOperand = Number.isFinite(operand);
  switch (operation) {
    case "add":
      return current + (hasOperand ? operand : 0);
    case "subtract":
      return current - (hasOperand ? operand : 0);
    case "multiply":
      return current * (hasOperand ? operand : 1);
    case "divide":
      if (!hasOperand || operand === 0) return NaN;
      return current / operand;
    case "exponent":
      return Math.pow(current, hasOperand ? operand : 1);
    case "sqrt":
      return current < 0 ? NaN : Math.sqrt(current);
    case "factorial": {
      if (!Number.isFinite(current) || current < 0) return NaN;
      if (!Number.isInteger(current)) return NaN;
      let result = 1;
      for (let i = 2; i <= current; i += 1) {
        result *= i;
      }
      return result;
    }
    case "log": {
      if (current <= 0) return NaN;
      if (hasOperand && operand > 0) {
        return Math.log(current) / Math.log(operand);
      }
      return Math.log(current);
    }
    default:
      return current;
  }
}

function applyModulus(value, modulus) {
  if (!Number.isFinite(value)) return value;
  if (!modulus || modulus === 0) return value;
  const modBase = Math.abs(modulus);
  if (modBase === 0) return value;
  const remainder = value % modBase;
  return remainder < 0 ? remainder + modBase : remainder;
}

export function evaluateBasicMathTransformerLens(ctx = {}) {
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
  const missingMessage = spec ? `Input ${spec.role} required.` : "Draft input missing.";
  const resolved = spec ? resolveValuesForRole({
    instance,
    roleSpec: spec,
    upstreamInstance: context.upstreamInstance,
    getLensInstanceById: context.getLensInstanceById,
    draftCatalog: context.draftCatalog
  }) : null;
  if (!resolved || !resolved.ok) {
    const message = resolved && resolved.message ? resolved.message : missingMessage;
    return {
      ok: false,
      drafts: [],
      notices: [{ level: "warn", message }]
    };
  }
  const entry = resolved.draft || null;
  const values = entry
    ? extractInputValues(entry)
    : (Array.isArray(resolved.values) ? flattenNumericTree(resolved.values) : []);
  if (!values.length) {
    return {
      ok: false,
      drafts: [],
      errors: ["Selected draft does not expose a numeric list."]
    };
  }
  const params = ctx.params || {};
  const operationKey = typeof params.operation === "string" && OPERATION_DEFS[params.operation]
    ? params.operation
    : OPERATION_OPTIONS[0].value;
  const operationDef = OPERATION_DEFS[operationKey];
  const rawOperands = Array.isArray(params.operands) ? params.operands : [];
  const operandList = toNumericArray(rawOperands);
  const fallback = fallbackOperandFor(operationKey);
  const hasOperands = operandList.length > 0;
  const modulusEnabled = Boolean(params.modEnabled);
  const candidateMod = toFiniteNumber(params.modValue);
  const modBase = candidateMod && candidateMod > 0 ? candidateMod : null;
  const modActive = modulusEnabled && Number.isFinite(modBase) && modBase > 0;
  const warnings = [];
  if (modulusEnabled && !modActive) {
    warnings.push("Modulus must be a positive number; ignoring modular reduction.");
  }
  const getOperand = (index) => {
    if (hasOperands) {
      const candidate = operandList[index % operandList.length];
      if (Number.isFinite(candidate)) {
        return candidate;
      }
    }
    if (Number.isFinite(fallback)) {
      return fallback;
    }
    return undefined;
  };
  const results = values.map((value, idx) => {
    const operand = getOperand(idx);
    const next = applyMathOperation(operationKey, value, operand);
    if (modActive) {
      return applyModulus(next, modBase);
    }
    return next;
  });
  const operandSummary = hasOperands
    ? operandList.join(", ")
    : (Number.isFinite(fallback) ? `${fallback}` : null);
  const descriptionParts = [
    `Operation: ${operationDef.label}`,
    operandSummary ? `Operands: ${operandSummary}` : null,
    modActive ? `Mod: ${modBase}` : null
  ].filter(Boolean);
  const sourceName = entry.summary || entry.type;
  const vizModel = {
    inputValues: values.slice(),
    operation: operationKey,
    operationLabel: operationDef.label,
    operands: operandList.slice(),
    modActive,
    modValue: modActive ? modBase : null,
    sourceName
  };
  const formattedResultList = formatNumericTree(results, { maxLength: 120 }) || `Math ${operationDef.label}`;
  const description = descriptionParts.join(" | ");
  const lensId = ctx.context.lensId;
  const lensInstanceId = ctx.context.lensInstanceId;
  const draft = makeDraft({
    lensId,
    lensInstanceId,
    type: MATERIAL_TYPES.PitchList,
    summary: description ? `${formattedResultList} - ${description}` : formattedResultList,
    values: results.slice()
  });
  return {
    ok: true,
    drafts: [draft],
    warnings,
    vizModel
  };
}

export const basicMathTransformerLens = {
  meta: {
    id: LENS_ID,
    name: "Basic Math",
    hasVisualizer: true,
    kind: "transformer"
  },
  defaultParams: {
    operation: "add",
    operands: [],
    operandsText: "",
    modEnabled: false,
    modValue: 12
  },
  paramSchema: createParamSchema([
    enumField({
      key: "operation",
      label: "Operation",
      options: OPERATION_OPTIONS.map((option) => option.value)
    }),
    typedListField({
      label: "Operands",
      sourceKey: "operandsText",
      targetKey: "operands",
      parserId: "userList",
      commit: "debounce+blur",
      debounceMs: 200
    }),
    booleanField({
      key: "modEnabled",
      label: "Modulo"
    }),
    numberField({
      key: "modValue",
      label: "Mod",
      min: 1,
      step: 1
    })
  ]),
  inputs: [
    {
      role: "input",
      required: true,
      help: "Select a draft that exposes a numeric list."
    }
  ],
  evaluate: evaluateBasicMathTransformerLens
};
