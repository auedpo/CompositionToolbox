import { makeDraft } from "../core/invariants.js";
import { resolveValuesForRole } from "./inputResolution.js";

const LENS_ID = "passthrough";

export function evaluatePassthroughLens(ctx = {}) {
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
  if (!resolved || !resolved.ok || !resolved.draft) {
    const message = resolved && resolved.message
      ? resolved.message
      : `Input ${spec ? spec.role : "input"} required.`;
    return {
      ok: false,
      drafts: [],
      notices: [{ level: "warn", message }]
    };
  }
  const entry = resolved.draft;
  const lensId = context.lensId;
  const lensInstanceId = context.lensInstanceId;
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
