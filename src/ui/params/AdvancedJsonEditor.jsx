import React, { useEffect, useRef, useState } from "react";

export default function AdvancedJsonEditor({ lensInstanceId, params, onReplace, derivedError }) {
  const [jsonTextValue, setJsonTextValue] = useState("");
  const [jsonParseError, setJsonParseError] = useState(null);
  const lastLensInstanceIdRef = useRef(null);

  useEffect(() => {
    if (lensInstanceId === lastLensInstanceIdRef.current) {
      return;
    }
    lastLensInstanceIdRef.current = lensInstanceId;
    setJsonTextValue(JSON.stringify(params || {}, null, 2));
    setJsonParseError(null);
  }, [lensInstanceId, params]);

  const handleApplyJson = () => {
    if (!lensInstanceId) return;
    try {
      const parsed = JSON.parse(jsonTextValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonParseError("Params must be a JSON object.");
        return;
      }
      onReplace(parsed);
      setJsonParseError(null);
      setJsonTextValue(JSON.stringify(parsed, null, 2));
    } catch (error) {
      setJsonParseError(error && error.message ? error.message : "Invalid JSON.");
    }
  };

  return (
    <div>
      <div className="hint">Advanced JSON (authoritative)</div>
      <textarea
        className="component-field"
        value={jsonTextValue}
        onChange={(event) => {
          setJsonTextValue(event.target.value);
          if (jsonParseError) setJsonParseError(null);
        }}
        rows={12}
      />
      <button
        type="button"
        className="component-button"
        onClick={handleApplyJson}
      >
        Apply
      </button>
      {jsonParseError ? (
        <div className="hint">{jsonParseError}</div>
      ) : null}
      {derivedError ? (
        <div className="hint">Error: {derivedError}</div>
      ) : null}
    </div>
  );
}
