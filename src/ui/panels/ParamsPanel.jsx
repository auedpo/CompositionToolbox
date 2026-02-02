import React, { useEffect, useMemo, useState } from "react";

import { useStore } from "../../state/store.js";
import {
  selectSelectedLensError,
  selectSelectedLensInstanceId,
  selectSelectedLensInstanceLensId,
  selectSelectedLensInstanceParams
} from "../../state/selectors.js";
import { getLens } from "../../lenses/lensRegistry.js";
import SchemaParamEditor from "../params/SchemaParamEditor.jsx";
import AdvancedJsonEditor from "../params/AdvancedJsonEditor.jsx";

export default function ParamsPanel() {
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const lensId = useStore(selectSelectedLensInstanceLensId);
  const lensParams = useStore(selectSelectedLensInstanceParams);
  const lensError = useStore(selectSelectedLensError);
  const actions = useStore((state) => state.actions);
  const lensDef = useMemo(() => (lensId ? getLens(lensId) : null), [lensId]);
  const displayLabel = (lensDef && lensDef.meta ? lensDef.meta.name : null) || lensId || "";
  const [showAdvanced, setShowAdvanced] = useState(false);

  const replaceParams = (nextParams) => {
    if (!selectedLensInstanceId) return;
    actions.replaceLensParams(selectedLensInstanceId, nextParams);
  };

  const patchParams = (patch) => {
    if (!selectedLensInstanceId) return;
    actions.patchLensParams(selectedLensInstanceId, patch);
  };

  const schema = lensDef && lensDef.paramSchema ? lensDef.paramSchema : null;

  useEffect(() => {
    setShowAdvanced(false);
  }, [selectedLensInstanceId]);

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
            {schema ? (
              <SchemaParamEditor
                schema={schema}
                params={lensParams}
                lensId={lensId}
                onPatch={patchParams}
                onReplace={replaceParams}
              />
            ) : (
              <div className="hint">No schema editor yet.</div>
            )}
            <div>
              <button
                type="button"
                className="component-button"
                onClick={() => setShowAdvanced((prev) => !prev)}
              >
                {showAdvanced ? "Hide Advanced JSON" : "Advanced JSON"}
              </button>
            </div>
            {showAdvanced ? (
              <AdvancedJsonEditor
                lensInstanceId={selectedLensInstanceId}
                params={lensParams}
                onReplace={replaceParams}
                derivedError={lensError}
              />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
