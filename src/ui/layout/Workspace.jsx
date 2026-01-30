import React from "react";

import {
  DraftsPanel,
  LensBrowserPanel,
  LensInspectorPanel,
  ModularGrid,
  ParamsPanel,
  TrackLanePanel,
  VisualizerPanel
} from "../panels/index.js";

export default function Workspace() {
  return (
    <>
      <div className="workspace-column workspace-column-left">
        <LensInspectorPanel />
        <TrackLanePanel />
      </div>
      <div className="workspace-column workspace-column-center">
        <div className="workspace-center-top-split">
          <ParamsPanel />
          <VisualizerPanel />
        </div>
        <DraftsPanel />
      </div>
      <div className="workspace-column workspace-column-right">
        <LensBrowserPanel />
        <ModularGrid />
      </div>
    </>
  );
}
