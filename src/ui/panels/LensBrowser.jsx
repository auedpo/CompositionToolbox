import React, { useMemo, useState } from "react";

import { useLensRegistry } from "../hooks/useLensRegistry.js";
import { useLaneOrder, useLanesById } from "../hooks/useWorkspaceSelectors.js";
import { useSelection } from "../hooks/useSelection.js";
import { dispatchModularGridDrag } from "../dragEvents.js";

export default function LensBrowser() {
  const [filter, setFilter] = useState("");
  const lanesById = useLanesById();
  const laneOrder = useLaneOrder();
  const { selection } = useSelection();
  const lenses = useLensRegistry();

  const currentLaneName = selection.laneId
    ? (lanesById[selection.laneId]?.name || selection.laneId)
    : (laneOrder[0] ? lanesById[laneOrder[0]]?.name : "Lane");

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return lenses;
    return lenses.filter((lens) => {
      return lens.name.toLowerCase().includes(query) || lens.lensId.toLowerCase().includes(query);
    });
  }, [filter, lenses]);

  const handleDragStart = (lens) => (event) => {
    event.stopPropagation();
    event.preventDefault();
    dispatchModularGridDrag({
      type: "browser",
      lensId: lens.lensId,
      label: lens.name || lens.lensId,
      clientX: event.clientX,
      clientY: event.clientY
    });
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
        <div className="modular-grid-browser-hint">
          Drag a lens into the grid to place it in <strong>{currentLaneName || "a lane"}</strong>.
        </div>
        {filtered.length === 0 ? (
          <div className="workspace-placeholder">No lenses found.</div>
        ) : (
          <ul className="modular-grid-browser-list">
            {filtered.map((lens) => (
              <li key={lens.lensId} className="modular-grid-browser-item">
                <div className="modular-grid-browser-info">
                  <div className="modular-grid-browser-name">{lens.name}</div>
                  <div className="modular-grid-browser-meta">{lens.lensId}</div>
                </div>
                <button
                  type="button"
                  className="modular-grid-browser-handle"
                  title="Drag to grid"
                  onPointerDown={handleDragStart(lens)}
                >
                  ⎘
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
