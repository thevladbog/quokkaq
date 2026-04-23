import type { ScreenWidgetConfig } from './screen-template-widgets';
import type { ScreenTemplateCellGrid } from './screen-template-layout';

const DEFAULT_COLS = 12;
const DEFAULT_ROWS = 24;

function placement(col: number, row: number, colSpan: number, rowSpan: number) {
  return { col, row, colSpan, rowSpan };
}

/** Heuristic migration from legacy regions layout to cell-grid (portrait + landscape). */
export function migrateRegionsToCellGrid(
  id: string,
  layout: { type: string; regions: Array<{ id: string; size: string }> },
  widgets: ScreenWidgetConfig[]
): ScreenTemplateCellGrid {
  const regions = layout.regions;
  const byRegion = new Map<string, ScreenWidgetConfig[]>();
  for (const w of widgets) {
    const list = byRegion.get(w.regionId) ?? [];
    list.push(w);
    byRegion.set(w.regionId, list);
  }

  if (layout.type === 'grid' && regions.length === 2) {
    const [mainR, sideR] = regions;
    const mainW = byRegion.get(mainR.id) ?? [];
    const sideW = byRegion.get(sideR.id) ?? [];

    const portraitWidgets = [
      ...mainW.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(1, 1 + i, DEFAULT_COLS, 1),
        config: w.config,
        style: w.style
      })),
      ...sideW.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(
          1,
          Math.max(mainW.length, 1) + 2 + i,
          DEFAULT_COLS,
          1
        ),
        config: w.config,
        style: w.style
      }))
    ];

    const landscapeWidgets = [
      ...mainW.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(1, 1 + i, 8, 1),
        config: w.config,
        style: w.style
      })),
      ...sideW.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(9, 1 + i, 4, 1),
        config: w.config,
        style: w.style
      }))
    ];

    return {
      layoutKind: 'cellGrid',
      id,
      portrait: {
        columns: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        widgets: clampPlacements(portraitWidgets, DEFAULT_COLS, DEFAULT_ROWS)
      },
      landscape: {
        columns: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        widgets: clampPlacements(landscapeWidgets, DEFAULT_COLS, DEFAULT_ROWS)
      }
    };
  }

  if (layout.type === 'fullscreen' && regions[0]) {
    const list = byRegion.get(regions[0].id) ?? widgets;
    const face = {
      columns: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      widgets: list.map((w) => ({
        id: w.id,
        type: w.type,
        placement: placement(1, 1, DEFAULT_COLS, DEFAULT_ROWS),
        config: w.config,
        style: w.style
      }))
    };
    return {
      layoutKind: 'cellGrid',
      id,
      portrait: face,
      landscape: {
        ...face,
        widgets: face.widgets.map((w) => ({ ...w }))
      }
    };
  }

  if (layout.type === 'grid' && regions.length >= 3) {
    const rowSpan = Math.max(1, Math.floor(DEFAULT_ROWS / regions.length));
    const merged: Array<{
      id: string;
      type: ScreenWidgetConfig['type'];
      placement: { col: number; row: number; colSpan: number; rowSpan: number };
      config?: Record<string, unknown>;
      style?: ScreenWidgetConfig['style'];
    }> = [];
    regions.forEach((reg, ri) => {
      const list = byRegion.get(reg.id) ?? [];
      const rowStart = 1 + ri * rowSpan;
      list.forEach((w, wi) => {
        merged.push({
          id: w.id,
          type: w.type,
          placement: placement(1, rowStart + wi, DEFAULT_COLS, 1),
          config: w.config,
          style: w.style
        });
      });
    });
    return {
      layoutKind: 'cellGrid',
      id,
      portrait: {
        columns: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        widgets: clampPlacements(merged, DEFAULT_COLS, DEFAULT_ROWS)
      },
      landscape: {
        columns: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        widgets: clampPlacements(
          merged.map((w) => ({ ...w, placement: { ...w.placement } })),
          DEFAULT_COLS,
          DEFAULT_ROWS
        )
      }
    };
  }

  if (layout.type === 'split-h' || layout.type === 'split-v') {
    const a = regions[0];
    const b = regions[1];
    const wa = a ? (byRegion.get(a.id) ?? []) : [];
    const wb = b ? (byRegion.get(b.id) ?? []) : [];
    const portraitWidgets = [
      ...wa.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(1, 1 + i, DEFAULT_COLS, 1),
        config: w.config,
        style: w.style
      })),
      ...wb.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(1, wa.length + 2 + i, DEFAULT_COLS, 1),
        config: w.config,
        style: w.style
      }))
    ];
    const landscapeWidgets = [
      ...wa.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(1, 1 + i, 6, 1),
        config: w.config,
        style: w.style
      })),
      ...wb.map((w, i) => ({
        id: w.id,
        type: w.type,
        placement: placement(7, 1 + i, 6, 1),
        config: w.config,
        style: w.style
      }))
    ];
    return {
      layoutKind: 'cellGrid',
      id,
      portrait: {
        columns: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        widgets: clampPlacements(portraitWidgets, DEFAULT_COLS, DEFAULT_ROWS)
      },
      landscape: {
        columns: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        widgets: clampPlacements(landscapeWidgets, DEFAULT_COLS, DEFAULT_ROWS)
      }
    };
  }

  const fallback = widgets.map((w) => ({
    id: w.id,
    type: w.type,
    placement: placement(1, 1, DEFAULT_COLS, DEFAULT_ROWS),
    config: w.config,
    style: w.style
  }));
  const face = {
    columns: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    widgets: fallback
  };
  return {
    layoutKind: 'cellGrid',
    id,
    portrait: face,
    landscape: {
      ...face,
      widgets: fallback.map((w) => ({ ...w, placement: { ...w.placement } }))
    }
  };
}

function clampPlacements<
  T extends {
    placement: { col: number; row: number; colSpan: number; rowSpan: number };
  }
>(widgets: T[], columns: number, rows: number): T[] {
  return widgets.map((w) => {
    let { col, row, colSpan, rowSpan } = w.placement;
    colSpan = Math.min(colSpan, columns);
    rowSpan = Math.min(rowSpan, rows);
    col = Math.max(1, Math.min(col, columns - colSpan + 1));
    row = Math.max(1, Math.min(row, rows - rowSpan + 1));
    return { ...w, placement: { col, row, colSpan, rowSpan } };
  });
}
