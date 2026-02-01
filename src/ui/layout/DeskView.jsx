import React from "react";

import { useStore } from "../../state/store.js";

export default function DeskView() {
  const nodeOrder = useStore((state) => state.authoritative.desk.nodeOrder || []);
  const nodesById = useStore((state) => state.authoritative.desk.nodesById || {});
  const itemsById = useStore((state) => state.authoritative.inventory.itemsById || {});

  const clips = nodeOrder.map((clipId) => {
    const node = nodesById[clipId];
    if (!node) return null;
    const material = itemsById[node.materialId];
    return {
      clipId,
      node,
      materialName: material ? (material.name || material.materialId) : node.materialId,
      materialType: material ? (material.type || "Material") : "Unknown"
    };
  }).filter(Boolean);

  return (
    <>
      <div className="workspace-column workspace-column-left">
        <section className="workspace-panel">
          <div className="workspace-panel-header">Desk clips</div>
          <div className="workspace-panel-body">
            {clips.length ? (
              clips.map(({ clipId, node }) => (
                <div key={clipId}>
                  <div>{clipId}</div>
                  <div className="hint">Lane {node.laneId ?? "?"}</div>
                </div>
              ))
            ) : (
              <div className="workspace-placeholder">No desk clips yet.</div>
            )}
          </div>
        </section>
      </div>
      <div className="workspace-column workspace-column-center">
        <section className="workspace-panel">
          <div className="workspace-panel-header">Clip details</div>
          <div className="workspace-panel-body">
            {clips.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Clip</th>
                    <th>Material</th>
                    <th>Lane</th>
                    <th>Start</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {clips.map(({ clipId, node, materialName }) => (
                    <tr key={clipId}>
                      <td>{clipId}</td>
                      <td>{materialName}</td>
                      <td>{String(node.laneId ?? "-")}</td>
                      <td>{String(node.start ?? "-")}</td>
                      <td>{String(node.duration ?? "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="workspace-placeholder">No clip data available.</div>
            )}
          </div>
        </section>
      </div>
      <div className="workspace-column workspace-column-right">
        <section className="workspace-panel">
          <div className="workspace-panel-header">Materials</div>
          <div className="workspace-panel-body">
            {clips.length ? (
              clips.map(({ clipId, materialName, materialType }) => (
                <div key={clipId}>
                  <div>{materialName}</div>
                  <div className="hint">{materialType}</div>
                </div>
              ))
            ) : (
              <div className="workspace-placeholder">No materials placed yet.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
