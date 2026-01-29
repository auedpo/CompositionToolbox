import React from "react";

import { listLenses } from "../../lenses/lensRegistry.js";
import { useStore } from "../../state/store.js";
import { selectSelectedTrackId, selectTrackOrder } from "../../state/selectors.js";

export default function LensBrowser() {
  const trackOrder = useStore(selectTrackOrder);
  const selectedTrackId = useStore(selectSelectedTrackId);
  const actions = useStore((state) => state.actions);
  const lenses = listLenses();
  const activeTrackId = selectedTrackId || trackOrder[0] || null;

  return (
    <section className="workspace-panel workspace-panel-browser">
      <div className="workspace-panel-header">Lens Browser</div>
      <div className="workspace-panel-body">
        {trackOrder.length === 0 ? (
          <div className="workspace-placeholder">Create a lane to add lenses.</div>
        ) : (
          <div>
            <ul>
              {lenses.map((lens) => (
                <li key={lens.meta.id}>
                  <button
                    type="button"
                    className="component-pill"
                    onDoubleClick={() => {
                      if (activeTrackId) {
                        actions.addLensInstance(activeTrackId, lens.meta.id);
                      }
                    }}
                  >
                    {lens.meta.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
