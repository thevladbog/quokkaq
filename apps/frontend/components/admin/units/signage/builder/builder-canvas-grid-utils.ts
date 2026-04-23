/** Map pointer to 1-based grid column/row inside a uniform CSS grid (equal tracks, constant gap). */
export function clientPointToGridCell(
  clientX: number,
  clientY: number,
  gridRect: DOMRectReadOnly,
  columns: number,
  rows: number,
  gapPx: number
): { col: number; row: number } {
  const axisIndex = (pos: number, tracks: number, total: number): number => {
    const t = Math.max(0, Math.min(total, pos));
    if (tracks <= 0) return 1;
    const cell =
      (total - gapPx * Math.max(0, tracks - 1)) / Math.max(1, tracks);
    if (cell <= 0) return 1;
    let acc = 0;
    for (let i = 1; i <= tracks; i++) {
      const cellEnd = acc + cell;
      if (t < cellEnd) return i;
      if (i < tracks) {
        acc = cellEnd + gapPx;
      }
    }
    return tracks;
  };

  const col = axisIndex(clientX - gridRect.left, columns, gridRect.width);
  const row = axisIndex(clientY - gridRect.top, rows, gridRect.height);
  return { col, row };
}
