import type { ScreenWidgetType } from '@quokkaq/shared-types';

export const REGION_PREFIX = 'screen-region' as const;
export const LIBRARY_PREFIX = 'screen-palette' as const;
export const CANVAS_WIDGET_PREFIX = 'screen-canvas-widget' as const;
export const CANVAS_CELL_PREFIX = 'screen-canvas-cell' as const;

export function regionDropId(rid: string) {
  return `${REGION_PREFIX}:${rid}`;
}
export function parseRegionDropId(
  str: string | null | number | undefined
): string | null {
  if (str == null) return null;
  const s = String(str);
  if (s.startsWith(`${REGION_PREFIX}:`)) {
    return s.slice(REGION_PREFIX.length + 1);
  }
  return null;
}
export function libraryId(type: ScreenWidgetType) {
  return `${LIBRARY_PREFIX}:${type}`;
}
export function parseLibraryId(s: string | null | number | undefined): {
  from: 'library';
  type: ScreenWidgetType;
} | null {
  if (s == null) return null;
  const t = String(s);
  if (!t.startsWith(`${LIBRARY_PREFIX}:`)) return null;
  return {
    from: 'library',
    type: t.slice(LIBRARY_PREFIX.length + 1) as ScreenWidgetType
  };
}

export function canvasWidgetId(widgetId: string) {
  return `${CANVAS_WIDGET_PREFIX}:${widgetId}`;
}

export function parseCanvasWidgetId(
  s: string | null | number | undefined
): { from: 'canvas'; widgetId: string } | null {
  if (s == null) return null;
  const t = String(s);
  if (!t.startsWith(`${CANVAS_WIDGET_PREFIX}:`)) return null;
  return { from: 'canvas', widgetId: t.slice(CANVAS_WIDGET_PREFIX.length + 1) };
}

export function canvasCellId(col: number, row: number) {
  return `${CANVAS_CELL_PREFIX}:${col}:${row}`;
}

export function parseCanvasCellId(
  s: string | null | number | undefined
): { col: number; row: number } | null {
  if (s == null) return null;
  const t = String(s);
  if (!t.startsWith(`${CANVAS_CELL_PREFIX}:`)) return null;
  const rest = t.slice(CANVAS_CELL_PREFIX.length + 1);
  const parts = rest.split(':');
  if (parts.length !== 2) return null;
  const col = Number(parts[0]);
  const row = Number(parts[1]);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  return { col, row };
}
