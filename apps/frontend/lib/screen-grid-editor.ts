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
  return Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(value, key);
  } catch {
    return false;
  }
}

function isValidPlacement(placement: unknown): placement is GridPlacement {
  if (placement === null || typeof placement !== 'object') return false;
  try {
    if (Object.getPrototypeOf(placement) !== Object.prototype) return false;
    return ['col', 'row', 'colSpan', 'rowSpan'].every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(placement, key);
      return (
        descriptor !== undefined &&
        'value' in descriptor &&
        isPositiveInteger(descriptor.value)
      );
    });
  } catch {
    return false;
  }
}

function ownGridItem(value: unknown): GridItem | null {
  if (value === null || typeof value !== 'object') return null;
  try {
    if (!hasOwn(value, 'id') || !hasOwn(value, 'placement')) return null;
    const id = Object.getOwnPropertyDescriptor(value, 'id');
    const placement = Object.getOwnPropertyDescriptor(value, 'placement');
    if (
      !id ||
      !placement ||
      !('value' in id) ||
      !('value' in placement) ||
      typeof id.value !== 'string' ||
      !isValidPlacement(placement.value)
    ) {
      return null;
    }
    return { id: id.value, placement: placement.value };
  } catch {
    return null;
  }
}

function samePlacement(left: GridPlacement, right: GridPlacement): boolean {
  return (
    left.col === right.col &&
    left.row === right.row &&
    left.colSpan === right.colSpan &&
    left.rowSpan === right.rowSpan
  );
}

function authoritativeItem(
  items: readonly GridItem[],
  itemId: string
): GridItem | null {
  const matches = items
    .map(ownGridItem)
    .filter((candidate): candidate is GridItem => candidate?.id === itemId);
  return matches.length === 1 ? matches[0]! : null;
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
  for (const rawItem of items) {
    const item = ownGridItem(rawItem);
    if (!item) continue;
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
  return !items.some((rawItem) => {
    const item = ownGridItem(rawItem);
    return (
      item !== null &&
      item.id !== skipId &&
      placementsOverlap(item.placement, placement)
    );
  });
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
  const authoritative = authoritativeItem(items, itemId);
  if (
    !authoritative ||
    !isValidPlacement(placement) ||
    !samePlacement(authoritative.placement, placement)
  ) {
    return null;
  }
  const next = {
    ...authoritative.placement,
    col: authoritative.placement.col + deltaCol,
    row: authoritative.placement.row + deltaRow
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
  const authoritative = authoritativeItem(items, itemId);
  if (
    !authoritative ||
    !isValidPlacement(placement) ||
    !samePlacement(authoritative.placement, placement)
  ) {
    return null;
  }
  const next = { ...authoritative.placement, colSpan, rowSpan };
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
): { placement: GridPlacement; rows: number } | null {
  if (
    !isPositiveInteger(columns) ||
    !isPositiveInteger(rows) ||
    !isPositiveInteger(maxRows) ||
    rows > maxRows ||
    !isValidPlacement(original)
  ) {
    return null;
  }
  const initialRows = rows;
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
