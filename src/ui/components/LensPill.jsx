import React from "react";

export default function LensPill({ label, isSelected, hasError, hasActiveDraft, onSelect }) {
  return (
    <button
      type="button"
      className={`component-pill lens-pill${isSelected ? " is-focused" : ""}${hasError ? " is-error" : ""}`}
      onClick={onSelect}
    >
      <span>{label}</span>
      {hasActiveDraft ? <span className="lens-pill-dot" aria-label="Active draft">?</span> : null}
    </button>
  );
}
