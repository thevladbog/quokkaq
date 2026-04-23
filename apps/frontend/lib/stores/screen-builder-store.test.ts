import { beforeEach, describe, expect, it } from 'vitest';
import { useScreenBuilderStore, newWidgetId } from './screen-builder-store';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';
import type { ScreenTemplate } from '@quokkaq/shared-types';

const base: ScreenTemplate = {
  id: 't1',
  layout: {
    type: 'grid',
    regions: [
      { id: 'main', area: 'main', size: '1fr' },
      { id: 'side', area: 'side', size: '30%' }
    ]
  },
  widgets: [
    { id: 'w1', type: 'clock', regionId: 'main', config: {} },
    { id: 'w2', type: 'weather', regionId: 'side', config: { feedId: 'f' } }
  ]
};

beforeEach(() => {
  useScreenBuilderStore.getState().initFrom(base, 'info-heavy');
});

describe('useScreenBuilderStore', () => {
  it('initFrom orders widgets and clears history', () => {
    const s = useScreenBuilderStore.getState();
    expect(s.template.widgets.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(s.isDirty).toBe(false);
    expect(s.historyIndex).toBe(0);
  });

  it('addWidget inserts in region and marks dirty', () => {
    useScreenBuilderStore.getState().addWidget('rss-feed', 'main', 0);
    const w = useScreenBuilderStore.getState().template.widgets[0]!;
    expect(w.type).toBe('rss-feed');
    expect(w.regionId).toBe('main');
    expect(useScreenBuilderStore.getState().isDirty).toBe(true);
  });

  it('moveWidget across regions', () => {
    useScreenBuilderStore.getState().moveWidget('w1', 'side', 0);
    const s = useScreenBuilderStore.getState();
    const side = s.template.widgets.filter((w) => w.regionId === 'side');
    expect(side.some((w) => w.id === 'w1')).toBe(true);
  });

  it('undo and redo', () => {
    useScreenBuilderStore.getState().addWidget('clock', 'main', 0);
    const h1 = useScreenBuilderStore.getState().template.widgets.length;
    expect(h1).toBeGreaterThan(2);
    useScreenBuilderStore.getState().undo();
    expect(useScreenBuilderStore.getState().template.widgets.length).toBe(2);
    useScreenBuilderStore.getState().redo();
    expect(useScreenBuilderStore.getState().template.widgets.length).toBe(h1);
  });

  it('resetToPreset', () => {
    useScreenBuilderStore.getState().resetToPreset('info-heavy');
    const t = useScreenBuilderStore.getState().template;
    expect(t.id).toBe(SCREEN_TEMPLATE_PRESETS['info-heavy']?.id);
    expect(t.widgets.length).toBeGreaterThan(0);
  });

  it('markSaved resets history', () => {
    useScreenBuilderStore.getState().addWidget('clock', 'main', 0);
    const tpl = { ...useScreenBuilderStore.getState().template };
    useScreenBuilderStore.getState().markSaved(tpl);
    expect(useScreenBuilderStore.getState().isDirty).toBe(false);
    expect(useScreenBuilderStore.getState().historyIndex).toBe(0);
  });

  it('setRegionBackground', () => {
    useScreenBuilderStore.getState().setRegionBackground('main', '#111827');
    const r = useScreenBuilderStore
      .getState()
      .template.layout.regions.find((x) => x.id === 'main');
    expect(r?.backgroundColor).toBe('#111827');
    useScreenBuilderStore.getState().setRegionBackground('main', null);
    const r2 = useScreenBuilderStore
      .getState()
      .template.layout.regions.find((x) => x.id === 'main');
    expect(r2?.backgroundColor).toBeUndefined();
  });
});

describe('newWidgetId', () => {
  it('returns id string', () => {
    const id = newWidgetId();
    expect(id).toMatch(/^w/);
  });
});
