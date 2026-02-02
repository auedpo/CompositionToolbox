import React, { useMemo, useState, useEffect, useRef } from "react";

import { useStore } from "../../state/store.js";
import { useDraftSelectors } from "../hooks/useDraftSelectors.js";
import { useSelection } from "../hooks/useSelection.js";

function formatPreview(values) {
  if (values === undefined) return "-";
  try {
    const text = Array.isArray(values)
      ? values.map((value) => String(value)).join(", ")
      : String(values);
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
  const scrollRef = useRef(null);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [showAll, selectedLensInstanceId]);

  return (
    <section className="workspace-panel workspace-panel-drafts">
      <div className="workspace-panel-header">Drafts</div>
      <div className="workspace-panel-body drafts-list">
        {!selectedLensInstanceId ? (
          <div className="workspace-placeholder">Select a lens to view drafts.</div>
        ) : (
          <>
            <div className="drafts-header-bar">
              <div className="drafts-header-left">
                <div className="drafts-title">Lens Drafts</div>
                <div className="hint">
                  {draftIds.length ? `${draftIds.length} drafts` : "No drafts yet."}
                </div>
              </div>
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
            </div>
            <div className="drafts-scroll" ref={scrollRef}>
              {lensError ? (
                <div className="drafts-danger">{lensError}</div>
              ) : null}
              {visibleDrafts.length ? (
                <div className="drafts-items">
                  {visibleDrafts.map((draft, index) => {
                    const isSelected = draft.draftId === focusedDraftId;
                    return (
                      <div
                        key={draft.draftId}
                        className={`draft-item${isSelected ? " active" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        onClick={() => selectDraft(draft.draftId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectDraft(draft.draftId);
                          }
                        }}
                      >
                        <div className="draft-item-left">
                          <div className="draft-label">
                            <span>Draft {index + 1}</span>
                            <span className="hint">{draft.type}</span>
                          </div>
                          <div className="draft-desc">
                            {draft.summary || draft.draftId}
                          </div>
                          <div className="hint">{draft.draftId}</div>
                        </div>
                        <div className="draft-item-right">
                          <div className="draft-preview">
                            {formatPreview(draft.payload && draft.payload.values)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                lensError ? null : <div className="drafts-empty">No drafts yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
