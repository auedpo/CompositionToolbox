import React from "react";

import { useStore } from "../../state/store.js";
import {
  selectSelectedTrackId,
  selectTrackOrder,
  selectTracksById,
  selectLensInstanceIdsForTrack,
  selectLensInstancesById
} from "../../state/selectors.js";

export default function TrackInspector() {
  const trackOrder = useStore(selectTrackOrder);
  const tracksById = useStore(selectTracksById);
  const selectedTrackId = useStore(selectSelectedTrackId);
  const lensInstanceIds = useStore((state) => selectLensInstanceIdsForTrack(state, selectedTrackId));
  const lensInstancesById = useStore(selectLensInstancesById);
  const actions = useStore((state) => state.actions);

  return (
    <section className="workspace-panel workspace-panel-track">
      <div className="workspace-panel-header">Track Inspector</div>
      <div className="workspace-panel-body">
        <div>
          <button type="button" className="component-pill" onClick={() => actions.addTrack()}>
            + Lane
          </button>
        </div>
        {trackOrder.length === 0 ? (
          <div className="workspace-placeholder">No lanes yet.</div>
        ) : (
          <div>
            <div>Tracks</div>
            <ul>
              {trackOrder.map((trackId) => {
                const track = tracksById[trackId];
                if (!track) return null;
                const isSelected = trackId === selectedTrackId;
                return (
                  <li key={trackId}>
                    <button
                      type="button"
                      className={`component-pill${isSelected ? " is-focused" : ""}`}
                      onClick={() => actions.setSelection({ trackId, lensInstanceId: undefined })}
                    >
                      {track.name || trackId}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {selectedTrackId ? (
          <div>
            <div>Lens Instances</div>
            {lensInstanceIds.length === 0 ? (
              <div className="workspace-placeholder">No lenses in this lane.</div>
            ) : (
              <ul>
                {lensInstanceIds.map((lensInstanceId) => {
                  const instance = lensInstancesById[lensInstanceId];
                  const label = instance ? instance.lensId : lensInstanceId;
                  return (
                    <li key={lensInstanceId}>
                      <button
                        type="button"
                        className="component-pill"
                        onClick={() => actions.setSelection({ lensInstanceId })}
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
