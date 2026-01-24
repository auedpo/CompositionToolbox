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
  const title = entry.summary && entry.summary.title ? entry.summary.title : entry.type;
  const description = entry.summary && entry.summary.description ? entry.summary.description : "";
  return {
    ok: true,
    drafts: [{
      type: entry.type,
      subtype: entry.subtype,
      payload: entry.payload,
      summary: {
        title: `Passthrough: ${title}`,
        description,
        stats: entry.summary && entry.summary.stats ? entry.summary.stats : {}
      }
    }],
    warnings: []
  };
}

export const passthroughLens = {
  meta: {
    id: LENS_ID,
    name: "Passthrough",
    kind: "transformer"
  },
  inputs: [
    { role: "input", required: true }
  ],
  evaluate: evaluatePassthroughLens
};
