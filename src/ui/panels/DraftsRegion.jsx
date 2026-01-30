import React, { useMemo, useState } from "react";

import { useStore } from "../../state/store.js";
import { useDraftSelectors } from "../hooks/useDraftSelectors.js";
import { useSelection } from "../hooks/useSelection.js";

function formatPreview(values) {
  if (values === undefined) return "-";
  try {
    const text = JSON.stringify(values, null, 2);
    return text.length > 320 ? `${text.slice(0, 320)}...` : text;
  } catch (error) {
    return "Unserializable payload.";
  }
}

export default function DraftsPanel() {
  const actions = useStore((state) => state.actions);
  const { selectDraft } = useSelection();
  const {
    draftsById,
    draftOrderByLensInstanceId,
    activeDraftIdByLensInstanceId,
    lastErrorByLensInstanceId,
    selectedLensInstanceId,
    selectedDraftId
  } = useDraftSelectors();
  const [showAll, setShowAll] = useState(false);

  const draftIds = selectedLensInstanceId
    ? (draftOrderByLensInstanceId[selectedLensInstanceId] || [])
    : [];
  const activeDraftId = selectedLensInstanceId
    ? activeDraftIdByLensInstanceId[selectedLensInstanceId]
    : null;
  const lensError = selectedLensInstanceId
    ? lastErrorByLensInstanceId[selectedLensInstanceId]
    : null;

  const focusedDraftId = selectedDraftId || activeDraftId || null;
  const focusedDraft = focusedDraftId ? draftsById[focusedDraftId] : null;

  const visibleDrafts = useMemo(() => {
    if (!showAll) {
      return focusedDraft ? [focusedDraft] : [];
    }
    return draftIds.map((draftId) => draftsById[draftId]).filter(Boolean);
  }, [draftIds, draftsById, focusedDraft, showAll]);

  const handlePromoteInventory = () => {
    if (!focusedDraftId) return;
    actions.promoteDraftToInventory(focusedDraftId);
  };

  const handlePlaceDesk = () => {
    if (!focusedDraftId) return;
    actions.placeDraftOnDesk(focusedDraftId, {});
  };

  return (
    <section className="workspace-panel workspace-panel-drafts">
      <div className="workspace-panel-header">Drafts</div>
      <div className="workspace-panel-body drafts-list">
        {!selectedLensInstanceId ? (
          <div className="workspace-placeholder">Select a lens to view drafts.</div>
        ) : (
          <>
            <div className="drafts-header">
              <div className="drafts-title">Lens Drafts</div>
              <div className="hint">
                {draftIds.length ? `${draftIds.length} drafts` : "No drafts yet."}
              </div>
            </div>
            {lensError ? (
              <div className="drafts-empty">{lensError}</div>
            ) : null}
            <div className="draft-actions">
              <button
                type="button"
                className="component-button"
                onClick={() => setShowAll((prev) => !prev)}
              >
                {showAll ? "Show Active Only" : "Show All Drafts"}
              </button>
              <button
                type="button"
                className="component-button"
                disabled={!focusedDraftId}
                onClick={handlePromoteInventory}
              >
                Promote to Inventory
              </button>
              <button
                type="button"
                className="component-button"
                disabled={!focusedDraftId}
                onClick={handlePlaceDesk}
              >
                Place on Desk
              </button>
            </div>
            {visibleDrafts.length ? (
              <div className="drafts-items">
                {visibleDrafts.map((draft, index) => {
                  const isSelected = draft.draftId === focusedDraftId;
                  return (
                    <div
                      key={draft.draftId}
                      className={`draft-item${isSelected ? " active" : ""}`}
                      onClick={() => selectDraft(draft.draftId)}
                    >
                      <div className="draft-left">
                        <div className="draft-label">
                          <span>Draft {index + 1}</span>
                          <span className="hint">{draft.type}</span>
                        </div>
                        <div className="draft-desc">
                          {draft.summary || draft.draftId}
                        </div>
                        <div className="hint">{draft.draftId}</div>
                        <textarea
                          className="component-field"
                          value={formatPreview(draft.payload && draft.payload.values)}
                          readOnly
                          rows={4}
                        />
                      </div>
                    </div>
                  );
                })}
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
