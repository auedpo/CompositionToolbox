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

function formatDraftTitle(draft) {
  if (!draft) return "";
  return draft.summary || draft.type || draft.draftId || "Active draft";
}

function formatDraftPreview(values) {
  if (values === undefined) return "";
  try {
    const text = Array.isArray(values)
      ? values.map((value) => String(value)).join(", ")
      : String(values);
    return text.length > 160 ? `${text.slice(0, 160)}...` : text;
  } catch {
    return "Unserializable payload.";
  }
}

export default function TrackLanePanel() {
  const laneOrder = useLaneOrder();
  const lanesById = useLanesById();
  const lensInstancesById = useLensInstancesById();
  const grid = useStore(selectGrid);
  const rows = useStore(selectGridRows);
  const {
    activeDraftIdByLensInstanceId,
    lastErrorByLensInstanceId,
    draftsById
  } = useDraftSelectors();
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

  const selectedLaneId = selection.laneId;
  const selectedLane = selectedLaneId ? lanesById[selectedLaneId] : null;
  const selectedLaneLensIds = selectedLaneId ? (laneLensMap[selectedLaneId] || []) : [];
  const laneDisplayName = selectedLane
    ? (selectedLane.name || selectedLane.laneId)
    : selectedLaneId || "Lane overview";
  const lensCountLabel = `${selectedLaneLensIds.length} lens${selectedLaneLensIds.length === 1 ? "" : "es"}`;
  const selectionPlaceholder = selectedLaneId
    ? `Lane ${laneDisplayName}`
    : "Select a lane to inspect its lenses";

  return (
    <section className="workspace-panel workspace-panel-track lane-overview-panel">
      <div className="workspace-panel-header">
        Lane Inspector
      </div>
      <div className="workspace-panel-body lane-overview-body">
        <div className="lane-overview-subheader">
          <div className="lane-overview-header-bar">
            <div className="lane-overview-header-left">
              <div className="lane-overview-title">{laneDisplayName}</div>
              <div className="hint">{lensCountLabel}</div>
            </div>
            <div className="lane-overview-actions">
              {laneOrder.length ? (
                laneOrder.map((laneId) => {
                  const lane = lanesById[laneId];
                  const label = lane ? (lane.name || lane.laneId) : laneId;
                  const isLaneSelected = selection.laneId === laneId;
                  return (
                    <button
                      key={laneId}
                      type="button"
                      className={`component-pill${isLaneSelected ? " is-focused" : ""}`}
                      onClick={() => selectLane(laneId)}
                    >
                      {label}
                    </button>
                  );
                })
              ) : (
                <div className="workspace-placeholder">No lanes yet.</div>
              )}
            </div>
          </div>
        </div>
        {!selectedLaneId ? (
          <div className="workspace-placeholder">{selectionPlaceholder}</div>
        ) : selectedLaneLensIds.length === 0 ? (
          <div className="workspace-placeholder">No lenses in this lane.</div>
        ) : (
          <div className="lane-lens-list">
            {selectedLaneLensIds.map((lensInstanceId) => {
              const instance = lensInstancesById[lensInstanceId];
              const label = instance ? getLabel(instance) : lensInstanceId;
              const activeDraftId = activeDraftIdByLensInstanceId[lensInstanceId];
              const activeDraft = activeDraftId ? draftsById[activeDraftId] : null;
              const draftTitle = formatDraftTitle(activeDraft);
              const draftPreview = activeDraft ? formatDraftPreview(activeDraft.payload && activeDraft.payload.values) : "";
              const errorMessage = lastErrorByLensInstanceId[lensInstanceId];
              const hasError = Boolean(errorMessage);
              const isSelected = selection.lensInstanceId === lensInstanceId;
              return (
                <button
                  key={lensInstanceId}
                  type="button"
                  className={`lane-lens-card${isSelected ? " is-selected" : ""}${hasError ? " is-error" : ""}`}
                  onClick={() => selectLens(lensInstanceId)}
                >
                  <div className="lane-lens-card-header">
                    <span className="lane-lens-card-name">{label}</span>
                    <span className="lane-lens-card-status">
                      {activeDraft ? "Active draft" : "No active draft"}
                    </span>
                  </div>
                  <div className="lane-lens-card-body">
                    {activeDraft ? (
                      <>
                        <div className="lane-lens-card-title">{draftTitle}</div>
                        <div className="lane-lens-card-meta">
                          <span className="lane-lens-card-id">{activeDraft.draftId}</span>
                          {draftPreview ? (
                            <span className="lane-lens-card-preview">{draftPreview}</span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="lane-lens-card-empty">No drafts yet for this lens.</div>
                    )}
                    {hasError && errorMessage ? (
                      <div className="lane-lens-card-error">{errorMessage}</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
