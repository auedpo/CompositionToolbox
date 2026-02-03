import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";

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

function formatWarningDetails(details) {
  if (!details || typeof details !== "object") return null;
  const entries = Object.entries(details);
  if (!entries.length) return null;
  return entries
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
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
    selectedDraftId,
    lensOutputSelection,
    runtimeWarningsByLensInstanceId
  } = useDraftSelectors();
  const [showAll, setShowAll] = useState(true);

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
  const runtimeWarnings = selectedLensInstanceId
    ? (runtimeWarningsByLensInstanceId[selectedLensInstanceId] || [])
    : [];

  const selectedIndices = useMemo(() => {
    if (lensOutputSelection && Array.isArray(lensOutputSelection.selectedIndices)) {
      return lensOutputSelection.selectedIndices;
    }
    return [];
  }, [lensOutputSelection]);
  const selectedSet = useMemo(() => new Set(selectedIndices), [selectedIndices]);
  const draftCount = draftIds.length;

  const handleSelectionToggle = useCallback(
    (index) => {
      if (!selectedLensInstanceId || typeof index !== "number") return;
      const nextIndices = [...selectedIndices];
      const existingIndex = nextIndices.indexOf(index);
      if (existingIndex >= 0) {
        nextIndices.splice(existingIndex, 1);
      } else {
        nextIndices.push(index);
      }
      actions.setLensOutputSelection(selectedLensInstanceId, {
        mode: "selected",
        selectedIndices: nextIndices
      });
    },
    [actions, selectedIndices, selectedLensInstanceId]
  );

  const handleSelectAll = useCallback(() => {
    if (!selectedLensInstanceId || draftCount === 0) return;
    const allIndices = Array.from({ length: draftCount }, (_, idx) => idx);
    actions.setLensOutputSelection(selectedLensInstanceId, {
      mode: "selected",
      selectedIndices: allIndices
    });
  }, [actions, draftCount, selectedLensInstanceId]);

  const handleSelectNone = useCallback(() => {
    if (!selectedLensInstanceId) return;
    actions.setLensOutputSelection(selectedLensInstanceId, {
      mode: "selected",
      selectedIndices: []
    });
  }, [actions, selectedLensInstanceId]);

  const visibleDraftEntries = useMemo(() => {
    if (!showAll) {
      return focusedDraft ? [{ draft: focusedDraft, index: 0 }] : [];
    }
    return draftIds
      .map((draftId, orderIndex) => {
        const draft = draftsById[draftId];
        return draft ? { draft, index: orderIndex } : null;
      })
      .filter(Boolean);
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
            {showAll && selectedLensInstanceId ? (
              <div className="drafts-selection-actions">
                <button
                  type="button"
                  className="component-button"
                  disabled={!draftCount}
                  onClick={handleSelectAll}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="component-button"
                  disabled={!selectedIndices.length}
                  onClick={handleSelectNone}
                >
                  Select none
                </button>
              </div>
            ) : null}
            <div className="drafts-scroll" ref={scrollRef}>
              {runtimeWarnings.length ? (
                <div className="drafts-warning">
                  {runtimeWarnings.map((warning, idx) => {
                    const detailText = formatWarningDetails(warning.details);
                    return (
                      <div key={`${warning.kind}-${idx}`} className="drafts-warning-item">
                        <div className="drafts-warning-kind">{warning.kind}</div>
                        <div className="drafts-warning-message">{warning.message}</div>
                        <div className="drafts-warning-meta">
                          {warning.batchId ? (
                            <span className="drafts-warning-meta-item">Batch {warning.batchId}</span>
                          ) : null}
                          {detailText ? (
                            <span className="drafts-warning-details">{detailText}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {lensError ? (
                <div className="drafts-danger">{lensError}</div>
              ) : null}
              {visibleDraftEntries.length ? (
                <div className="drafts-items">
                  {visibleDraftEntries.map(({ draft, index }) => {
                    const isSelected = draft.draftId === focusedDraftId;
                    const checkboxChecked = selectedSet.has(index);
                    const handleCheckboxChange = (event) => {
                      event.stopPropagation();
                      handleSelectionToggle(index);
                    };
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
                        {showAll ? (
                          <div
                            className="draft-item-checkbox"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Select Draft ${index + 1}`}
                              checked={checkboxChecked}
                              onChange={handleCheckboxChange}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            />
                          </div>
                        ) : null}
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
