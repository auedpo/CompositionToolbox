import React from "react";

import { useStore } from "../../state/store.js";
import {
  selectActiveDraftIdByLensInstanceId,
  selectDraftOrderByLensInstanceId,
  selectDraftsById,
  selectLastErrorByLensInstanceId,
  selectSelectedLensInstanceId
} from "../../state/selectors.js";

export default function DraftsRegion() {
  const selectedLensId = useStore(selectSelectedLensInstanceId);
  const draftsById = useStore(selectDraftsById);
  const draftOrderByLensInstanceId = useStore(selectDraftOrderByLensInstanceId);
  const activeDraftIdByLensInstanceId = useStore(selectActiveDraftIdByLensInstanceId);
  const lastErrorByLensInstanceId = useStore(selectLastErrorByLensInstanceId);

  const draftIds = selectedLensId ? (draftOrderByLensInstanceId[selectedLensId] ?? []) : [];
  const drafts = draftIds.map((draftId) => draftsById[draftId]).filter(Boolean);
  const activeDraftId = selectedLensId ? activeDraftIdByLensInstanceId[selectedLensId] : null;
  const lensError = selectedLensId ? lastErrorByLensInstanceId[selectedLensId] : null;

  console.log(
    "[DRAFTS PANEL]",
    {
      selectedLensId,
      draftIds
    }
  );

  return (
    <section className="workspace-panel workspace-panel-drafts">
      <div className="workspace-panel-header">Drafts</div>
      <div className="workspace-panel-body drafts-list">
        {!selectedLensId ? (
          <div className="workspace-placeholder">Select a lens to view drafts.</div>
        ) : (
          <>
            <div className="drafts-header">
              <div className="drafts-title">Lens Drafts</div>
              <div className="hint">{drafts.length ? `${drafts.length} drafts` : "No drafts yet."}</div>
            </div>
            {lensError ? (
              <div className="drafts-empty">{lensError}</div>
            ) : null}
            {drafts.length ? (
              <div className="drafts-items">
                {drafts.map((draft, index) => (
                  <div
                    key={draft.draftId}
                    className={`draft-item${draft.draftId === activeDraftId ? " active" : ""}`}
                  >
                    <div className="draft-left">
                      <div className="draft-label">
                        <span>Draft {index + 1}</span>
                        <span className="hint">{draft.type}</span>
                      </div>
                      <div className="draft-desc">
                        {draft.summary || draft.draftId}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="drafts-empty">No drafts yet.</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
