// Purpose: workspace2GridConfig.js provides exports: clampWs2Row, getDefaultLaneName, isWs2RowInRange, WS2_GRID_INITIAL_LANES, WS2_GRID_ROWS.
// Interacts with: no imports.
// Role: module module within the broader app graph.
export const WS2_GRID_ROWS = 16;
export const WS2_GRID_INITIAL_LANES = 6;

export function isWs2RowInRange(row) {
  return Number.isFinite(row) && row >= 0 && row < WS2_GRID_ROWS;
}

export function clampWs2Row(row) {
  if (!Number.isFinite(row)) return null;
  const intRow = Math.floor(row);
  if (intRow < 0) return 0;
  if (intRow >= WS2_GRID_ROWS) return WS2_GRID_ROWS - 1;
  return intRow;
}

export function getDefaultLaneName(laneIndex) {
  const safeIndex = Number.isFinite(laneIndex) && laneIndex >= 0 ? Math.floor(laneIndex) : 0;
  return `Lane ${safeIndex + 1}`;
}

