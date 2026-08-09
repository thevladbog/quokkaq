/**
 * Pure grid primitives shared by the legacy signage editor and the composable
 * experience builder. They deliberately know nothing about widgets or Zustand.
 */
export type GridPlacement = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

export type GridItem = { id: string; placement: GridPlacement };

export type GridLayout = {
  placements: Record<string, GridPlacement>;
  typographyScale?: number;
};

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function isValidPlacement(placement: GridPlacement): boolean {
  return (
    isPositiveInteger(placement.col) &&
    isPositiveInteger(placement.row) &&
    isPositiveInteger(placement.colSpan) &&
    isPositiveInteger(placement.rowSpan)
  );
}

function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/** Returns every occupied grid coordinate, in deterministic column-major order. */
export function occupiedCells(
  items: readonly GridItem[],
  skipId?: string
): Set<string> {
  const cells = new Set<string>();
  for (const item of items) {
    if (item.id === skipId || !isValidPlacement(item.placement)) continue;
    const { col, row, colSpan, rowSpan } = item.placement;
    for (let currentCol = col; currentCol < col + colSpan; currentCol++) {
      for (let currentRow = row; currentRow < row + rowSpan; currentRow++) {
        cells.add(cellKey(currentCol, currentRow));
      }
    }
  }
  return cells;
}

/** Finds the first unoccupied cell in reading order (row, then column). */
export function firstFreeCell(
  columns: number,
  rows: number,
  items: readonly GridItem[],
  skipId?: string
): { col: number; row: number } | null {
  if (!isPositiveInteger(columns) || !isPositiveInteger(rows)) return null;
  const occupied = occupiedCells(items, skipId);
  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= columns; col++) {
      if (!occupied.has(cellKey(col, row))) return { col, row };
    }
  }
  return null;
}

export function isPlacementWithinBounds(
  columns: number,
  rows: number,
  placement: GridPlacement
): boolean {
  if (
    !isPositiveInteger(columns) ||
    !isPositiveInteger(rows) ||
    !isValidPlacement(placement)
  ) {
    return false;
  }
  return (
    placement.col + placement.colSpan - 1 <= columns &&
    placement.row + placement.rowSpan - 1 <= rows
  );
}

export function placementsOverlap(
  left: GridPlacement,
  right: GridPlacement
): boolean {
  if (!isValidPlacement(left) || !isValidPlacement(right)) return false;
  return !(
    left.col + left.colSpan - 1 < right.col ||
    right.col + right.colSpan - 1 < left.col ||
    left.row + left.rowSpan - 1 < right.row ||
    right.row + right.rowSpan - 1 < left.row
  );
}

/** Checks bounds and collisions, excluding the item currently being edited. */
export function canPlacePlacement(
  columns: number,
  rows: number,
  items: readonly GridItem[],
  placement: GridPlacement,
  skipId?: string
): boolean {
  if (!isPlacementWithinBounds(columns, rows, placement)) return false;
  return !items.some(
    (item) => item.id !== skipId && placementsOverlap(item.placement, placement)
  );
}

/** Returns a moved placement only when it remains inside the grid and collision-free. */
export function movePlacement(
  columns: number,
  rows: number,
  items: readonly GridItem[],
  itemId: string,
  placement: GridPlacement,
  deltaCol: number,
  deltaRow: number
): GridPlacement | null {
  if (!Number.isInteger(deltaCol) || !Number.isInteger(deltaRow)) return null;
  const next = {
    ...placement,
    col: placement.col + deltaCol,
    row: placement.row + deltaRow
  };
  return canPlacePlacement(columns, rows, items, next, itemId) ? next : null;
}

/** Returns a resized placement only when it remains inside the grid and collision-free. */
export function resizePlacement(
  columns: number,
  rows: number,
  items: readonly GridItem[],
  itemId: string,
  placement: GridPlacement,
  colSpan: number,
  rowSpan: number
): GridPlacement | null {
  const next = { ...placement, colSpan, rowSpan };
  return canPlacePlacement(columns, rows, items, next, itemId) ? next : null;
}

/**
 * Mirrors legacy duplicate behaviour: place the duplicate as a 1×1 widget at
 * the first free cell, expanding rows only up to the supplied ceiling. When
 * no cell can be found, return the original placement unchanged.
 */
export function findDuplicatePlacement(
  columns: number,
  rows: number,
  items: readonly GridItem[],
  original: GridPlacement,
  maxRows: number
): { placement: GridPlacement; rows: number } {
  const initialRows = Math.max(1, Math.min(rows, maxRows));
  for (let nextRows = initialRows; nextRows <= maxRows; nextRows++) {
    const cell = firstFreeCell(columns, nextRows, items);
    if (cell) {
      return {
        placement: { ...cell, colSpan: 1, rowSpan: 1 },
        rows: nextRows
      };
    }
  }
  return { placement: { ...original }, rows: initialRows };
}

/** Copies only variant-specific data; shared widget content never belongs here. */
export function copyGridLayout(layout: GridLayout): GridLayout {
  return {
    placements: Object.fromEntries(
      Object.entries(layout.placements).map(([widgetId, placement]) => [
        widgetId,
        { ...placement }
      ])
    ),
    ...(layout.typographyScale === undefined
      ? {}
      : { typographyScale: layout.typographyScale })
  };
}
