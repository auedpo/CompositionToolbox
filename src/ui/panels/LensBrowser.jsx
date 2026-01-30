import React, { useMemo, useState } from "react";

import { useStore } from "../../state/store.js";
import { useSelection } from "../hooks/useSelection.js";
import { useLensRegistry } from "../hooks/useLensRegistry.js";
import { useTrackOrder } from "../hooks/useWorkspaceSelectors.js";

export default function LensBrowser() {
  const actions = useStore((state) => state.actions);
  const trackOrder = useTrackOrder();
  const { selection } = useSelection();
  const [filter, setFilter] = useState("");
  const lenses = useLensRegistry();
  const activeTrackId = selection.trackId || trackOrder[0] || null;

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return lenses;
    return lenses.filter((lens) => {
      return lens.name.toLowerCase().includes(query) || lens.lensId.toLowerCase().includes(query);
    });
  }, [filter, lenses]);

  const handleAdd = (lensId) => {
    actions.addLensToTrack({ trackId: activeTrackId, lensId });
  };

  return (
    <section className="workspace-panel workspace-panel-browser">
      <div className="workspace-panel-header">Lens Browser</div>
      <div className="workspace-panel-body">
        <input
          className="component-field"
          type="text"
          placeholder="Search lenses"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {filtered.length === 0 ? (
          <div className="workspace-placeholder">No lenses found.</div>
        ) : (
          <ul>
            {filtered.map((lens) => (
              <li key={lens.lensId}>
                <button
                  type="button"
                  className="component-pill"
                  onClick={() => handleAdd(lens.lensId)}
                >
                  {lens.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {trackOrder.length === 0 ? (
          <div className="workspace-placeholder">No lanes yet. Adding a lens will create one.</div>
        ) : null}
      </div>
    </section>
  );
}
