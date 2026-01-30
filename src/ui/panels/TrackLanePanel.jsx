import React, { useMemo } from "react";

import { useStore } from "../../state/store.js";
import { useDraftSelectors } from "../hooks/useDraftSelectors.js";
import { useSelection } from "../hooks/useSelection.js";
import { useLensRegistry } from "../hooks/useLensRegistry.js";
import { useLensInstancesById, useTrackOrder, useTracksById } from "../hooks/useWorkspaceSelectors.js";
import LensPill from "../components/LensPill.jsx";

function buildLensNameMap(lensList) {
  const map = new Map();
  lensList.forEach((lens) => {
    map.set(lens.lensId, lens.name);
  });
  return map;
}

export default function TrackLanePanel() {
  const trackOrder = useTrackOrder();
  const tracksById = useTracksById();
  const lensInstancesById = useLensInstancesById();
  const { activeDraftIdByLensInstanceId, lastErrorByLensInstanceId } = useDraftSelectors();
  const { selection, selectLens, selectTrack } = useSelection();
  const actions = useStore((state) => state.actions);
  const lenses = useLensRegistry();
  const lensNameById = useMemo(() => buildLensNameMap(lenses), [lenses]);

  return (
    <section className="workspace-panel workspace-panel-track">
      <div className="workspace-panel-header">Lane overview</div>
      <div className="workspace-panel-body">
        <div>
          <button type="button" className="component-pill" onClick={() => actions.addTrack()}>
            + Lane
          </button>
        </div>
        {trackOrder.length === 0 ? (
          <div className="workspace-placeholder">No lanes yet.</div>
        ) : (
          <div className="track-lane-list">
            {trackOrder.map((trackId) => {
              const track = tracksById[trackId];
              if (!track) return null;
              const isTrackSelected = selection.trackId === trackId;
              const lensIds = Array.isArray(track.lensInstanceIds) ? track.lensInstanceIds : [];
              return (
                <div key={trackId} className="track-lane">
                  <div className="track-lane-header">
                    <button
                      type="button"
                      className={`component-pill${isTrackSelected ? " is-focused" : ""}`}
                      onClick={() => selectTrack(trackId)}
                    >
                      {track.name || trackId}
                    </button>
                    <button
                      type="button"
                      className="component-button is-ghost"
                      onClick={() => actions.removeLane(trackId)}
                    >
                      Remove lane
                    </button>
                  </div>
                  {lensIds.length ? (
                    <div className="track-lane-pills">
                      {lensIds.map((lensInstanceId) => {
                        const instance = lensInstancesById[lensInstanceId];
                        const label = instance
                          ? (lensNameById.get(instance.lensId) || instance.lensId)
                          : lensInstanceId;
                        const hasError = Boolean(lastErrorByLensInstanceId[lensInstanceId]);
                        const hasActiveDraft = Boolean(activeDraftIdByLensInstanceId[lensInstanceId]);
                        const isSelected = selection.lensInstanceId === lensInstanceId;
                        return (
                          <LensPill
                            key={lensInstanceId}
                            label={label}
                            hasError={hasError}
                            hasActiveDraft={hasActiveDraft}
                            isSelected={isSelected}
                            onSelect={() => selectLens(lensInstanceId, trackId)}
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
