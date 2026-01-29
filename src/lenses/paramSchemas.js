// Purpose: paramSchemas.js provides exports: createTypedListSchema.
// Interacts with: imports: ./paramSchemaTypes.js.
// Role: lens domain layer module within the broader app graph.
import { createParamSchema, typedListField } from "./paramSchemaTypes.js";

export function createTypedListSchema({ label, sourceKey, targetKey, parserId, debounceMs, help } = {}) {
  return createParamSchema([
    typedListField({
      label,
      sourceKey,
      targetKey,
      parserId,
      commit: "debounce+blur",
      debounceMs,
      help
    })
  ]);
}
