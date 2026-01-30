import React, { useMemo } from "react";

import { getLens } from "../../lenses/lensRegistry.js";
import { useStore } from "../../state/store.js";
import { selectSelectedLensInstanceId } from "../../state/selectors.js";
import { useDraftSelectors } from "../hooks/useDraftSelectors.js";
import { useLensInstancesById, useTrackOrder, useTracksById } from "../hooks/useWorkspaceSelectors.js";
import AdvancedJsonEditor from "../params/AdvancedJsonEditor.jsx";

function findTrackForLens(trackOrder, tracksById, lensInstanceId) {
  for (let i = 0; i < trackOrder.length; i += 1) {
    const trackId = trackOrder[i];
    const track = tracksById[trackId];
    if (!track || !Array.isArray(track.lensInstanceIds)) continue;
    const index = track.lensInstanceIds.indexOf(lensInstanceId);
    if (index >= 0) {
      return { trackId, track, index };
    }
  }
  return null;
}

export default function LensInspector() {
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const lensInstancesById = useLensInstancesById();
  const trackOrder = useTrackOrder();
  const tracksById = useTracksById();
  const { activeDraftIdByLensInstanceId } = useDraftSelectors();
  const actions = useStore((state) => state.actions);

  const instance = selectedLensInstanceId ? lensInstancesById[selectedLensInstanceId] : null;
  const lensDef = useMemo(() => (instance ? getLens(instance.lensId) : null), [instance]);
  const displayLabel = instance
    ? (lensDef && lensDef.meta ? lensDef.meta.name : null) || instance.lensId || instance.lensInstanceId
    : "";
  const input = instance && instance.input ? instance.input : { mode: "auto", pinned: false };

  const trackInfo = useMemo(() => {
    if (!selectedLensInstanceId) return null;
    return findTrackForLens(trackOrder, tracksById, selectedLensInstanceId);
  }, [selectedLensInstanceId, trackOrder, tracksById]);

  const upstreamLensInstanceIds = useMemo(() => {
    if (!trackInfo) return [];
    return trackInfo.track.lensInstanceIds.slice(0, trackInfo.index);
  }, [trackInfo]);

  const pinnedDraftId = input && input.mode === "ref"
    ? (typeof input.ref === "string" ? input.ref : (input.ref && input.ref.draftId))
    : null;

  const pinnedLensInstanceId = pinnedDraftId
    ? Object.keys(activeDraftIdByLensInstanceId)
      .find((lensInstanceId) => activeDraftIdByLensInstanceId[lensInstanceId] === pinnedDraftId)
    : "";

  const handleModeChange = (event) => {
    if (!selectedLensInstanceId) return;
    const mode = event.target.value;
    if (mode === "auto") {
      actions.setLensInput(selectedLensInstanceId, { mode: "auto", pinned: false });
      return;
    }
    const fallbackLens = upstreamLensInstanceIds[0];
    const draftId = fallbackLens ? activeDraftIdByLensInstanceId[fallbackLens] : undefined;
    actions.setLensInput(selectedLensInstanceId, {
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
      mode: "ref",
      pinned: true,
      ref: draftId ? { draftId } : undefined
    });
  };

  const canRemoveLens = Boolean(selectedLensInstanceId && trackInfo);

  const handleRemoveLens = () => {
    if (!canRemoveLens) return;
    actions.removeLensInstance(trackInfo.trackId, selectedLensInstanceId);
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
