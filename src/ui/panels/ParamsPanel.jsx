import React, { useEffect, useMemo, useRef, useState } from "react";

import { useStore } from "../../state/store.js";
import {
  selectSelectedLensInstanceId,
  selectSelectedLensInstanceLensId,
  selectSelectedLensInstanceParams
} from "../../state/selectors.js";
import { getLens } from "../../lenses/lensRegistry.js";

export default function ParamsPanel() {
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const lensId = useStore(selectSelectedLensInstanceLensId);
  const lensParams = useStore(selectSelectedLensInstanceParams);
  const actions = useStore((state) => state.actions);
  const [textValue, setTextValue] = useState("");
  const [parseError, setParseError] = useState(null);
  const lastLensInstanceIdRef = useRef(null);
  const lensMeta = useMemo(() => (lensId ? getLens(lensId) : null), [lensId]);
  const displayLabel = (lensMeta && lensMeta.meta ? lensMeta.meta.name : null) || lensId || "";

  useEffect(() => {
    if (selectedLensInstanceId === lastLensInstanceIdRef.current) {
      return;
    }
    lastLensInstanceIdRef.current = selectedLensInstanceId;
    if (!selectedLensInstanceId) {
      setTextValue("");
      setParseError(null);
      return;
    }
    setTextValue(JSON.stringify(lensParams || {}, null, 2));
    setParseError(null);
  }, [selectedLensInstanceId, lensParams]);

  const handleApply = () => {
    if (!selectedLensInstanceId) return;
    try {
      const parsed = JSON.parse(textValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setParseError("Params must be a JSON object.");
        return;
      }
      actions.replaceLensParams(selectedLensInstanceId, parsed);
      setParseError(null);
      setTextValue(JSON.stringify(parsed, null, 2));
    } catch (error) {
      setParseError(error && error.message ? error.message : "Invalid JSON.");
    }
  };

  return (
    <section className="workspace-panel workspace-params-panel">
      <div className="workspace-panel-header">Parameters</div>
      <div className="workspace-panel-body">
        {!selectedLensInstanceId ? (
          <div className="workspace-placeholder">No lens selected</div>
        ) : (
          <div>
            <div>{displayLabel || "Lens"}</div>
            <div className="hint">{lensId || "Unknown lens"}</div>
            <div className="hint">{selectedLensInstanceId}</div>
            <div className="hint">Lens Parameters (Authoritative)</div>
            <textarea
              className="component-field"
              value={textValue}
              onChange={(event) => {
                setTextValue(event.target.value);
                if (parseError) setParseError(null);
              }}
              rows={12}
            />
            <button
              type="button"
              className="component-button"
              onClick={handleApply}
            >
              Apply
            </button>
            {parseError ? (
              <div className="hint">{parseError}</div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
