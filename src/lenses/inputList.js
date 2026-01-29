// Purpose: inputList.js provides exports: evaluateInputListLens, inputListLens.
// Interacts with: imports: ../core/invariants.js, ./paramSchemaTypes.js.
// Role: lens domain layer module within the broader app graph.
import { makeDraft } from "../core/invariants.js";
import { createParamSchema, typedListField } from "./paramSchemaTypes.js";

const LENS_ID = "inputList";

function cloneNumericTree(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneNumericTree(entry));
  }
  return value;
}

export function evaluateInputListLens(ctx = {}) {
  if (!ctx.context || typeof ctx.context.lensId !== "string" || typeof ctx.context.lensInstanceId !== "string") {
    throw new Error("Lens context missing lensId/lensInstanceId.");
  }
  const params = ctx.params && typeof ctx.params === "object" ? ctx.params : {};
  const values = params.values ?? [];
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
  defaultParams: {
    values: [],
    text: ""
  },
  paramSchema: createParamSchema([
    typedListField({
      label: "List",
      sourceKey: "text",
      targetKey: "values",
      parserId: "userList",
      commit: "debounce+blur",
      debounceMs: 200
    })
  ]),
  evaluate: evaluateInputListLens
};

