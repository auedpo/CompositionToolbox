import React from "react";

function toNumber(value, fallback = undefined) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

export default function EuclideanCircleViz({ vizModel }) {
  if (!vizModel || vizModel.kind !== "euclidean") {
    return null;
  }
  const domain = vizModel.meta && vizModel.meta.domain ? vizModel.meta.domain : {};
  const payload = vizModel.payload || {};
  const payloadSteps = toNumber(payload.steps);
  const domainSteps = toNumber(domain.steps, payloadSteps);
  const steps = Math.max(1, domainSteps || 1);
  const pulses = toNumber(domain.pulses);
  const rotation = toNumber(domain.rotation, 0);
  const active = payload.active || {};
  const activeKind = typeof active.kind === "string" ? active.kind : "binaryMask";
  const rawValues = Array.isArray(active.values) ? active.values : [];

  const activeIndices = [];
  if (activeKind === "indexMask") {
    rawValues.forEach((value) => {
      const numeric = toNumber(value);
      if (Number.isFinite(numeric)) {
        activeIndices.push(numeric);
      }
    });
  } else {
    rawValues.forEach((value, index) => {
      if (value) {
        activeIndices.push(index);
      }
    });
  }

  const uniqueIndices = Array.from(new Set(activeIndices.map((value) => Number(value))))
    .filter((value) => Number.isFinite(value) && value >= 0 && value < steps)
    .sort((a, b) => a - b);
  const activeSet = new Set(uniqueIndices);

  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = ((-90 + (i * 360) / steps) * Math.PI) / 180;
    const x = 50 + Math.cos(angle) * 40;
    const y = 50 + Math.sin(angle) * 40;
    points.push({ x, y });
  }

  const activePoints = uniqueIndices.map((index) => points[index]).filter(Boolean);
  const pointString = activePoints.map((point) => `${point.x},${point.y}`).join(" ");

  const pulsesLabel = Number.isFinite(pulses) ? pulses : "?";

  return (
    <div className="euclid-viz">
      <svg viewBox="0 0 100 100" role="img" aria-label={`Euclidean pattern ${steps} steps`}>
        <circle className="ring" cx="50" cy="50" r="40" />
        {points.map((point, index) => (
          <circle
            key={`pt-${index}`}
            className={`pt${activeSet.has(index) ? " pt-active" : ""}`}
            cx={point.x}
            cy={point.y}
            r="2.8"
          />
        ))}
        {activePoints.length >= 3 && (
          <polygon className="poly" points={pointString} />
        )}
        {activePoints.length === 2 && (
          <polyline className="poly" fill="none" points={pointString} />
        )}
      </svg>
      <div className="hint">
        {`E(${steps},${pulsesLabel}) rot=${rotation}`}
      </div>
    </div>
  );
}
