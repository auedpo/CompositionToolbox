// Purpose: visuals.js provides exports: hueForInterval, intervalColor, intervalLightness.
// Interacts with: no imports.
// Role: core domain layer module within the broader app graph.
export function hueForInterval(interval, edoSteps) {
  const N = Math.max(1, Math.round(edoSteps || 1));
  const d = Math.abs(interval) % N;
  const ic = Math.min(d, N - d);
  const count = Math.ceil(N / 2);
  if (count <= 1) return 0;
  const index = Math.max(0, ic - 1);
  const baseHue = count === 1 ? 0 : (index / (count - 1)) * 180;
  const flip = (index % 2) === 1 ? 180 : 0;
  const offset = 240;
  return (offset + baseHue + flip) % 360;
}

export function intervalLightness(interval, baseSteps) {
  const steps = Math.max(1, Math.round(baseSteps || 1));
  const octave = Math.floor(Math.abs(interval) / steps);
  const raw = 40 + octave * 6;
  return Math.max(20, Math.min(95, raw));
}

export function intervalColor(interval, baseSteps) {
  const N = Math.max(1, Math.round(baseSteps || 1));
  const hue = hueForInterval(interval, N);
  const lightness = intervalLightness(interval, baseSteps || N);
  return `hsl(${hue}, 60%, ${lightness}%)`;
}
