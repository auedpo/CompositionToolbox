import React from "react";

import { useStore } from "../../state/store.js";
import { selectSelectedLensInstance } from "../../state/selectors.js";
import { getLens } from "../../lenses/lensRegistry.js";

export default function LensInspector() {
  const lensInstance = useStore(selectSelectedLensInstance);
  const lensMeta = lensInstance ? getLens(lensInstance.lensId) : null;

  return (
    <section className="workspace-panel workspace-panel-lens">
      <div className="workspace-panel-header">Lens Inspector</div>
      <div className="workspace-panel-body">
        {!lensInstance ? (
          <div className="workspace-placeholder">Select a lens.</div>
        ) : (
          <div>
            <div>
              {lensMeta ? lensMeta.meta.name : lensInstance.lensId}
            </div>
            <pre>{JSON.stringify(lensInstance.params || {}, null, 2)}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
