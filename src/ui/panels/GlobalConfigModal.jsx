import React, { useEffect, useState } from "react";

import Modal from "../components/Modal.jsx";
import { useStore } from "../../state/store.js";
import { DEFAULT_BATCHING_LIMITS } from "../../state/schema.js";

const DEFAULT_PER_FRAME = DEFAULT_BATCHING_LIMITS.perFrameDraftCap;
const DEFAULT_MAX_PER_LENS_BATCH = DEFAULT_BATCHING_LIMITS.maxDraftsPerLensBatch;
const DEFAULT_MAX_RECOMPUTE = DEFAULT_BATCHING_LIMITS.maxDraftsPerRecompute;

function resolveNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export default function GlobalConfigModal({ onClose }) {
  const batching = useStore((state) => state.authoritative.config?.batching);
  const actions = useStore((state) => state.actions);
  const [perFrameDraftCapText, setPerFrameDraftCapText] = useState(String(DEFAULT_PER_FRAME));
  const [maxDraftsPerLensBatchText, setMaxDraftsPerLensBatchText] = useState(String(DEFAULT_MAX_PER_LENS_BATCH));
  const [maxDraftsPerRecomputeText, setMaxDraftsPerRecomputeText] = useState(String(DEFAULT_MAX_RECOMPUTE));
  const [errors, setErrors] = useState({ perFrame: "", maxBatch: "", maxRecompute: "" });

  useEffect(() => {
    const perFrameValue = resolveNumber(
      batching && batching.perFrameDraftCap,
      DEFAULT_PER_FRAME
    );
    const maxPerLensValue = resolveNumber(
      batching && batching.maxDraftsPerLensBatch,
      DEFAULT_MAX_PER_LENS_BATCH
    );
    const maxRecomputeValue = resolveNumber(
      batching && batching.maxDraftsPerRecompute,
      DEFAULT_MAX_RECOMPUTE
    );
    setPerFrameDraftCapText(String(perFrameValue));
    setMaxDraftsPerLensBatchText(String(maxPerLensValue));
    setMaxDraftsPerRecomputeText(String(maxRecomputeValue));
    setErrors({ perFrame: "", maxBatch: "", maxRecompute: "" });
  }, [batching]);

  const handleReset = () => {
    setPerFrameDraftCapText(String(DEFAULT_PER_FRAME));
    setMaxDraftsPerLensBatchText(String(DEFAULT_MAX_PER_LENS_BATCH));
    setMaxDraftsPerRecomputeText(String(DEFAULT_MAX_RECOMPUTE));
    setErrors({ perFrame: "", maxBatch: "", maxRecompute: "" });
  };

  const handleSave = () => {
    const parsedPerFrame = Number.parseInt(perFrameDraftCapText, 10);
    const parsedMaxBatch = Number.parseInt(maxDraftsPerLensBatchText, 10);
    const parsedMaxRecompute = Number.parseInt(maxDraftsPerRecomputeText, 10);
    const nextErrors = {};
    if (!Number.isInteger(parsedPerFrame) || parsedPerFrame <= 0) {
      nextErrors.perFrame = "Enter a positive whole number.";
    }
    if (!Number.isInteger(parsedMaxBatch) || parsedMaxBatch <= 0) {
      nextErrors.maxBatch = "Enter a positive whole number.";
    }
    if (!Number.isInteger(parsedMaxRecompute) || parsedMaxRecompute <= 0) {
      nextErrors.maxRecompute = "Enter a positive whole number.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    actions.setBatchingLimits({
      perFrameDraftCap: parsedPerFrame,
      maxDraftsPerLensBatch: parsedMaxBatch,
      maxDraftsPerRecompute: parsedMaxRecompute
    });
    onClose();
  };

  return (
    <Modal title="Global Config" onClose={onClose}>
      <section className="config-section">
        <div className="config-section-header">Batching</div>
        <div className="config-field">
          <label className="config-field-label" htmlFor="per-frame-draft-cap">
            Per-frame draft cap
          </label>
          <input
            id="per-frame-draft-cap"
            className="config-field-input"
            value={perFrameDraftCapText}
            onChange={(event) => {
              setPerFrameDraftCapText(event.target.value);
              if (errors.perFrame) {
                setErrors((prev) => ({ ...prev, perFrame: "" }));
              }
            }}
          />
          {errors.perFrame ? (
            <div className="config-field-error" role="alert">
              {errors.perFrame}
            </div>
          ) : null}
        </div>
        <div className="config-field">
          <label className="config-field-label" htmlFor="max-drafts-per-lens-batch">
            Max drafts per lens batch
          </label>
          <input
            id="max-drafts-per-lens-batch"
            className="config-field-input"
            value={maxDraftsPerLensBatchText}
            onChange={(event) => {
              setMaxDraftsPerLensBatchText(event.target.value);
              if (errors.maxBatch) {
                setErrors((prev) => ({ ...prev, maxBatch: "" }));
              }
            }}
          />
          {errors.maxBatch ? (
            <div className="config-field-error" role="alert">
              {errors.maxBatch}
            </div>
          ) : null}
        </div>
        <div className="config-field">
          <label className="config-field-label" htmlFor="max-drafts-per-recompute">
            Max drafts per recompute
          </label>
          <input
            id="max-drafts-per-recompute"
            className="config-field-input"
            value={maxDraftsPerRecomputeText}
            onChange={(event) => {
              setMaxDraftsPerRecomputeText(event.target.value);
              if (errors.maxRecompute) {
                setErrors((prev) => ({ ...prev, maxRecompute: "" }));
              }
            }}
          />
          {errors.maxRecompute ? (
            <div className="config-field-error" role="alert">
              {errors.maxRecompute}
            </div>
          ) : null}
        </div>
      </section>
      <section className="config-section config-section-placeholder">
        <div className="config-section-header">More global settings</div>
        <p className="config-section-placeholder-text">
          Additional panes can be added here as the config system grows.
        </p>
      </section>
      <div className="modal-footer">
        <button type="button" className="ghost" onClick={handleReset}>
          Reset defaults
        </button>
        <div className="modal-footer-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="component-pill" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
