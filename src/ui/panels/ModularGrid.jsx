import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStore } from "../../state/store.js";
import { selectGrid, selectGridRows } from "../../state/selectors.js";
import { useDraftSelectors } from "../hooks/useDraftSelectors.js";
import { useLensRegistry } from "../hooks/useLensRegistry.js";
import { useLaneOrder, useLanesById, useLensInstancesById } from "../hooks/useWorkspaceSelectors.js";
import { useSelection } from "../hooks/useSelection.js";
import { makeCellKey } from "../../state/schema.js";
import { MODULAR_GRID_DRAG_START } from "../dragEvents.js";

const DRAG_GHOST_OFFSET = 8;

export default function ModularGrid() {
  const laneOrder = useLaneOrder();
  const lanesById = useLanesById();
  const { selection, selectLane, selectLens } = useSelection();
  const grid = useStore(selectGrid);
  const rows = useStore(selectGridRows);
  const cells = grid.cells || {};
  const rowIndexes = useMemo(() => Array.from({ length: rows }, (_, index) => index), [rows]);
  const laneCountStyle = useMemo(() => ({ "--lane-count": laneOrder.length }), [laneOrder.length]);
  const lensInstancesById = useLensInstancesById();
  const { activeDraftIdByLensInstanceId, lastErrorByLensInstanceId } = useDraftSelectors();
  const lensRegistry = useLensRegistry();
  const actions = useStore((state) => state.actions);

  const defaultLensLabel = (instance) => {
    const registryLens = instance ? lensRegistry.find((lens) => lens.lensId === instance.lensId) : null;
    if (!instance) return "";
    if (registryLens && registryLens.meta && registryLens.meta.name) return registryLens.meta.name;
    return instance.lensId || instance.lensInstanceId;
  };

  const lensNameById = useMemo(() => {
    const map = new Map();
    lensRegistry.forEach((lens) => {
      map.set(lens.lensId, lens.meta && lens.meta.name ? lens.meta.name : lens.lensId);
    });
    return map;
  }, [lensRegistry]);

  const [dragState, setDragState] = useState(null);
  const [hoveredCellKey, setHoveredCellKey] = useState(null);
  const [dropStatus, setDropStatus] = useState("");
  const pendingDragRef = useRef(null);

  const laneOccupancy = useMemo(() => {
    const counts = {};
    laneOrder.forEach((laneId) => {
      let count = 0;
      rowIndexes.forEach((rowIndex) => {
        const key = makeCellKey(laneId, rowIndex);
        if (cells[key]) count += 1;
      });
      counts[laneId] = count;
    });
    return counts;
  }, [cells, laneOrder, rowIndexes]);

  const laneWarningMap = useMemo(() => {
    const map = {};
    laneOrder.forEach((laneId) => {
      const hasWarning = rowIndexes.some((rowIndex) => {
        const cellKey = makeCellKey(laneId, rowIndex);
        const lensInstanceId = cells[cellKey];
        return Boolean(lensInstanceId && lastErrorByLensInstanceId[lensInstanceId]);
      });
      map[laneId] = hasWarning;
    });
    return map;
  }, [cells, laneOrder, rowIndexes, lastErrorByLensInstanceId]);

  const handleCellEnter = (cellKey) => {
    if (!dragState) return;
    setHoveredCellKey(cellKey);
  };

  const handleCellLeave = () => {
    if (!dragState) return;
    setHoveredCellKey(null);
  };

  const finalizeDrop = useCallback((clientX, clientY) => {
    const currentDrag = dragState;
    if (!currentDrag) return;
    setDragState(null);
    setHoveredCellKey(null);
    const target = document.elementFromPoint(clientX, clientY);
    const cellEl = target ? target.closest(".modular-grid-cell") : null;
    if (!cellEl) {
      setDropStatus("Drop canceled (not over the grid).");
      return;
    }
    const targetLaneId = cellEl.getAttribute("data-lane-id");
    const rowAttr = cellEl.getAttribute("data-row-index");
    const rowIndex = Number(rowAttr);
    const cellKey = cellEl.getAttribute("data-cell-key");
    if (!targetLaneId || !Number.isInteger(rowIndex)) {
      setDropStatus("Drop canceled (invalid target).");
      return;
    }
    if (cells[cellKey]) {
      setDropStatus("Cell is occupied.");
      return;
    }
    if (currentDrag.type === "browser" && currentDrag.lensId) {
      actions.addLensToCell({
        lensId: currentDrag.lensId,
        laneId: targetLaneId,
        row: rowIndex
      });
      setDropStatus("");
      return;
    }
    if (currentDrag.type === "grid" && currentDrag.lensInstanceId) {
      actions.moveLensToCell({
        lensInstanceId: currentDrag.lensInstanceId,
        laneId: targetLaneId,
        row: rowIndex
      });
      setDropStatus("");
      return;
    }
    setDropStatus("Drop canceled.");
  }, [actions, cells, dragState]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragState && pendingDragRef.current) {
        const pending = pendingDragRef.current;
        const dx = event.clientX - pending.startX;
        const dy = event.clientY - pending.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 4) {
          setDragState({
            type: pending.type,
            lensInstanceId: pending.lensInstanceId,
            label: pending.label,
            x: event.clientX,
            y: event.clientY
          });
          pendingDragRef.current = null;
          setHoveredCellKey(null);
        }
        return;
      }
      if (dragState) {
        setDragState((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : null));
      }
    };
    const handlePointerUp = (event) => {
      if (dragState) {
        finalizeDrop(event.clientX, event.clientY);
      } else {
        setHoveredCellKey(null);
      }
      pendingDragRef.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, finalizeDrop]);

  useEffect(() => {
    if (!dropStatus) return undefined;
    const timer = window.setTimeout(() => setDropStatus(""), 2500);
    return () => window.clearTimeout(timer);
  }, [dropStatus]);

  useEffect(() => {
    const handleExternalDrag = (event) => {
      const detail = event && event.detail ? event.detail : null;
      if (!detail) return;
      setDropStatus("");
      setDragState({
        type: detail.type || "browser",
        lensId: detail.lensId,
        label: detail.label || detail.lensId,
        x: Number.isFinite(detail.clientX) ? detail.clientX : 0,
        y: Number.isFinite(detail.clientY) ? detail.clientY : 0
      });
      setHoveredCellKey(null);
    };
    window.addEventListener(MODULAR_GRID_DRAG_START, handleExternalDrag);
    return () => {
      window.removeEventListener(MODULAR_GRID_DRAG_START, handleExternalDrag);
    };
  }, []);

  const startDragFromGrid = (lensInstanceId, label) => (event) => {
    event.stopPropagation();
    setDropStatus("");
    pendingDragRef.current = {
      type: "grid",
      lensInstanceId,
      label,
      startX: event.clientX,
      startY: event.clientY
    };
  };

  const cellClass = (cellKey, occupied) => {
    const classes = ["modular-grid-cell"];
    if (dragState && hoveredCellKey === cellKey) {
      classes.push(occupied ? "modular-grid-cell--invalid" : "modular-grid-cell--valid");
    }
    if (occupied) {
      classes.push("modular-grid-cell--filled");
    }
    return classes.join(" ");
  };

  return (
    <section className="workspace-panel workspace-panel-grid">
      <div className="workspace-panel-header">Modular Grid</div>
      <div className="workspace-panel-body">
        <div className="modular-grid">
          <div className="modular-grid-lane-headers" style={laneCountStyle}>
            {laneOrder.map((laneId) => {
              const lane = lanesById[laneId] || {};
              const isSelectedLane = selection.laneId === laneId;
              const laneHasWarning = laneWarningMap[laneId];
              return (
                <button
                  key={laneId}
                  type="button"
                  className={`modular-grid-lane-header${isSelectedLane ? " is-selected" : ""}${laneHasWarning ? " has-danger" : ""}`}
                  onClick={() => selectLane(laneId)}
                >
                  <div className="modular-grid-lane-title">{lane.name || laneId}</div>
                  <div className="modular-grid-lane-count">
                    {laneOccupancy[laneId] ?? 0} / {rows}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="modular-grid-lanes" style={laneCountStyle}>
            {laneOrder.map((laneId) => (
              <div key={laneId} className="modular-grid-lane">
                {rowIndexes.map((rowIndex) => {
                  const cellKey = makeCellKey(laneId, rowIndex);
                  const lensInstanceId = cells[cellKey];
                  const instance = lensInstanceId ? lensInstancesById[lensInstanceId] : null;
                  const isSelectedLens = selection.lensInstanceId === lensInstanceId;
                  const hasError = Boolean(lastErrorByLensInstanceId[lensInstanceId]);
                  const hasActive = Boolean(activeDraftIdByLensInstanceId[lensInstanceId]);
                  const label = instance ? (lensNameById.get(instance.lensId) || defaultLensLabel(instance)) : "";
                  return (
                    <div
                      key={cellKey}
                      className={cellClass(cellKey, Boolean(lensInstanceId))}
                      data-cell-key={cellKey}
                      data-lane-id={laneId}
                      data-row-index={rowIndex}
                      onPointerEnter={() => handleCellEnter(cellKey)}
                      onPointerLeave={handleCellLeave}
                    >
                      {lensInstanceId && instance ? (
                        <button
                          type="button"
                          className={`modular-grid-lens${isSelectedLens ? " is-selected" : ""}${hasError ? " has-error" : ""}`}
                          onClick={() => selectLens(lensInstanceId)}
                          onPointerDown={startDragFromGrid(lensInstanceId, label)}
                        >
                          <div className="modular-grid-lens-name">{label}</div>
                          <div className="modular-grid-lens-meta">
                            <span>{lensInstanceId}</span>
                          </div>
                        </button>
                      ) : (
                        <div className="modular-grid-empty">Empty</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {dropStatus ? (
          <div className="modular-grid-status" role="status">
            {dropStatus}
          </div>
        ) : null}
        {dragState ? (
          <div
            className="modular-grid-drag-ghost"
            style={{ left: dragState.x + DRAG_GHOST_OFFSET, top: dragState.y + DRAG_GHOST_OFFSET }}
          >
            {dragState.label}
          </div>
        ) : null}
      </div>
    </section>
  );
}
