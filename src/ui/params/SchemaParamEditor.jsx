import React from "react";

import { FieldRenderer } from "./fieldRenderers.jsx";

export default function SchemaParamEditor({ schema, params, onPatch, onReplace }) {
  const fields = schema && Array.isArray(schema.fields) ? schema.fields : [];
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
          onPatch={onPatch}
          onReplace={onReplace}
        />
      ))}
    </div>
  );
}
