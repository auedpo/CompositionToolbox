import React from "react";

function formatPreview(values) {
  if (values === undefined) return "-";
  try {
    const text = JSON.stringify(values, null, 2);
    return text.length > 600 ? `${text.slice(0, 600)}...` : text;
  } catch (error) {
    return "Unserializable payload.";
  }
}

export default function TextPreviewViz({ draft }) {
  if (!draft) {
    return (
      <div className="workspace-placeholder">
        No active draft to preview.
      </div>
    );
  }
  const preview = formatPreview(draft.payload && draft.payload.values);
  return (
    <div className="visualizer-text-preview">
      <div className="hint">{draft.draftId}</div>
      <textarea
        className="component-field"
        value={preview}
        readOnly
        rows={12}
      />
    </div>
  );
}
