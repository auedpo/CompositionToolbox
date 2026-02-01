import React, { useEffect, useState } from "react";

import { useStore } from "../../state/store.js";
import {
  selectActiveDraftForLensInstance,
  selectSelectedLensError,
  selectSelectedLensInstanceId,
  selectSelectedLensInstanceLensId,
  selectSelectedLensVizModel,
  selectVisualizerInstanceOverride,
  selectVisualizerTypeDefault
} from "../../state/selectors.js";
import {
  TEXT_PREVIEW_ENTRY,
  TEXT_PREVIEW_KEY,
  VISUALIZER_REGISTRY
} from "../visualizers/visualizerRegistry.js";

const VISUALIZER_SCOPE_OPTIONS = [
  { value: "instance", label: "This lens instance" },
  { value: "type", label: "All lenses of this type" }
];

export default function VisualizerPanel() {
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const lensId = useStore(selectSelectedLensInstanceLensId);
  const lensError = useStore(selectSelectedLensError);
  const activeDraft = useStore((state) =>
    selectActiveDraftForLensInstance(state, selectedLensInstanceId)
  );
  const vizModel = useStore(selectSelectedLensVizModel);
  const instanceOverrideKey = useStore((state) =>
    selectVisualizerInstanceOverride(state, selectedLensInstanceId)
  );
  const typeDefaultKey = useStore((state) => selectVisualizerTypeDefault(state, lensId));
  const actions = useStore((state) => state.actions);

  const [scope, setScope] = useState("instance");

  useEffect(() => {
    setScope("instance");
  }, [selectedLensInstanceId]);

  if (!selectedLensInstanceId) {
    return (
      <section className="workspace-panel workspace-visualizer-panel">
        <div className="workspace-panel-header">Visualizer</div>
        <div className="workspace-panel-body">
          <div className="workspace-placeholder">No lens selected</div>
        </div>
      </section>
    );
  }

  const lensEntry = lensId ? VISUALIZER_REGISTRY[lensId] : null;
  const lensOptions = lensEntry ? lensEntry.options || {} : {};
  const registryDefaultKey = lensEntry ? lensEntry.defaultKey : undefined;
  const chosenKey = instanceOverrideKey || typeDefaultKey || registryDefaultKey || TEXT_PREVIEW_KEY;
  const entry =
    lensOptions[chosenKey] ||
    (chosenKey === TEXT_PREVIEW_KEY ? TEXT_PREVIEW_ENTRY : null) ||
    lensOptions[registryDefaultKey] ||
    TEXT_PREVIEW_ENTRY;
  const VizComponent = entry && entry.component ? entry.component : null;

  const handleVisualizerChange = (event) => {
    const newKey = event.target.value;
    if (scope === "instance") {
      actions.setInstanceOverrideVisualizer(selectedLensInstanceId, newKey);
    } else {
      actions.setTypeDefaultVisualizer(lensId, newKey);
    }
  };

  const handleScopeChange = (event) => {
    setScope(event.target.value);
  };

  const requires = entry && entry.requires ? entry.requires : {};
  let placeholderMessage = null;
  if (requires.draft && !activeDraft) {
    placeholderMessage = "Need an active draft to preview this visualization.";
  }
  const vizKindRequirement = requires.vizModelKind;
  if (!placeholderMessage && vizKindRequirement) {
    const availableKinds = Array.isArray(vizKindRequirement)
      ? vizKindRequirement
      : [vizKindRequirement];
    if (!vizModel) {
      placeholderMessage = "No visualization data available.";
    } else if (!availableKinds.includes(vizModel.kind)) {
      placeholderMessage = "Visualization data kind mismatch.";
    }
  }

  const unavailable = placeholderMessage ? (
    <div className="workspace-placeholder">{placeholderMessage}</div>
  ) : VizComponent ? (
    <VizComponent draft={activeDraft} vizModel={vizModel} />
  ) : (
    <div className="workspace-placeholder">Visualizer unavailable.</div>
  );

  const dropdownOptions = [
    ...Object.entries(lensOptions).map(([key, option]) => (
      <option key={`viz-${key}`} value={key}>
        {option.label}
      </option>
    )),
    <option key={`viz-${TEXT_PREVIEW_KEY}`} value={TEXT_PREVIEW_KEY}>
      {TEXT_PREVIEW_ENTRY.label}
    </option>
  ];

  const TextPreviewComponent = TEXT_PREVIEW_ENTRY.component;

  return (
    <section className="workspace-panel workspace-visualizer-panel">
      <div className="workspace-panel-header">Visualizer</div>
      <div className="workspace-panel-body">
        <div>
          <div className="hint">{lensId || "Unknown lens"}</div>
          <div className="hint">{selectedLensInstanceId}</div>
          <div className="visualizer-controls">
            <label htmlFor="visualizer-select">
              <span>Visualization</span>
              <select
                id="visualizer-select"
                value={chosenKey}
                onChange={handleVisualizerChange}
              >
                {dropdownOptions}
              </select>
            </label>
            <label htmlFor="visualizer-scope-select">
              <span>Scope</span>
              <select
                id="visualizer-scope-select"
                value={scope}
                onChange={handleScopeChange}
              >
                {VISUALIZER_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {lensError ? (
            <>
              <div className="workspace-panel-error">Error: {lensError}</div>
              <TextPreviewComponent draft={activeDraft} />
            </>
          ) : (
            unavailable
          )}
        </div>
      </div>
    </section>
  );
}
