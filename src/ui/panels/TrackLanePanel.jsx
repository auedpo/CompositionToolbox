import React, { useMemo } from "react";

import { useStore } from "../../state/store.js";
import { useDraftSelectors } from "../hooks/useDraftSelectors.js";
import { useSelection } from "../hooks/useSelection.js";
import { useLensRegistry } from "../hooks/useLensRegistry.js";
import {
  useLaneOrder,
  useLanesById,
  useLensInstancesById
} from "../hooks/useWorkspaceSelectors.js";
import { selectGridRows, selectGrid } from "../../state/selectors.js";
import { makeCellKey } from "../../state/schema.js";
import LensPill from "../components/LensPill.jsx";

export default function TrackLanePanel() {
  const laneOrder = useLaneOrder();
  const lanesById = useLanesById();
  const lensInstancesById = useLensInstancesById();
  const grid = useStore(selectGrid);
  const rows = useStore(selectGridRows);
  const { activeDraftIdByLensInstanceId, lastErrorByLensInstanceId } = useDraftSelectors();
  const { selection, selectLane, selectLens } = useSelection();
  const lensRegistry = useLensRegistry();

  const laneLensMap = useMemo(() => {
    const map = {};
    const cells = grid.cells || {};
    const rowCount = Number.isFinite(grid.rows) ? grid.rows : rows;
    laneOrder.forEach((laneId) => {
      const list = [];
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const cellKey = makeCellKey(laneId, rowIndex);
        const lensInstanceId = cells[cellKey];
        if (lensInstanceId) list.push(lensInstanceId);
      }
      map[laneId] = list;
    });
    return map;
  }, [grid, laneOrder, rows]);

  const lensNameById = useMemo(() => {
    const map = new Map();
    lensRegistry.forEach((lens) => {
      map.set(lens.lensId, lens.meta && lens.meta.name ? lens.meta.name : lens.lensId);
    });
    return map;
  }, [lensRegistry]);

  const getLabel = (instance) => {
    if (!instance) return "";
    const name = lensNameById.get(instance.lensId);
    return name || instance.lensId;
  };

  return (
    <section className="workspace-panel workspace-panel-track">
      <div className="workspace-panel-header">Lane overview</div>
      <div className="workspace-panel-body">
        {laneOrder.length === 0 ? (
          <div className="workspace-placeholder">No lanes yet.</div>
        ) : (
          <div className="track-lane-list">
            {laneOrder.map((laneId) => {
              const lane = lanesById[laneId];
              const lensIds = laneLensMap[laneId] || [];
              const isLaneSelected = selection.laneId === laneId;
              return (
                <div key={laneId} className="track-lane">
                  <div className="track-lane-header">
                    <button
                      type="button"
                      className={`component-pill${isLaneSelected ? " is-focused" : ""}`}
                      onClick={() => selectLane(laneId)}
                    >
                      {lane ? (lane.name || lane.laneId) : laneId}
                    </button>
                    <div className="track-lane-count">{lensIds.length} / {rows}</div>
                  </div>
                  {lensIds.length ? (
                    <div className="track-lane-pills">
                      {lensIds.map((lensInstanceId) => {
                        const instance = lensInstancesById[lensInstanceId];
                        const label = instance ? getLabel(instance) : lensInstanceId;
                        const hasError = Boolean(lastErrorByLensInstanceId[lensInstanceId]);
                        const hasActive = Boolean(activeDraftIdByLensInstanceId[lensInstanceId]);
                        const isSelected = selection.lensInstanceId === lensInstanceId;
                        return (
                          <LensPill
                            key={lensInstanceId}
                            label={label}
                            isSelected={isSelected}
                            hasError={hasError}
                            hasActiveDraft={hasActive}
                            onSelect={() => selectLens(lensInstanceId)}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="workspace-placeholder">No lenses in this lane.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
