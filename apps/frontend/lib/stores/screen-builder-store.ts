import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { arrayMove } from '@dnd-kit/sortable';
import {
  ScreenTemplateSchema,
  type ScreenTemplate,
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
  | { kind: 'region'; id: string }
  | { kind: 'widget'; id: string };

const defaultForLayout = (
  type: ScreenTemplate['layout']['type']
): ScreenTemplate => {
  const id = 'custom-template';
  if (type === 'grid') {
    return {
      id,
      layout: {
        type: 'grid',
        regions: [
          { id: 'main', area: 'main', size: '1fr' },
          { id: 'side', area: 'side', size: 'min(24rem, 32%)' }
        ]
      },
      widgets: [
        {
          id: newWidgetId(),
          type: 'called-tickets',
          regionId: 'main',
          config: {}
        }
      ]
    };
  }
  if (type === 'fullscreen') {
    return {
      id,
      layout: {
        type: 'fullscreen',
        regions: [{ id: 'full', area: 'full', size: '1fr' }]
      },
      widgets: [
        {
          id: newWidgetId(),
          type: 'content-player',
          regionId: 'full',
          config: { overlayTickets: true } as Record<string, unknown>
        }
      ]
    };
  }
  return {
    id,
    layout: {
      type: 'grid',
      regions: [
        { id: 'main', area: 'main', size: '1fr' },
        { id: 'side', area: 'side', size: 'min(24rem, 32%)' }
      ]
    },
    widgets: []
  };
};

function defaultConfigForType(type: ScreenWidgetType): Record<string, unknown> {
  switch (type) {
    case 'content-player':
      return { overlayTickets: true };
    case 'rss-feed':
    case 'weather':
      return { feedId: '' };
    case 'custom-html':
      return { html: '' };
    default:
      return {};
  }
}

/**
 * Rebuilds widget list: iterate regions in layout order, append widgets in
 * the order they appear in `orderWithinRegion` (or creation order in `all`).
 */
function orderWidgetsList(
  template: ScreenTemplate,
  all: ScreenTemplate['widgets']
): ScreenTemplate['widgets'] {
  const order = template.layout.regions.map((r) => r.id);
  const inRegion = (rid: string) => all.filter((w) => w.regionId === rid);
  return order.flatMap((rid) => inRegion(rid));
}

function commitHistory(s: {
  template: ScreenTemplate;
  history: ScreenTemplate[];
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
  template: ScreenTemplate;
  sourcePresetId: string | null;
  history: ScreenTemplate[];
  historyIndex: number;
  selection: BuilderSelection;
  zoom: number;
  isDirty: boolean;
  initFrom: (t: ScreenTemplate, presetId: string | null) => void;
  markSaved: (t: ScreenTemplate) => void;
  resetToPreset: (presetId: keyof typeof SCREEN_TEMPLATE_PRESETS) => void;
  setLayoutType: (type: ScreenTemplate['layout']['type']) => void;
  setTemplateId: (id: string) => void;
  setRegionSize: (regionId: string, size: string) => void;
  setRegionPanelStyle: (
    regionId: string,
    style: 'default' | 'card' | 'scrollPadded' | 'splitSection' | null
  ) => void;
  setRegionBackground: (regionId: string, color: string | null) => void;
  addWidget: (
    type: ScreenWidgetType,
    regionId: string,
    atIndex: number
  ) => void;
  removeWidget: (widgetId: string) => void;
  moveWidget: (
    widgetId: string,
    targetRegionId: string,
    atIndex: number
  ) => void;
  reorderInRegion: (
    regionId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  updateWidget: (
    widgetId: string,
    updates: Partial<ScreenTemplate['widgets'][number]>
  ) => void;
  duplicateWidget: (widgetId: string) => void;
  nudgePosition: (widgetId: string, dx: number, dy: number) => void;
  setSelection: (s: BuilderSelection) => void;
  setZoom: (z: number) => void;
  undo: () => void;
  redo: () => void;
};

function morphLayoutType(
  prev: ScreenTemplate,
  newType: ScreenTemplate['layout']['type']
): ScreenTemplate {
  const t = clone(prev);
  t.layout = { ...t.layout, type: newType };
  if (newType === 'fullscreen') {
    t.layout.regions = [{ id: 'full', area: 'full', size: '1fr' }];
    t.widgets = t.widgets.map((w) => ({ ...w, regionId: 'full' }));
  } else if (newType === 'grid' && t.layout.regions.length < 2) {
    t.layout.regions = defaultForLayout('grid').layout.regions;
    t.widgets = t.widgets.map((w) => {
      if (w.regionId === 'full' || w.regionId === 'a' || w.regionId === 'b') {
        return { ...w, regionId: 'main' };
      }
      return w;
    });
  } else if (newType === 'split-h' || newType === 'split-v') {
    t.layout.regions = [
      { id: 'a', area: 'a', size: '1fr' },
      { id: 'b', area: 'b', size: '1fr' }
    ];
    t.widgets = t.widgets.map((w, i) => ({
      ...w,
      regionId: i % 2 === 0 ? 'a' : 'b'
    }));
  }
  t.widgets = orderWidgetsList(t, t.widgets);
  return t;
}

export const useScreenBuilderStore = create<BuilderState>()(
  devtools(
    immer((set) => ({
      template: defaultForLayout('grid'),
      sourcePresetId: null,
      history: [clone(defaultForLayout('grid'))],
      historyIndex: 0,
      selection: { kind: 'none' } as BuilderSelection,
      zoom: 1,
      isDirty: false,
      initFrom: (t, presetId) => {
        set((s) => {
          const c = orderWidgetsList(t, t.widgets);
          t.widgets = c;
          s.template = clone(t);
          s.sourcePresetId = presetId;
          s.history = [clone(s.template)];
          s.historyIndex = 0;
          s.selection = { kind: 'none' };
          s.isDirty = false;
        });
      },
      markSaved: (t) => {
        set((s) => {
          s.template = {
            ...t,
            widgets: orderWidgetsList(t, t.widgets)
          };
          s.isDirty = false;
          s.history = [clone(s.template)];
          s.historyIndex = 0;
        });
      },
      resetToPreset: (pid) => {
        set((s) => {
          const p = SCREEN_TEMPLATE_PRESETS[pid];
          if (!p) return;
          s.template = {
            ...clone(p),
            widgets: orderWidgetsList(p, p.widgets)
          };
          s.sourcePresetId = String(pid);
          s.selection = { kind: 'none' };
          s.history = [clone(s.template)];
          s.historyIndex = 0;
          s.isDirty = true;
        });
      },
      setLayoutType: (type) => {
        set((s) => {
          s.template = morphLayoutType(s.template, type);
          s.selection = { kind: 'none' };
          commitHistory(s);
        });
      },
      setTemplateId: (id) => {
        set((s) => {
          s.template.id = id;
          commitHistory(s);
        });
      },
      setRegionSize: (regionId, size) => {
        set((s) => {
          const r = s.template.layout.regions.find((x) => x.id === regionId);
          if (r) r.size = size;
          commitHistory(s);
        });
      },
      setRegionPanelStyle: (regionId, st) => {
        set((s) => {
          const r = s.template.layout.regions.find((x) => x.id === regionId);
          if (!r) return;
          r.panelStyle = st ?? undefined;
          commitHistory(s);
        });
      },
      setRegionBackground: (regionId, color) => {
        set((s) => {
          const r = s.template.layout.regions.find((x) => x.id === regionId);
          if (!r) return;
          r.backgroundColor = color ? color : undefined;
          commitHistory(s);
        });
      },
      addWidget: (type, regionId, atIndex) => {
        set((s) => {
          const w: ScreenTemplate['widgets'][number] = {
            id: newWidgetId(),
            type,
            regionId,
            config: defaultConfigForType(type)
          };
          const byR = (rid: string) =>
            s.template.widgets.filter((x) => x.regionId === rid);
          const inR = [...byR(regionId)];
          const i = Math.max(0, Math.min(atIndex, inR.length));
          inR.splice(i, 0, w);
          const out: typeof s.template.widgets = [];
          for (const reg of s.template.layout.regions) {
            if (reg.id === regionId) {
              inR.forEach((x) => {
                out.push(x);
              });
            } else {
              for (const x of byR(reg.id)) {
                out.push(x);
              }
            }
          }
          s.template.widgets = out;
          s.selection = { kind: 'widget', id: w.id };
          commitHistory(s);
        });
      },
      removeWidget: (widgetId) => {
        set((s) => {
          s.template.widgets = s.template.widgets.filter(
            (w) => w.id !== widgetId
          );
          if (s.selection.kind === 'widget' && s.selection.id === widgetId) {
            s.selection = { kind: 'none' };
          }
          commitHistory(s);
        });
      },
      moveWidget: (widgetId, targetRegionId, atIndex) => {
        set((s) => {
          const w = s.template.widgets.find((x) => x.id === widgetId);
          if (!w) return;
          w.regionId = targetRegionId;
          const allBut = s.template.widgets.filter((x) => x.id !== widgetId);
          const inTarget = allBut.filter((x) => x.regionId === targetRegionId);
          const i = Math.max(0, Math.min(atIndex, inTarget.length));
          const inTarget2 = [...inTarget.slice(0, i), w, ...inTarget.slice(i)];
          const out: typeof s.template.widgets = [];
          for (const reg of s.template.layout.regions) {
            if (reg.id === targetRegionId) {
              inTarget2.forEach((x) => {
                out.push(x);
              });
            } else {
              for (const x of allBut) {
                if (x.regionId === reg.id) out.push(x);
              }
            }
          }
          s.template.widgets = out;
          commitHistory(s);
        });
      },
      reorderInRegion: (regionId, fromIndex, toIndex) => {
        set((s) => {
          const byR = (rid: string) =>
            s.template.widgets.filter((w) => w.regionId === rid);
          const inR = byR(regionId);
          if (inR.length === 0) return;
          const re = arrayMove(inR, fromIndex, toIndex);
          const out: typeof s.template.widgets = [];
          for (const reg of s.template.layout.regions) {
            if (reg.id === regionId) {
              for (const w of re) {
                out.push(w);
              }
            } else {
              for (const w of byR(reg.id)) {
                out.push(w);
              }
            }
          }
          s.template.widgets = out;
          commitHistory(s);
        });
      },
      updateWidget: (widgetId, updates) => {
        set((s) => {
          const w = s.template.widgets.find((x) => x.id === widgetId);
          if (!w) return;
          if (updates.type != null) w.type = updates.type;
          if (updates.regionId != null) w.regionId = updates.regionId;
          if (updates.config != null) {
            w.config = { ...(w.config ?? {}), ...updates.config };
          }
          if (updates.position != null) {
            w.position = { ...w.position, ...updates.position };
          }
          if (updates.size != null) {
            w.size = { ...w.size, ...updates.size };
          }
          if (updates.style != null) {
            w.style = { ...w.style, ...updates.style };
          }
          s.template.widgets = orderWidgetsList(s.template, s.template.widgets);
          commitHistory(s);
        });
      },
      duplicateWidget: (widgetId) => {
        set((s) => {
          const w = s.template.widgets.find((x) => x.id === widgetId);
          if (!w) return;
          const copy: ScreenTemplate['widgets'][number] = {
            ...clone(w),
            id: newWidgetId()
          };
          const byR = (rid: string) =>
            s.template.widgets.filter((x) => x.regionId === rid);
          const inR = byR(w.regionId);
          const pos = inR.findIndex((x) => x.id === w.id) + 1;
          const inR2 = [...inR];
          inR2.splice(pos, 0, copy);
          const out: typeof s.template.widgets = [];
          for (const reg of s.template.layout.regions) {
            if (reg.id === w.regionId) {
              inR2.forEach((x) => {
                out.push(x);
              });
            } else {
              for (const x of byR(reg.id)) {
                out.push(x);
              }
            }
          }
          s.template.widgets = out;
          s.selection = { kind: 'widget', id: copy.id };
          commitHistory(s);
        });
      },
      nudgePosition: (widgetId, dx, dy) => {
        set((s) => {
          const w = s.template.widgets.find((x) => x.id === widgetId);
          if (!w) return;
          const p = w.position ?? { x: 0, y: 0 };
          w.position = { x: (p.x ?? 0) + dx, y: (p.y ?? 0) + dy };
          commitHistory(s);
        });
      },
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
      }
    }))
  )
);

export function validateBuilderTemplate(t: unknown) {
  return ScreenTemplateSchema.safeParse(t);
}
