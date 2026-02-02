import React, { useMemo } from "react";

import { useStore } from "../../state/store.js";
import { getLens } from "../../lenses/lensRegistry.js";
import { useDraftSelectors } from "../hooks/useDraftSelectors.js";
import { useLensInstancesById, useLaneOrder, useLanesById } from "../hooks/useWorkspaceSelectors.js";
import { useSelection } from "../hooks/useSelection.js";
import {
  selectGrid,
  selectGridRows,
  selectLensPlacementById
} from "../../state/selectors.js";
import AdvancedJsonEditor from "../params/AdvancedJsonEditor.jsx";
import { makeCellKey } from "../../state/schema.js";

export default function LensInspector() {
  const selectedLensInstanceId = useStore((state) => state.authoritative.selection.lensInstanceId);
  const lensInstancesById = useLensInstancesById();
  const laneOrder = useLaneOrder();
  const lanesById = useLanesById();
  const grid = useStore(selectGrid);
  const lensPlacementById = useStore(selectLensPlacementById);
  const { activeDraftIdByLensInstanceId } = useDraftSelectors();
  const actions = useStore((state) => state.actions);
  const { selectLens } = useSelection();

  const instance = selectedLensInstanceId ? lensInstancesById[selectedLensInstanceId] : null;
  const lensDef = useMemo(() => (instance ? getLens(instance.lensId) : null), [instance]);
  const displayLabel = instance
    ? (lensDef && lensDef.meta ? lensDef.meta.name : null) || instance.lensId || instance.lensInstanceId
    : "";
  const input = instance && instance.input
    ? instance.input
    : { mode: "auto", pinned: false, pick: "active", packaging: "single" };

  const placement = selectedLensInstanceId
    ? lensPlacementById[selectedLensInstanceId]
    : null;
  const laneId = placement ? placement.laneId : null;
  const laneName = laneId ? (lanesById[laneId]?.name || laneId) : null;
  const laneRow = placement ? placement.row : null;

  const upstreamLensInstanceIds = useMemo(() => {
    if (!laneId || !Number.isFinite(laneRow)) return [];
    const cells = grid.cells || {};
    const rowCount = Number.isFinite(grid.rows) ? grid.rows : laneRow;
    const ids = [];
    for (let rowIndex = 0; rowIndex < Math.min(rowCount, laneRow); rowIndex += 1) {
      const key = makeCellKey(laneId, rowIndex);
      const lensInstanceId = cells[key];
      if (lensInstanceId) {
        ids.push(lensInstanceId);
      }
    }
    return ids;
  }, [grid, laneId, laneRow]);

  const pick = input && input.pick === "selected" ? "selected" : "active";
  const packaging = input && input.packaging === "packDrafts" ? "packDrafts" : "single";
  const pinnedDraftId = input && input.mode === "ref"
    ? (typeof input.ref === "string" ? input.ref : (input.ref && input.ref.draftId))
    : null;

  const pinnedLensInstanceId = pinnedDraftId
    ? Object.keys(activeDraftIdByLensInstanceId)
      .find((lensInstanceId) => activeDraftIdByLensInstanceId[lensInstanceId] === pinnedDraftId)
    : "";

  const patchInput = (patch) => {
    if (!selectedLensInstanceId) return;
    actions.setLensInput(selectedLensInstanceId, { ...input, ...patch });
  };

  const handleModeChange = (event) => {
    if (!selectedLensInstanceId) return;
    const mode = event.target.value;
    if (mode === "auto") {
      actions.setLensInput(selectedLensInstanceId, {
        ...input,
        mode: "auto",
        pinned: false,
        ref: undefined
      });
      return;
    }
    const fallbackLens = upstreamLensInstanceIds.at(-1);
    const draftId = fallbackLens ? activeDraftIdByLensInstanceId[fallbackLens] : undefined;
    actions.setLensInput(selectedLensInstanceId, {
      ...input,
      mode: "ref",
      pinned: true,
      ref: draftId ? { draftId } : undefined
    });
  };

  const handlePinChange = (event) => {
    if (!selectedLensInstanceId) return;
    const nextLensInstanceId = event.target.value;
    const draftId = nextLensInstanceId ? activeDraftIdByLensInstanceId[nextLensInstanceId] : undefined;
    actions.setLensInput(selectedLensInstanceId, {
      ...input,
      mode: "ref",
      pinned: true,
      ref: draftId ? { draftId } : undefined
    });
  };

  const canRemoveLens = Boolean(selectedLensInstanceId && placement);
  const handleRemoveLens = () => {
    if (!canRemoveLens) return;
    actions.removeLens(selectedLensInstanceId);
  };

  return (
    <section className="workspace-panel workspace-panel-lens">
      <div className="workspace-panel-header">Lens Inspector</div>
      <div className="workspace-panel-body">
        <div className="workspace-panel-actions">
          <button
            type="button"
            className="component-button is-ghost"
            onClick={handleRemoveLens}
            disabled={!canRemoveLens}
          >
            Remove lens
          </button>
        </div>
        {!selectedLensInstanceId || !instance ? (
          <div className="workspace-placeholder">No lens selected</div>
        ) : (
          <div>
            <div>{displayLabel || "Lens"}</div>
            <div className="hint">{instance.lensId || "Unknown lens"}</div>
            <div className="hint">{instance.lensInstanceId}</div>
            <div className="hint">{laneName ? `Lane: ${laneName}` : "Lane: Unknown"}</div>
            {upstreamLensInstanceIds.length ? (
              <div className="hint">Auto upstream: {upstreamLensInstanceIds.join(", ")}</div>
            ) : (
              <div className="hint">No upstream lens. Row {laneRow ?? "-"}.</div>
            )}
            <div className="hint">Input routing</div>
            <div>
              <label>
                <span className="hint">Mode</span>
                <select
                  className="component-field"
                  value={input && input.mode === "ref" ? "ref" : "auto"}
                  onChange={handleModeChange}
                >
                  <option value="auto">Auto (previous lens)</option>
                  <option value="ref">Pinned</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                <span className="hint">Pick upstream</span>
                <select
                  className="component-field"
                  value={pick}
                  onChange={(event) => patchInput({ pick: event.target.value })}
                >
                  <option value="active">Active draft</option>
                  <option value="selected">Selected drafts</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                <span className="hint">Packaging</span>
                <select
                  className="component-field"
                  value={packaging}
                  onChange={(event) => patchInput({ packaging: event.target.value })}
                >
                  <option value="single">Single draft</option>
                  <option value="packDrafts">Pack multiple drafts</option>
                </select>
              </label>
            </div>
            {input && input.mode === "ref" ? (
              <div>
                <label>
                  <span className="hint">Pinned to</span>
                  <select
                    className="component-field"
                    value={pinnedLensInstanceId || ""}
                    onChange={handlePinChange}
                  >
                    <option value="">Select upstream lens</option>
                    {upstreamLensInstanceIds.map((lensInstanceId) => (
                      <option key={lensInstanceId} value={lensInstanceId}>
                        {lensInstanceId}
                      </option>
                    ))}
                  </select>
                </label>
                {!upstreamLensInstanceIds.length ? (
                  <div className="hint">No upstream lenses in this lane.</div>
                ) : null}
              </div>
            ) : null}
            <div className="hint">Params (authoritative)</div>
            <AdvancedJsonEditor
              lensInstanceId={selectedLensInstanceId}
              params={instance.params || {}}
              onReplace={(nextParams) => actions.replaceLensParams(selectedLensInstanceId, nextParams)}
              derivedError={null}
            />
          </div>
        )}
      </div>
    </section>
  );
}
