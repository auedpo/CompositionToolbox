import React from "react";

import LensInspector from "../panels/LensInspector.jsx";
import TrackInspector from "../panels/TrackInspector.jsx";
import ParamsPanel from "../panels/ParamsPanel.jsx";
import VisualizerPanel from "../panels/VisualizerPanel.jsx";
import DraftsRegion from "../panels/DraftsRegion.jsx";
import LensBrowser from "../panels/LensBrowser.jsx";
import ModularGrid from "../panels/ModularGrid.jsx";

export default function Workspace() {
  return (
    <>
      <div className="workspace-column workspace-column-left">
        <LensInspector />
        <TrackInspector />
      </div>
      <div className="workspace-column workspace-column-center">
        <div className="workspace-center-top-split">
          <ParamsPanel />
          <VisualizerPanel />
        </div>
        <DraftsRegion />
      </div>
      <div className="workspace-column workspace-column-right">
        <LensBrowser />
        <ModularGrid />
      </div>
    </>
  );
}
