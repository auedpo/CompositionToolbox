import React, { useMemo } from "react";

import { useStore } from "../../state/store.js";
import {
  selectSelectedLensInstanceId,
  selectSelectedLensInstanceLensId,
  selectSelectedLensInstanceLabel,
  selectSelectedLensInstanceParams
} from "../../state/selectors.js";
import { getLens } from "../../lenses/lensRegistry.js";

export default function LensInspector() {
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const lensId = useStore(selectSelectedLensInstanceLensId);
  const lensLabel = useStore(selectSelectedLensInstanceLabel);
  const lensParams = useStore(selectSelectedLensInstanceParams);
  const lensMeta = useMemo(() => (lensId ? getLens(lensId) : null), [lensId]);
  const displayLabel = lensLabel || (lensMeta && lensMeta.meta ? lensMeta.meta.name : null) || lensId || "";

  return (
    <section className="workspace-panel workspace-panel-lens">
      <div className="workspace-panel-header">Lens Inspector</div>
      <div className="workspace-panel-body">
        {!selectedLensInstanceId ? (
          <div className="workspace-placeholder">No lens selected</div>
        ) : (
          <div>
            <div>{displayLabel || "Lens"}</div>
            <div className="hint">{lensId || "Unknown lens"}</div>
            <div className="hint">{selectedLensInstanceId}</div>
            <div className="hint">Params (read-only)</div>
            <textarea
              className="component-field"
              value={JSON.stringify(lensParams || {}, null, 2)}
              readOnly
              rows={12}
            />
          </div>
        )}
      </div>
    </section>
  );
}
