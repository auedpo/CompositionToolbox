import React, { useMemo } from "react";

import { FieldRenderer } from "./fieldRenderers.jsx";

function withDynamicWarnings(fields = [], { lensId, params }) {
  if (lensId !== "permutations" || !Array.isArray(params?.bag)) {
    return fields;
  }
  return fields.map((field) => {
    if (field && field.key === "maxPermutations" && params.bag.length > 6) {
      const bagCount = params.bag.length;
      return {
        ...field,
        warning: `Bag contains ${bagCount} items; keep the cap at 720 to avoid factorial blowups or enter 0 for the full factorial.`
      };
    }
    return field;
  });
}

export default function SchemaParamEditor({ schema, params, onPatch, onReplace, lensId }) {
  const fields = schema && Array.isArray(schema.fields) ? schema.fields : [];
  const dynamicFields = useMemo(() => withDynamicWarnings(fields, { lensId, params }), [fields, lensId, params]);
  const applyPatch = (patch) => {
    if (typeof onPatch === "function") {
      onPatch(patch);
      return;
    }
    if (typeof onReplace === "function") {
      const base = params && typeof params === "object" ? params : {};
      onReplace({ ...base, ...(patch || {}) });
    }
  };
  if (!dynamicFields.length) {
    return <div className="hint">No fields configured.</div>;
  }
  return (
    <div>
      {dynamicFields.map((field, index) => (
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
