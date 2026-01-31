import React, { useEffect, useState } from "react";

import {
  exportProjectJson,
  importProjectJson,
  loadProjectFromLocal,
  saveProjectToLocal
} from "../../persist/persistence.js";

const STATUS_MESSAGES = {
  saved: "Project saved locally.",
  loaded: "Project state loaded.",
  imported: "Project imported.",
  missing: "No persisted project was found.",
  error: "Persistence operation failed."
};

export default function PersistenceControls() {
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState(null);
  const [textareaValue, setTextareaValue] = useState("");

  useEffect(() => {
    let mounted = true;
    const loaded = loadProjectFromLocal();
    if (loaded && mounted) {
      setStatus(STATUS_MESSAGES.loaded);
    }
    return () => {
      mounted = false;
    };
  }, []);

  function handleSave() {
    const result = saveProjectToLocal();
    setStatus(result ? STATUS_MESSAGES.saved : STATUS_MESSAGES.error);
  }

  function handleLoad() {
    const result = loadProjectFromLocal();
    setStatus(result ? STATUS_MESSAGES.loaded : STATUS_MESSAGES.missing);
  }

  function handleExport() {
    setTextareaValue(exportProjectJson());
    setDialog("export");
  }

  function handleImport() {
    setTextareaValue("");
    setDialog("import");
  }

  function handleImportConfirm() {
    try {
      importProjectJson(textareaValue || "");
      setStatus(STATUS_MESSAGES.imported);
      setDialog(null);
    } catch (error) {
      setStatus(error && error.message ? error.message : STATUS_MESSAGES.error);
    }
  }

  function handleCloseDialog() {
    setDialog(null);
  }

  return (
    <>
      <div className="workspace-persistence-controls">
        <button type="button" className="ghost workspace-persistence-btn" onClick={handleSave}>
          Save
        </button>
        <button type="button" className="ghost workspace-persistence-btn" onClick={handleLoad}>
          Load
        </button>
        <button type="button" className="ghost workspace-persistence-btn" onClick={handleExport}>
          Export JSON
        </button>
        <button type="button" className="ghost workspace-persistence-btn" onClick={handleImport}>
          Import JSON
        </button>
        {status ? <span className="workspace-persistence-status">{status}</span> : null}
      </div>
      {dialog ? (
        <div className="workspace-persistence-dialog" role="dialog" aria-modal="true">
          <div className="workspace-persistence-dialog-content">
            <h3>{dialog === "export" ? "Export Project JSON" : "Import Project JSON"}</h3>
            <textarea
              aria-label={dialog === "export" ? "Exported project JSON" : "Import project JSON"}
              value={textareaValue}
              onChange={(event) => setTextareaValue(event.target.value)}
              readOnly={dialog === "export"}
            />
            <div className="workspace-persistence-dialog-buttons">
              {dialog === "import" ? (
                <button type="button" onClick={handleImportConfirm}>
                  Import
                </button>
              ) : null}
              <button type="button" onClick={handleCloseDialog}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
