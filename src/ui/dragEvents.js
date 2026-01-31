export const MODULAR_GRID_DRAG_START = "modular-grid-drag-start";

export function dispatchModularGridDrag(detail = {}) {
  if (typeof window === "undefined" || !window.CustomEvent) return;
  const event = new CustomEvent(MODULAR_GRID_DRAG_START, { detail });
  window.dispatchEvent(event);
}
