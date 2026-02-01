import React from "react";

export default function LensPill({ label, isSelected, hasError, hasActiveDraft, onSelect }) {
  return (
    <button
      type="button"
      className={`component-pill lens-pill${isSelected ? " is-focused" : ""}${hasError ? " is-error" : ""}`}
      onClick={onSelect}
    >
      <span>{label}</span>
    </button>
  );
}
