import { makeDraft } from "../core/invariants.js";

const LENS_ID = "passthrough";

export function evaluatePassthroughLens(ctx = {}) {
  if (!ctx.context || typeof ctx.context.lensId !== "string" || typeof ctx.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const inputs = Array.isArray(ctx.inputs) ? ctx.inputs : [];
  const entry = inputs[0] ? inputs[0].draft : null;
  if (!entry) {
    return {
      ok: false,
      drafts: [],
      errors: ["Select an input draft to pass through."]
    };
  }
  const lensId = ctx.context.lensId;
  const lensInstanceId = ctx.context.lensInstanceId;
  return {
    ok: true,
    drafts: [{
      ...makeDraft({
        lensId,
        lensInstanceId,
        type: entry.type,
        subtype: entry.subtype,
        summary: `Passthrough: ${entry.summary || entry.type}`,
        values: entry.payload.values
      })
    }],
    warnings: []
  };
}

export const passthroughLens = {
  meta: {
    id: LENS_ID,
    name: "Passthrough",
    hasVisualizer: false,
    kind: "transformer"
  },
  inputs: [
    { role: "input", required: true }
  ],
  evaluate: evaluatePassthroughLens
};
