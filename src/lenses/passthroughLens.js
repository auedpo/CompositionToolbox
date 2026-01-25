const LENS_ID = "passthrough";

export function evaluatePassthroughLens(ctx = {}) {
  const inputs = Array.isArray(ctx.inputs) ? ctx.inputs : [];
  const entry = inputs[0] ? inputs[0].draft : null;
  if (!entry) {
    return {
      ok: false,
      drafts: [],
      errors: ["Select an input draft to pass through."]
    };
  }
  return {
    ok: true,
    drafts: [{
      type: entry.type,
      subtype: entry.subtype,
      payload: entry.payload,
      summary: `Passthrough: ${entry.summary || entry.type}`
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
