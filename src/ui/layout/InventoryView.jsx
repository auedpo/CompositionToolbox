import React from "react";

import { useStore } from "../../state/store.js";

export default function InventoryView() {
  const itemOrder = useStore((state) => state.authoritative.inventory.itemOrder || []);
  const itemsById = useStore((state) => state.authoritative.inventory.itemsById || {});

  return (
    <>
      <div className="workspace-column workspace-column-left">
        <section className="workspace-panel">
          <div className="workspace-panel-header">Inventory</div>
          <div className="workspace-panel-body">
            {itemOrder.length ? (
              itemOrder.map((itemId) => {
                const item = itemsById[itemId];
                if (!item) return null;
                return (
                  <div key={itemId}>
                    <div>{item.name || item.materialId}</div>
                    <div className="hint">{item.type || "Material"}</div>
                  </div>
                );
              })
            ) : (
              <div className="workspace-placeholder">No inventory items yet.</div>
            )}
          </div>
        </section>
      </div>
      <div className="workspace-column workspace-column-center">
        <section className="workspace-panel">
          <div className="workspace-panel-header">Material details</div>
          <div className="workspace-panel-body">
            <div className="workspace-placeholder">Selection not yet migrated</div>
          </div>
        </section>
      </div>
      <div className="workspace-column workspace-column-right">
        <section className="workspace-panel">
          <div className="workspace-panel-header">Actions / Notes</div>
          <div className="workspace-panel-body">
            <div className="hint">Actions coming later.</div>
          </div>
        </section>
      </div>
    </>
  );
}
