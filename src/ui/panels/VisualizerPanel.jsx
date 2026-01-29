import React from "react";

import { useStore } from "../../state/store.js";
import {
  selectActiveDraftForLensInstance,
  selectSelectedLensError,
  selectSelectedLensInstanceId,
  selectSelectedLensInstanceLensId
} from "../../state/selectors.js";

function formatPreview(values) {
  if (values === undefined) return "—";
  try {
    const text = JSON.stringify(values, null, 2);
    return text.length > 600 ? `${text.slice(0, 600)}…` : text;
  } catch (error) {
    return "Unserializable payload.";
  }
}

export default function VisualizerPanel() {
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const lensId = useStore(selectSelectedLensInstanceLensId);
  const lensError = useStore(selectSelectedLensError);
  const activeDraft = useStore((state) =>
    selectActiveDraftForLensInstance(state, selectedLensInstanceId)
  );

  return (
    <section className="workspace-panel workspace-visualizer-panel">
      <div className="workspace-panel-header">Visualizer</div>
      <div className="workspace-panel-body">
        {!selectedLensInstanceId ? (
          <div className="workspace-placeholder">No lens selected</div>
        ) : (
          <div>
            <div className="hint">{lensId || "Unknown lens"}</div>
            <div className="hint">{selectedLensInstanceId}</div>
            {lensError ? (
              <div className="hint">Error: {lensError}</div>
            ) : null}
            <div className="hint">Active Draft Preview</div>
            {activeDraft ? (
              <>
                <div className="hint">{activeDraft.draftId}</div>
                <textarea
                  className="component-field"
                  value={formatPreview(activeDraft.payload && activeDraft.payload.values)}
                  readOnly
                  rows={12}
                />
              </>
            ) : (
              <div className="workspace-placeholder">No active draft.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
