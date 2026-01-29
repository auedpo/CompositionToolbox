import { assertNumericTree, DraftInvariantError, makeDraft } from "../core/invariants.js";

const LENS_ID = "inputList";

function cloneNumericTree(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneNumericTree(entry));
  }
  return value;
}

function parseTextInput(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return [];

  if (raw.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const details = error && error.message ? ` ${error.message}` : "";
      throw new DraftInvariantError(`Input list JSON parse failed.${details}`);
    }
    if (!Array.isArray(parsed)) {
      throw new DraftInvariantError("Input list JSON must be an array.");
    }
    assertNumericTree(parsed, `lensId=${LENS_ID}`);
    return parsed;
  }

  const parts = raw.split(/[,\s]+/).filter(Boolean);
  return parts.map((part) => Number(part)).filter((value) => Number.isFinite(value));
}

export function evaluateInputListLens(ctx = {}) {
  if (!ctx.context || typeof ctx.context.lensId !== "string" || typeof ctx.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const lensInput = ctx.lensInput || {};
  const text = typeof lensInput.text === "string" ? lensInput.text : "";
  const values = parseTextInput(text);
  const count = Array.isArray(values) ? values.length : 0;
  const summary = count ? `Input list (${count} items)` : "Input list (empty)";
  const lensId = ctx.context.lensId;
  const lensInstanceId = ctx.context.lensInstanceId;
  const draft = makeDraft({
    lensId,
    lensInstanceId,
    type: "numeric",
    summary,
    values: cloneNumericTree(values)
  });
  return {
    ok: true,
    drafts: [draft],
    warnings: []
  };
}

export const inputListLens = {
  meta: {
    id: LENS_ID,
    name: "Input List",
    kind: "source"
  },
  params: [],
  lensInputs: [
    {
      key: "text",
      label: "List input",
      kind: "textarea",
      default: "",
      help: "Enter numbers separated by commas/spaces, or JSON arrays like [0, [1, 2], 3]."
    }
  ],
  evaluate: evaluateInputListLens
};

