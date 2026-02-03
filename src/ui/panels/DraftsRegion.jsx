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

const TRUNCATION_WARNING_KINDS = new Set([
  "truncatedFrames",
  "truncatedBatchOutputs",
  "truncatedFrameOutputs",
  "truncatedRecomputeOutputs"
]);

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
    runtimeWarningsByLensInstanceId,
    draftIdsByBatchFrame,
    batchSummaryByBatchId
  } = useDraftSelectors();
  const [showAll, setShowAll] = useState(true);
  const [showAllFrames, setShowAllFrames] = useState(false);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);

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
  const listScrollRef = useRef(null);
  const runtimeWarnings = selectedLensInstanceId
    ? (runtimeWarningsByLensInstanceId[selectedLensInstanceId] || [])
    : [];

  const draftIndexById = useMemo(() => {
    const map = {};
    draftIds.forEach((draftId, orderIndex) => {
      if (typeof draftId === "string") {
        map[draftId] = orderIndex;
      }
    });
    return map;
  }, [draftIds]);

  const batchInfo = useMemo(() => {
    let activeBatchId = null;
    let hasMultipleBatches = false;
    for (const draftId of draftIds) {
      const draft = draftsById[draftId];
      if (!draft) continue;
      const batchId = draft.meta && draft.meta.batch && draft.meta.batch.batchId;
      if (!batchId) continue;
      if (!activeBatchId) {
        activeBatchId = batchId;
      } else if (batchId !== activeBatchId) {
        hasMultipleBatches = true;
        break;
      }
    }
    return { activeBatchId, hasMultipleBatches };
  }, [draftIds, draftsById]);

  const { activeBatchId, hasMultipleBatches } = batchInfo;

  const framesMap = useMemo(() => {
    if (!activeBatchId) return {};
    return draftIdsByBatchFrame[activeBatchId] || {};
  }, [activeBatchId, draftIdsByBatchFrame]);

  const frameIndices = useMemo(() => {
    const keys = Object.keys(framesMap || {});
    return keys
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
  }, [framesMap]);

  const batchSummary = activeBatchId
    ? (batchSummaryByBatchId[activeBatchId] || null)
    : null;

  const frameCount = Number.isFinite(batchSummary && batchSummary.frames)
    ? batchSummary.frames
    : frameIndices.length;
  const outputCount = Number.isFinite(batchSummary && batchSummary.outputs)
    ? batchSummary.outputs
    : frameIndices.reduce(
        (sum, frameIndex) => sum + ((framesMap[frameIndex] && framesMap[frameIndex].length) || 0),
        0
      );

  const hasRuntimeTruncationWarning = runtimeWarnings.some(
    (warning) => warning && TRUNCATION_WARNING_KINDS.has(warning.kind)
  );
  const showTruncationBadge = Boolean(
    (batchSummary && batchSummary.truncated) || hasRuntimeTruncationWarning
  );

  const frameAnchorRefs = useRef(new Map());
  const frameHeaderRefs = useRef(new Map());

  const setFrameAnchor = useCallback(
    (frameIndex) => (element) => {
      const anchors = frameAnchorRefs.current;
      if (element) {
        anchors.set(frameIndex, element);
      } else {
        anchors.delete(frameIndex);
      }
    },
    []
  );

  const setFrameHeaderRef = useCallback(
    (frameIndex) => (element) => {
      const headers = frameHeaderRefs.current;
      if (element) {
        headers.set(frameIndex, element);
      } else {
        headers.delete(frameIndex);
      }
    },
    []
  );

  const highlightFrameHeader = useCallback((frameIndex) => {
    const header = frameHeaderRefs.current.get(frameIndex);
    if (!header) return;
    header.classList.remove("frame-highlight");
    void header.offsetWidth;
    header.classList.add("frame-highlight");
  }, []);

  const scrollToFrame = useCallback(
    (frameIndex) => {
      const scroller = listScrollRef.current;
      const anchor = frameAnchorRefs.current.get(frameIndex);
      if (!scroller || !anchor) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const delta = anchorRect.top - scrollerRect.top;
      const TOP_PAD = 8;
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + delta - TOP_PAD),
        behavior: "auto"
      });
    },
    []
  );

  useEffect(() => {
    frameAnchorRefs.current.clear();
    frameHeaderRefs.current.clear();
  }, [activeBatchId, frameIndices.length]);

  useEffect(() => {
    if (showAllFrames) {
      window.requestAnimationFrame(() => {
        scrollToFrame(selectedFrameIndex);
      });
    }
  }, [scrollToFrame, selectedFrameIndex, showAllFrames]);

  const batchFrameGroups = useMemo(() => {
    return frameIndices.map((frameIndex) => {
      const ids = Array.isArray(framesMap[frameIndex]) ? framesMap[frameIndex] : [];
      const entries = ids
        .map((draftId) => {
          const draft = draftsById[draftId];
          const orderIndex = draftIndexById[draftId];
          return draft && typeof orderIndex === "number"
            ? { draft, index: orderIndex }
            : null;
        })
        .filter(Boolean);
      return { frameIndex, entries };
    });
  }, [frameIndices, framesMap, draftsById, draftIndexById]);

  const selectedFrameEntries = useMemo(() => {
    const ids = Array.isArray(framesMap[selectedFrameIndex])
      ? framesMap[selectedFrameIndex]
      : [];
    return ids
      .map((draftId) => {
        const draft = draftsById[draftId];
        const orderIndex = draftIndexById[draftId];
        return draft && typeof orderIndex === "number"
          ? { draft, index: orderIndex }
          : null;
      })
      .filter(Boolean);
  }, [framesMap, draftsById, draftIndexById, selectedFrameIndex]);

  const batchHasOutputs = outputCount > 0;
  const isBatchMode = Boolean(activeBatchId && showAll);
  const showSelectionControls = showAll && (!isBatchMode || showAllFrames);
  const canShowSelectionActions = showSelectionControls && Boolean(selectedLensInstanceId);

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

  const nonBatchVisibleEntries = useMemo(() => {
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
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
  }, [showAll, selectedLensInstanceId]);

  useEffect(() => {
    setShowAllFrames(false);
  }, [activeBatchId]);

  useEffect(() => {
    if (!activeBatchId) {
      setSelectedFrameIndex(0);
      return;
    }
    if (!frameIndices.length) {
      setSelectedFrameIndex(0);
      return;
    }
    setSelectedFrameIndex((prev) => (
      frameIndices.includes(prev) ? prev : frameIndices[0]
    ));
  }, [activeBatchId, frameIndices]);

  const handleFrameTabClick = useCallback(
    (frameIndex) => {
      setSelectedFrameIndex(frameIndex);
      if (showAllFrames) {
        scrollToFrame(frameIndex);
        highlightFrameHeader(frameIndex);
      }
    },
    [highlightFrameHeader, scrollToFrame, showAllFrames]
  );

  const renderDraftRow = useCallback(
    ({ draft, index }) => {
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
          {showSelectionControls ? (
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
    },
    [focusedDraftId, handleSelectionToggle, selectDraft, selectedSet, showSelectionControls]
  );

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
            {isBatchMode ? (
              <div className="drafts-batch-section">
                <div className="drafts-batch-header">
                  <div>
                    <div className="drafts-batch-title">Batch</div>
                    <div className="drafts-batch-subtitle">
                      <span>Frames: {frameCount}</span>
                      <span>Outputs: {outputCount}</span>
                      {showTruncationBadge ? (
                        <span className="drafts-batch-truncated">Truncated</span>
                      ) : null}
                    </div>
                    <div className="hint drafts-batch-id">Batch {activeBatchId}</div>
                  </div>
                  <div className="drafts-batch-actions">
                    <button
                      type="button"
                      className="component-button"
                      disabled={!frameIndices.length}
                      onClick={() => setShowAllFrames((prev) => !prev)}
                    >
                      {showAllFrames ? "Show one frame" : "Show all frames"}
                    </button>
                  </div>
                </div>
                <div className="drafts-batch-tabs">
                  {frameIndices.length ? (
                    frameIndices.map((frameIndex) => {
                      const entries = Array.isArray(framesMap[frameIndex])
                        ? framesMap[frameIndex]
                        : [];
                      return (
                        <button
                          key={`frame-${frameIndex}`}
                          type="button"
                          className={`drafts-batch-tab${frameIndex === selectedFrameIndex ? " selected" : ""}`}
                          onClick={() => handleFrameTabClick(frameIndex)}
                        >
                          Frame {frameIndex} ({entries.length})
                        </button>
                      );
                    })
                  ) : (
                    <div className="drafts-batch-tab drafts-batch-tab-empty">
                      No frames yet.
                    </div>
                  )}
                </div>
                {hasMultipleBatches ? (
                  <div className="drafts-batch-warning">
                    Multiple batches detected; showing {activeBatchId}.
                  </div>
                ) : null}
              </div>
            ) : null}
            {canShowSelectionActions ? (
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
            <div className="drafts-scroll" ref={listScrollRef}>
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
              {isBatchMode ? (
                lensError ? null : (
                  <div className="drafts-items">
                    {!batchHasOutputs ? (
                      <div className="drafts-empty">Batch has no outputs.</div>
                    ) : showAllFrames ? (
                      batchFrameGroups.map((group) => (
                        <div
                          key={`frame-group-${group.frameIndex}`}
                          className="drafts-batch-frame-group"
                        >
                          <div
                            ref={setFrameAnchor(group.frameIndex)}
                            className="drafts-frame-anchor"
                            aria-hidden="true"
                          />
                          <div
                            ref={setFrameHeaderRef(group.frameIndex)}
                            className="drafts-frame-header"
                            data-frame-index={group.frameIndex}
                          >
                            Frame {group.frameIndex} ({group.entries.length})
                          </div>
                          {group.entries.length ? (
                            group.entries.map(renderDraftRow)
                          ) : (
                            <div className="drafts-batch-frame-empty">
                              No outputs for this frame.
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      selectedFrameEntries.length ? (
                        selectedFrameEntries.map(renderDraftRow)
                      ) : (
                        <div className="drafts-empty">
                          {frameIndices.length
                            ? `No drafts in frame ${selectedFrameIndex}.`
                            : "Batch has no outputs."}
                        </div>
                      )
                    )}
                  </div>
                )
              ) : (
                nonBatchVisibleEntries.length ? (
                  <div className="drafts-items">
                    {nonBatchVisibleEntries.map(renderDraftRow)}
                  </div>
                ) : (
                  lensError ? null : <div className="drafts-empty">No drafts yet.</div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
