import React from "react";

import { FieldRenderer } from "./fieldRenderers.jsx";

export default function SchemaParamEditor({ schema, params, onPatch, onReplace }) {
  const fields = schema && Array.isArray(schema.fields) ? schema.fields : [];
  const applyPatch = (patch) => {
    if (typeof onReplace === "function") {
      const base = params && typeof params === "object" ? params : {};
      onReplace({ ...base, ...(patch || {}) });
      return;
    }
    if (typeof onPatch === "function") {
      onPatch(patch);
    }
  };
  if (!fields.length) {
    return <div className="hint">No fields configured.</div>;
  }
  return (
    <div>
      {fields.map((field, index) => (
        <FieldRenderer
          key={field.key || field.sourceKey || field.targetKey || field.label || `${field.type}-${index}`}
          field={field}
          params={params}
          onPatch={applyPatch}
          onReplace={onReplace}
        />
      ))}
    </div>
  );
}
