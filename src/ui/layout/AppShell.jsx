import React from "react";

import Workspace from "./Workspace.jsx";
import InventoryView from "./InventoryView.jsx";
import DeskView from "./DeskView.jsx";
import PersistenceControls from "../components/PersistenceControls.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useStore } from "../../state/store.js";

const VIEW_OPTIONS = [
  { id: "workspace", label: "Workspace" },
  { id: "inventory", label: "Inventory" },
  { id: "desk", label: "Desk" }
];

const getViewTitle = (view) => {
  const option = VIEW_OPTIONS.find((entry) => entry.id === view);
  return option ? option.label : "Workspace";
};

export default function AppShell() {
  const view = useStore((state) => state.authoritative.selection?.view || "workspace");
  const actions = useStore((state) => state.actions);
  const viewTitle = getViewTitle(view);
  const mainContent = view === "inventory" ? (
    <InventoryView />
  ) : view === "desk" ? (
    <DeskView />
  ) : (
    <Workspace />
  );

  return (
    <div className="workspace-root">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <div className="workspace-header-title">{viewTitle}</div>
        </div>
        <div className="workspace-header-right">
          <PersistenceControls />
          <ThemeToggle />
          <button type="button" className="ghost workspace-config-btn" disabled>
            Config Menu &gt;
          </button>
        </div>
      </header>
      <main className="workspace-body">{mainContent}</main>
      <footer className="workspace-footer">
        <div className="workspace-view-switch">
          {VIEW_OPTIONS.map((option) => {
            const isActive = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`component-pill${isActive ? " is-focused" : ""}`}
                aria-pressed={isActive}
                onClick={() => actions.setActiveView(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="workspace-help">Hover/help (Phase 8).</div>
      </footer>
    </div>
  );
}
