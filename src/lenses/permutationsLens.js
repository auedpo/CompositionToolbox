import { MATERIAL_TYPES } from "../core/materialTypes.js";
import { formatNumericTree } from "../core/displayHelpers.js";
import { makeDraft } from "../core/invariants.js";
import { resolveValuesForRole } from "./inputResolution.js";
import { booleanField, createParamSchema, numberField, typedListField } from "./paramSchemaTypes.js";

const LENS_ID = "permutations";
const WARN_THRESHOLD = 5040;

function cloneNumericTree(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneNumericTree(entry));
  }
  return value;
}

function toLimit(value) {
  if (!Number.isFinite(value)) return null;
  const integer = Math.floor(value);
  if (integer <= 0) return null;
  return integer;
}

function generatePermutations(items, { limit = Infinity, removeDuplicates = false } = {}) {
  const maxCount = Number.isFinite(limit) && limit > 0 ? limit : Infinity;
  const total = items.length;
  const results = [];
  const seen = new Set();
  const working = items.map((entry) => cloneNumericTree(entry));

  function pushPermutation() {
    const snapshot = working.map((entry) => cloneNumericTree(entry));
    if (removeDuplicates) {
      const key = JSON.stringify(snapshot);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
    }
    results.push(snapshot);
    return results.length >= maxCount;
  }

  function backtrack(index) {
    if (index === total) {
      return pushPermutation();
    }
    for (let i = index; i < total; i += 1) {
      [working[index], working[i]] = [working[i], working[index]];
      if (backtrack(index + 1)) {
        [working[index], working[i]] = [working[i], working[index]];
        return true;
      }
      [working[index], working[i]] = [working[i], working[index]];
    }
    return false;
  }

  if (!total) {
    pushPermutation();
    return results;
  }
  backtrack(0);
  return results;
}

export function evaluatePermutationsLens(ctx = {}) {
  if (!ctx.context || typeof ctx.context.lensId !== "string" || typeof ctx.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const context = ctx.context || {};
  const instance = context.instance;
  if (!instance) {
    throw new Error("Lens instance context missing.");
  }
  const lensInputs = Array.isArray(instance.lens.inputs) ? instance.lens.inputs : [];
  const spec = lensInputs[0] || null;
  const resolved = spec ? resolveValuesForRole({
    instance,
    roleSpec: spec,
    upstreamInstance: context.upstreamInstance,
    getLensInstanceById: context.getLensInstanceById,
    draftCatalog: context.draftCatalog
  }) : null;
  const params = ctx.params && typeof ctx.params === "object" ? ctx.params : {};
  let bagSource = Array.isArray(params.bag) ? params.bag : [];
  bagSource = bagSource.map((entry) => cloneNumericTree(entry));
  let sourceLabel = "typed bag";
  if (resolved && resolved.ok && Array.isArray(resolved.values)) {
    bagSource = resolved.values.map((entry) => cloneNumericTree(entry));
    sourceLabel = resolved.draft
      ? (resolved.draft.summary || resolved.draft.type)
      : `${spec && spec.role ? spec.role : "input"} draft`;
  } else if (!bagSource.length) {
    sourceLabel = "empty bag";
  }
  const limitCandidate = toLimit(params.maxPermutations);
  const removeDuplicates = Boolean(params.removeDuplicates);
  const permutations = generatePermutations(bagSource, {
    limit: Number.isFinite(limitCandidate) ? limitCandidate : Infinity,
    removeDuplicates
  });
  const totalPermutations = permutations.length;
  const warnings = [];
  if (totalPermutations > WARN_THRESHOLD) {
    warnings.push(`Permutation count (${totalPermutations}) exceeds 7! (5040); consider capping the limit.`);
  }
  const lensId = context.lensId;
  const lensInstanceId = context.lensInstanceId;
  const drafts = permutations.map((sequence, idx) => {
    const formatted = formatNumericTree(sequence, { maxLength: 120 });
    const summaryParts = [`Permutation ${idx + 1}/${totalPermutations}`];
    if (formatted) {
      summaryParts.push(formatted);
    }
    summaryParts.push(sourceLabel);
    return makeDraft({
      lensId,
      lensInstanceId,
      type: MATERIAL_TYPES.PitchList,
      summary: summaryParts.filter(Boolean).join(" | "),
      values: sequence
    });
  });
  return {
    ok: true,
    drafts,
    vizModel: {
      bag: bagSource.map((entry) => cloneNumericTree(entry)),
      bagCount: bagSource.length,
      removeDuplicates,
      limit: limitCandidate ?? null,
      totalPermutations,
      sourceLabel
    },
    warnings
  };
}

export const permutationsLens = {
  meta: {
    id: LENS_ID,
    name: "Permutations",
    hasVisualizer: false,
    kind: "transformer"
  },
  defaultParams: {
    bag: [],
    bagText: "",
    maxPermutations: 720,
    removeDuplicates: false
  },
  paramSchema: createParamSchema([
    typedListField({
      label: "Bag",
      sourceKey: "bagText",
      targetKey: "bag",
      parserId: "userList",
      help: "Enter items, use parentheses or brackets to keep nested groups together."
    }),
    numberField({
      key: "maxPermutations",
      label: "Max permutations",
      min: 0,
      step: 1,
      help: "Cap drafts at this count (default 6! = 720); leave blank or enter 0 to see the full factorial."
    }),
    booleanField({
      key: "removeDuplicates",
      label: "Remove duplicate permutations",
      help: "Drop identical permutations caused by repeated bag items."
    })
  ]),
  inputs: [
    {
      role: "bag",
      accepts: "numericTree",
      required: false,
      allowUpstream: true,
      help: "Optional draft whose top-level values make up the bag."
    }
  ],
  evaluate: evaluatePermutationsLens
};
