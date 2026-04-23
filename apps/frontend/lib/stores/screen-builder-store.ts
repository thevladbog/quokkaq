import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  ScreenTemplateSchema,
  type ScreenTemplate,
  type ScreenTemplateCellGrid,
  type ScreenCellGridWidget,
  isScreenTemplateCellGrid,
  migrateRegionsToCellGrid,
  type ScreenWidgetType
} from '@quokkaq/shared-types';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';

const HISTORY_CAP = 40;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function newWidgetId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `w${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  }
  return `w${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type BuilderSelection =
  | { kind: 'none' }
  | { kind: 'widget'; id: string };

export type BuilderEditOrientation = 'portrait' | 'landscape';

function toCellGrid(input: ScreenTemplate): ScreenTemplateCellGrid {
  if (isScreenTemplateCellGrid(input)) {
    return clone(input);
  }
  const raw = migrateRegionsToCellGrid(input.id, input.layout, input.widgets);
  const p = ScreenTemplateSchema.safeParse(raw);
  if (!p.success || !isScreenTemplateCellGrid(p.data)) {
    return clone(SCREEN_TEMPLATE_PRESETS['info-heavy']!);
  }
  return p.data;
}

function defaultEmptyTemplate(): ScreenTemplateCellGrid {
  const id = 'custom-template';
  const w: ScreenCellGridWidget = {
    id: newWidgetId(),
    type: 'called-tickets',
    placement: { col: 1, row: 1, colSpan: 12, rowSpan: 8 },
    config: {}
  };
  const face = {
    columns: 12,
    rows: 12,
    widgets: [w]
  };
  return {
    layoutKind: 'cellGrid',
    id,
    portrait: clone(face),
    landscape: clone(face)
  };
}

function occupiedCells(
  widgets: ScreenCellGridWidget[],
  skipId?: string
): Set<string> {
  const s = new Set<string>();
  for (const w of widgets) {
    if (w.id === skipId) continue;
    const { col, row, colSpan, rowSpan } = w.placement;
    for (let c = col; c < col + colSpan; c++) {
      for (let r = row; r < row + rowSpan; r++) {
        s.add(`${c}:${r}`);
      }
    }
  }
  return s;
}

function firstFreeCell(
  columns: number,
  rows: number,
  widgets: ScreenCellGridWidget[],
  skipId?: string
): { col: number; row: number } | null {
  const occ = occupiedCells(widgets, skipId);
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= columns; c++) {
      if (!occ.has(`${c}:${r}`)) {
        return { col: c, row: r };
      }
    }
  }
  return null;
}

function defaultConfigForType(type: ScreenWidgetType): Record<string, unknown> {
  switch (type) {
    case 'content-player':
      return { overlayTickets: true };
    case 'rss-feed':
    case 'weather':
      return { feedId: '' };
    case 'custom-html':
      return { html: '' };
    case 'screen-footer-qr':
      return { showQr: true, showStats: true };
    case 'join-queue-qr':
      return { align: 'center' };
    case 'queue-ticker':
      return {
        labelRu: '',
        labelEn: '',
        direction: 'left',
        durationSeconds: 24
      };
    default:
      return {};
  }
}

function commitHistory(s: {
  template: ScreenTemplateCellGrid;
  history: ScreenTemplateCellGrid[];
  historyIndex: number;
  isDirty: boolean;
}) {
  const h = s.history;
  const idx = s.historyIndex;
  const next = h.slice(0, idx + 1);
  next.push(clone(s.template));
  if (next.length > HISTORY_CAP) next.shift();
  s.history = next;
  s.historyIndex = next.length - 1;
  s.isDirty = true;
}

type BuilderState = {
  template: ScreenTemplateCellGrid;
  editOrientation: BuilderEditOrientation;
  sourcePresetId: string | null;
  history: ScreenTemplateCellGrid[];
  historyIndex: number;
  selection: BuilderSelection;
  zoom: number;
  isDirty: boolean;
  initFrom: (t: ScreenTemplate, presetId: string | null) => void;
  markSaved: (t: ScreenTemplate) => void;
  resetToPreset: (presetId: keyof typeof SCREEN_TEMPLATE_PRESETS) => void;
  setTemplateId: (id: string) => void;
  setEditOrientation: (o: BuilderEditOrientation) => void;
  setGridDimensions: (
    columns: number,
    rows: number,
    which: 'portrait' | 'landscape' | 'both'
  ) => void;
  /**
   * Legacy `(type, regionId?, atIndex?)` — region/index ignored.
   * Pass `{ col, row }` as 2nd arg to place the new widget at that cell on the
   * current `editOrientation` face (1×1); the other face still uses first free cell.
   */
  addWidget: (
    type: ScreenWidgetType,
    legacyOrDrop?: string | { col: number; row: number }
  ) => void;
  removeWidget: (widgetId: string) => void;
  /** Legacy no-op for cell grid (use drag on canvas). */
  moveWidget: (
    widgetId: string,
    _targetRegionId: string,
    _atIndex: number
  ) => void;
  reorderInRegion: (
    _regionId: string,
    _fromIndex: number,
    _toIndex: number
  ) => void;
  updateWidget: (
    widgetId: string,
    updates: Partial<
      Pick<ScreenCellGridWidget, 'type' | 'config' | 'style'>
    > & {
      placement?: ScreenCellGridWidget['placement'];
    }
  ) => void;
  setWidgetPlacement: (
    widgetId: string,
    placement: ScreenCellGridWidget['placement'],
    which?: 'portrait' | 'landscape' | 'both'
  ) => void;
  duplicateWidget: (widgetId: string) => void;
  nudgePosition: (_widgetId: string, _dx: number, _dy: number) => void;
  setSelection: (s: BuilderSelection) => void;
  setZoom: (z: number) => void;
  undo: () => void;
  redo: () => void;
  /** Legacy region API (no-op for cell grid). */
  setLayoutType: (_type: string) => void;
  setRegionSize: (_regionId: string, _size: string) => void;
  setRegionPanelStyle: (
    _regionId: string,
    _style: 'default' | 'card' | 'scrollPadded' | 'splitSection' | null
  ) => void;
  setRegionBackground: (_regionId: string, _color: string | null) => void;
};

export const useScreenBuilderStore = create<BuilderState>()(
  devtools(
    immer((set) => ({
      template: defaultEmptyTemplate(),
      editOrientation: 'portrait',
      sourcePresetId: null,
      history: [clone(defaultEmptyTemplate())],
      historyIndex: 0,
      selection: { kind: 'none' } as BuilderSelection,
      zoom: 1,
      isDirty: false,
      initFrom: (t, presetId) => {
        set((s) => {
          const grid = toCellGrid(t);
          s.template = clone(grid);
          s.editOrientation = 'portrait';
          s.sourcePresetId = presetId;
          s.history = [clone(s.template)];
          s.historyIndex = 0;
          s.selection = { kind: 'none' };
          s.isDirty = false;
        });
      },
      markSaved: (t) => {
        set((s) => {
          s.template = toCellGrid(t);
          s.isDirty = false;
          s.history = [clone(s.template)];
          s.historyIndex = 0;
        });
      },
      resetToPreset: (pid) => {
        set((s) => {
          const p = SCREEN_TEMPLATE_PRESETS[pid];
          if (!p) return;
          s.template = clone(p);
          s.sourcePresetId = String(pid);
          s.selection = { kind: 'none' };
          s.history = [clone(s.template)];
          s.historyIndex = 0;
          s.isDirty = true;
        });
      },
      setTemplateId: (id) => {
        set((s) => {
          s.template.id = id;
          commitHistory(s);
        });
      },
      setEditOrientation: (o) => {
        set((s) => {
          s.editOrientation = o;
        });
      },
      setGridDimensions: (columns, rows, which) => {
        set((s) => {
          const clamp = (n: number, lo: number, hi: number) =>
            Math.max(lo, Math.min(hi, n));
          const c = clamp(columns, 1, 48);
          const r = clamp(rows, 1, 48);
          const apply = (face: 'portrait' | 'landscape') => {
            const f = s.template[face];
            f.columns = c;
            f.rows = r;
            for (const w of f.widgets) {
              const p = w.placement;
              if (p.col + p.colSpan - 1 > c) {
                p.colSpan = Math.max(1, c - p.col + 1);
              }
              if (p.row + p.rowSpan - 1 > r) {
                p.rowSpan = Math.max(1, r - p.row + 1);
              }
              p.col = Math.min(p.col, c);
              p.row = Math.min(p.row, r);
            }
          };
          if (which === 'both' || which === 'portrait') apply('portrait');
          if (which === 'both' || which === 'landscape') apply('landscape');
          commitHistory(s);
        });
      },
      addWidget: (type, legacyOrDrop) => {
        set((s) => {
          const dropCell =
            legacyOrDrop &&
            typeof legacyOrDrop === 'object' &&
            !Array.isArray(legacyOrDrop) &&
            'col' in legacyOrDrop &&
            'row' in legacyOrDrop
              ? {
                  col: legacyOrDrop.col,
                  row: legacyOrDrop.row
                }
              : undefined;
          const id = newWidgetId();
          const cfg = defaultConfigForType(type);
          for (const face of ['portrait', 'landscape'] as const) {
            const f = s.template[face];
            let placement: ScreenCellGridWidget['placement'];
            if (
              dropCell &&
              face === s.editOrientation &&
              dropCell.col >= 1 &&
              dropCell.col <= f.columns &&
              dropCell.row >= 1 &&
              dropCell.row <= f.rows
            ) {
              placement = {
                col: dropCell.col,
                row: dropCell.row,
                colSpan: 1,
                rowSpan: 1
              };
            } else {
              let spot = firstFreeCell(f.columns, f.rows, f.widgets);
              while (!spot && f.rows < 48) {
                f.rows += 1;
                spot = firstFreeCell(f.columns, f.rows, f.widgets);
              }
              placement = spot
                ? { col: spot.col, row: spot.row, colSpan: 1, rowSpan: 1 }
                : { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
            }
            f.widgets.push({
              id,
              type,
              placement: { ...placement },
              config: { ...cfg }
            });
          }
          s.selection = { kind: 'widget', id };
          commitHistory(s);
        });
      },
      removeWidget: (widgetId) => {
        set((s) => {
          s.template.portrait.widgets = s.template.portrait.widgets.filter(
            (x) => x.id !== widgetId
          );
          s.template.landscape.widgets = s.template.landscape.widgets.filter(
            (x) => x.id !== widgetId
          );
          if (s.selection.kind === 'widget' && s.selection.id === widgetId) {
            s.selection = { kind: 'none' };
          }
          commitHistory(s);
        });
      },
      moveWidget: () => {},
      reorderInRegion: () => {},
      updateWidget: (widgetId, updates) => {
        set((s) => {
          for (const face of ['portrait', 'landscape'] as const) {
            const f = s.template[face];
            const w = f.widgets.find((x) => x.id === widgetId);
            if (!w) continue;
            if (updates.type != null) w.type = updates.type;
            if (updates.config != null) {
              w.config = { ...(w.config ?? {}), ...updates.config };
            }
            if (updates.style != null) {
              w.style = { ...w.style, ...updates.style };
            }
            if (updates.placement != null) {
              w.placement = { ...w.placement, ...updates.placement };
            }
          }
          commitHistory(s);
        });
      },
      setWidgetPlacement: (widgetId, placement, which = 'both') => {
        set((s) => {
          const faces =
            which === 'both' ? (['portrait', 'landscape'] as const) : [which];
          for (const face of faces) {
            const w = s.template[face].widgets.find((x) => x.id === widgetId);
            if (w) w.placement = { ...placement };
          }
          commitHistory(s);
        });
      },
      duplicateWidget: (widgetId) => {
        set((s) => {
          const pid = newWidgetId();
          const copyPortrait = s.template.portrait.widgets.find(
            (x) => x.id === widgetId
          );
          const copyLandscape = s.template.landscape.widgets.find(
            (x) => x.id === widgetId
          );
          if (!copyPortrait || !copyLandscape) return;
          const np: ScreenCellGridWidget = {
            ...clone(copyPortrait),
            id: pid
          };
          const nl: ScreenCellGridWidget = {
            ...clone(copyLandscape),
            id: pid
          };
          let spotP = firstFreeCell(
            s.template.portrait.columns,
            s.template.portrait.rows,
            s.template.portrait.widgets
          );
          while (!spotP && s.template.portrait.rows < 48) {
            s.template.portrait.rows += 1;
            spotP = firstFreeCell(
              s.template.portrait.columns,
              s.template.portrait.rows,
              s.template.portrait.widgets
            );
          }
          let spotL = firstFreeCell(
            s.template.landscape.columns,
            s.template.landscape.rows,
            s.template.landscape.widgets
          );
          while (!spotL && s.template.landscape.rows < 48) {
            s.template.landscape.rows += 1;
            spotL = firstFreeCell(
              s.template.landscape.columns,
              s.template.landscape.rows,
              s.template.landscape.widgets
            );
          }
          if (spotP) {
            np.placement = {
              col: spotP.col,
              row: spotP.row,
              colSpan: 1,
              rowSpan: 1
            };
          }
          if (spotL) {
            nl.placement = {
              col: spotL.col,
              row: spotL.row,
              colSpan: 1,
              rowSpan: 1
            };
          }
          s.template.portrait.widgets.push(np);
          s.template.landscape.widgets.push(nl);
          s.selection = { kind: 'widget', id: pid };
          commitHistory(s);
        });
      },
      nudgePosition: () => {},
      setSelection: (sel) => {
        set((s) => {
          s.selection = sel;
        });
      },
      setZoom: (z) => {
        set((s) => {
          s.zoom = Math.min(2, Math.max(0.4, z));
        });
      },
      undo: () => {
        set((s) => {
          if (s.historyIndex <= 0) return;
          s.historyIndex -= 1;
          s.template = clone(s.history[s.historyIndex]!);
          s.selection = { kind: 'none' };
          s.isDirty = true;
        });
      },
      redo: () => {
        set((s) => {
          if (s.historyIndex >= s.history.length - 1) return;
          s.historyIndex += 1;
          s.template = clone(s.history[s.historyIndex]!);
          s.selection = { kind: 'none' };
          s.isDirty = true;
        });
      },
      setLayoutType: () => {},
      setRegionSize: () => {},
      setRegionPanelStyle: () => {},
      setRegionBackground: () => {}
    }))
  )
);

export function validateBuilderTemplate(t: unknown) {
  return ScreenTemplateSchema.safeParse(t);
}
