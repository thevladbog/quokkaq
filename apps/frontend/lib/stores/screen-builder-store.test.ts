import { beforeEach, describe, expect, it } from 'vitest';
import { useScreenBuilderStore, newWidgetId } from './screen-builder-store';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';
import type { ScreenTemplate } from '@quokkaq/shared-types';

/** Legacy regions template — store migrates to cell grid on init. */
const legacyRegions: ScreenTemplate = {
  layoutKind: 'regions',
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
  useScreenBuilderStore.getState().initFrom(legacyRegions, 'info-heavy');
});

describe('useScreenBuilderStore', () => {
  it('initFrom migrates to cell grid and clears history', () => {
    const s = useScreenBuilderStore.getState();
    expect(s.template.layoutKind).toBe('cellGrid');
    expect(s.template.portrait.widgets.length).toBeGreaterThan(0);
    expect(s.template.landscape.widgets.length).toBeGreaterThan(0);
    expect(s.isDirty).toBe(false);
    expect(s.historyIndex).toBe(0);
  });

  it('addWidget inserts in both orientations and marks dirty', () => {
    const before =
      useScreenBuilderStore.getState().template.portrait.widgets.length;
    useScreenBuilderStore.getState().addWidget('rss-feed');
    const s = useScreenBuilderStore.getState();
    expect(s.template.portrait.widgets.length).toBe(before + 1);
    expect(s.template.landscape.widgets.length).toBe(before + 1);
    const w =
      s.template.portrait.widgets[s.template.portrait.widgets.length - 1]!;
    expect(w.type).toBe('rss-feed');
    expect(w.placement.col).toBeGreaterThanOrEqual(1);
    expect(s.isDirty).toBe(true);
  });

  it('moveWidget is a no-op for cell grid', () => {
    const before =
      useScreenBuilderStore.getState().template.portrait.widgets.length;
    useScreenBuilderStore.getState().moveWidget('w1', 'side', 0);
    expect(
      useScreenBuilderStore.getState().template.portrait.widgets.length
    ).toBe(before);
  });

  it('undo and redo', () => {
    const before =
      useScreenBuilderStore.getState().template.portrait.widgets.length;
    useScreenBuilderStore.getState().addWidget('clock');
    expect(
      useScreenBuilderStore.getState().template.portrait.widgets.length
    ).toBe(before + 1);
    useScreenBuilderStore.getState().undo();
    expect(
      useScreenBuilderStore.getState().template.portrait.widgets.length
    ).toBe(before);
    useScreenBuilderStore.getState().redo();
    expect(
      useScreenBuilderStore.getState().template.portrait.widgets.length
    ).toBe(before + 1);
  });

  it('resetToPreset', () => {
    useScreenBuilderStore.getState().resetToPreset('info-heavy');
    const t = useScreenBuilderStore.getState().template;
    expect(t.id).toBe(SCREEN_TEMPLATE_PRESETS['info-heavy']?.id);
    expect(t.portrait.widgets.length).toBeGreaterThan(0);
  });

  it('markSaved resets history', () => {
    useScreenBuilderStore.getState().addWidget('clock');
    const tpl = { ...useScreenBuilderStore.getState().template };
    useScreenBuilderStore.getState().markSaved(tpl);
    expect(useScreenBuilderStore.getState().isDirty).toBe(false);
    expect(useScreenBuilderStore.getState().historyIndex).toBe(0);
  });

  it('setRegionBackground is a no-op for cell grid', () => {
    useScreenBuilderStore.getState().setRegionBackground('main', '#111827');
    expect(useScreenBuilderStore.getState().template.layoutKind).toBe(
      'cellGrid'
    );
  });

  it('setGridDimensions clamps portrait columns', () => {
    useScreenBuilderStore.getState().setGridDimensions(8, 8, 'portrait');
    expect(useScreenBuilderStore.getState().template.portrait.columns).toBe(8);
    expect(useScreenBuilderStore.getState().template.portrait.rows).toBe(8);
  });
});

describe('newWidgetId', () => {
  it('returns id string', () => {
    const id = newWidgetId();
    expect(id).toMatch(/^w/);
  });
});
