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
