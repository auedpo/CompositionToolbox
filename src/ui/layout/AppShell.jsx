import React from "react";

import Workspace from "./Workspace.jsx";

export default function AppShell() {
  return (
    <div className="workspace-root">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <div className="workspace-header-title">Workspace</div>
        </div>
        <div className="workspace-header-right">
          <button type="button" className="ghost workspace-config-btn" disabled>
            Config Menu >
          </button>
        </div>
      </header>
      <main className="workspace-body">
        <Workspace />
      </main>
      <footer className="workspace-footer">
        <div className="workspace-view-switch">View: Workspace</div>
        <div className="workspace-help">Hover/help (Phase 8).</div>
      </footer>
    </div>
  );
}
