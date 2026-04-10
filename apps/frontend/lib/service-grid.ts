/** Shared kiosk + admin service grid layout (columns × rows). */
export const SERVICE_GRID_COLS = 8;
export const SERVICE_GRID_ROWS = 8;
export const SERVICE_GRID_CELL_COUNT = SERVICE_GRID_COLS * SERVICE_GRID_ROWS;

/** Visual gap between cells in the admin grid editor (px), matches CSS gap. */
export const SERVICE_GRID_EDITOR_GAP_PX = 2;

/**
 * Admin grid preview container aspect ratio (width / height).
 * Kiosk uses a flex-grown area under the header, so cells are usually wider than tall; 16:9 matches that better than a square.
 */
export const SERVICE_GRID_EDITOR_PREVIEW_ASPECT_RATIO = '16 / 9';

export function positionToIndex(row: number, col: number): number {
  return row * SERVICE_GRID_COLS + col;
}

export function indexToPosition(index: number): { row: number; col: number } {
  const row = Math.floor(index / SERVICE_GRID_COLS);
  const col = index % SERVICE_GRID_COLS;
  return { row, col };
}

/** Clamp top-left so a block with given spans stays inside the grid. */
export function clampGridOrigin(
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number
): { row: number; col: number } {
  const rs = Math.max(1, Math.floor(rowSpan));
  const cs = Math.max(1, Math.floor(colSpan));
  const maxRow = Math.max(0, SERVICE_GRID_ROWS - rs);
  const maxCol = Math.max(0, SERVICE_GRID_COLS - cs);
  return {
    row: Math.min(Math.max(0, Math.floor(row)), maxRow),
    col: Math.min(Math.max(0, Math.floor(col)), maxCol)
  };
}

/**
 * Convert a pixel span along one axis to a grid span count.
 * `1fr` tracks plus subpixel layout can make the measured width slightly larger than
 * n * cellSize + (n-1) * gap for the float `cellSize` from the container — `Math.round`
 * alone then under-counts by one when resizing across several cells.
 */
function pixelSpanToAxisSpan(
  px: number,
  cellSize: number,
  gapPx: number,
  maxSpan: number
): number {
  if (cellSize <= 0) return 1;
  const step = cellSize + gapPx;
  let n = Math.max(1, Math.round((px + gapPx) / step));
  const slack = Math.min(8, Math.max(2, step * 0.12));
  while (n < maxSpan && px + slack >= (n + 1) * cellSize + n * gapPx) {
    n++;
  }
  return n;
}

/** Convert overlay width in px to column span (editor geometry). */
export function pixelSpanToColSpan(
  widthPx: number,
  cellWidth: number,
  gapPx: number
): number {
  return pixelSpanToAxisSpan(widthPx, cellWidth, gapPx, SERVICE_GRID_COLS);
}

export function pixelSpanToRowSpan(
  heightPx: number,
  cellHeight: number,
  gapPx: number
): number {
  return pixelSpanToAxisSpan(heightPx, cellHeight, gapPx, SERVICE_GRID_ROWS);
}
