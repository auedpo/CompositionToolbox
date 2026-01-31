import React, { useMemo } from "react";

import { useStore } from "../../state/store.js";
import { selectLaneOrder, selectLanesById, selectGrid, selectGridRows } from "../../state/selectors.js";
import { useSelection } from "../hooks/useSelection.js";
import { useLensInstancesById } from "../hooks/useWorkspaceSelectors.js";
import { useLensRegistry } from "../hooks/useLensRegistry.js";
import { makeCellKey } from "../../state/schema.js";

export default function TrackInspector() {
  const laneOrder = useStore(selectLaneOrder);
  const lanesById = useStore(selectLanesById);
  const grid = useStore(selectGrid);
  const rows = useStore(selectGridRows);
  const lensInstancesById = useLensInstancesById();
  const lensRegistry = useLensRegistry();
  const { selection, selectLane, selectLens } = useSelection();

  const lensNameById = useMemo(() => {
    const map = new Map();
    lensRegistry.forEach((lens) => {
      map.set(lens.lensId, lens.meta && lens.meta.name ? lens.meta.name : lens.lensId);
    });
    return map;
  }, [lensRegistry]);

  const laneLensMap = useMemo(() => {
    const map = {};
    const cells = grid.cells || {};
    const rowCount = Number.isFinite(grid.rows) ? grid.rows : rows;
    laneOrder.forEach((laneId) => {
      const list = [];
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const key = makeCellKey(laneId, rowIndex);
        const lensInstanceId = cells[key];
        if (lensInstanceId) list.push(lensInstanceId);
      }
      map[laneId] = list;
    });
    return map;
  }, [grid, laneOrder, rows]);

  const selectedLaneId = selection.laneId;
  const selectedLensIds = selectedLaneId ? laneLensMap[selectedLaneId] || [] : [];

  return (
    <section className="workspace-panel workspace-panel-track">
      <div className="workspace-panel-header">Lane Inspector</div>
      <div className="workspace-panel-body">
        {laneOrder.length === 0 ? (
          <div className="workspace-placeholder">No lanes yet.</div>
        ) : (
          <div>
            <div>Lanes</div>
            <ul>
              {laneOrder.map((laneId) => {
                const lane = lanesById[laneId];
                const isSelected = laneId === selectedLaneId;
                return (
                  <li key={laneId}>
                    <button
                      type="button"
                      className={`component-pill${isSelected ? " is-focused" : ""}`}
                      onClick={() => selectLane(laneId)}
                    >
                      {lane ? (lane.name || laneId) : laneId}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {selectedLaneId ? (
          <div>
            <div>Lens Instances</div>
            {selectedLensIds.length === 0 ? (
              <div className="workspace-placeholder">No lenses in this lane.</div>
            ) : (
              <ul>
                {selectedLensIds.map((lensInstanceId) => {
                  const instance = lensInstancesById[lensInstanceId];
                  const label = instance ? (lensNameById.get(instance.lensId) || instance.lensId) : lensInstanceId;
                  return (
                    <li key={lensInstanceId}>
                      <button
                        type="button"
                        className="component-pill"
                        onClick={() => selectLens(lensInstanceId)}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="workspace-placeholder">Select a lane.</div>
        )}
      </div>
    </section>
  );
}
