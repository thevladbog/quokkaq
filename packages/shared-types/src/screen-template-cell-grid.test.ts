import { describe, expect, it } from 'vitest';
import { ScreenTemplateSchema, migrateRegionsToCellGrid } from './index';

describe('ScreenTemplateSchema cell grid', () => {
  it('accepts valid portrait and landscape faces', () => {
    const ok = {
      layoutKind: 'cellGrid' as const,
      id: 'tpl-1',
      portrait: {
        columns: 4,
        rows: 4,
        widgets: [
          {
            id: 'a',
            type: 'clock' as const,
            placement: { col: 1, row: 1, colSpan: 2, rowSpan: 2 }
          },
          {
            id: 'b',
            type: 'weather' as const,
            placement: { col: 3, row: 1, colSpan: 2, rowSpan: 2 },
            config: { feedId: 'f1' }
          }
        ]
      },
      landscape: {
        columns: 4,
        rows: 4,
        widgets: [
          {
            id: 'a',
            type: 'clock' as const,
            placement: { col: 1, row: 1, colSpan: 2, rowSpan: 2 }
          },
          {
            id: 'b',
            type: 'weather' as const,
            placement: { col: 3, row: 1, colSpan: 2, rowSpan: 2 },
            config: { feedId: 'f1' }
          }
        ]
      }
    };
    const r = ScreenTemplateSchema.safeParse(ok);
    expect(r.success).toBe(true);
  });

  it('preserves widget config (e.g. weather feedId) when layoutKind is last in JSON', () => {
    const def = {
      id: '0c92017e-e3f8-4d4c-9850-e4dc405a4e5f',
      portrait: {
        rows: 24,
        columns: 12,
        widgets: [
          {
            id: 'w6-weather',
            type: 'weather' as const,
            config: { feedId: '1eb10933-e5bb-4224-83d5-d8e3220f8f31' },
            placement: { col: 1, row: 5, colSpan: 12, rowSpan: 1 }
          }
        ]
      },
      landscape: {
        rows: 24,
        columns: 12,
        widgets: [
          {
            id: 'w6-weather',
            type: 'weather' as const,
            config: { feedId: '1eb10933-e5bb-4224-83d5-d8e3220f8f31' },
            placement: { col: 9, row: 5, colSpan: 4, rowSpan: 3 }
          }
        ]
      },
      layoutKind: 'cellGrid' as const
    };
    const r = ScreenTemplateSchema.safeParse(def);
    expect(r.success).toBe(true);
    if (!r.success) return;
    const w = r.data.portrait.widgets.find((x) => x.id === 'w6-weather');
    expect((w?.config as { feedId?: string } | undefined)?.feedId).toBe(
      '1eb10933-e5bb-4224-83d5-d8e3220f8f31'
    );
  });

  it('rejects overlapping widgets in the same face', () => {
    const bad = {
      layoutKind: 'cellGrid' as const,
      id: 'tpl-x',
      portrait: {
        columns: 4,
        rows: 4,
        widgets: [
          {
            id: 'a',
            type: 'clock' as const,
            placement: { col: 1, row: 1, colSpan: 2, rowSpan: 2 }
          },
          {
            id: 'b',
            type: 'weather' as const,
            placement: { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
            config: {}
          }
        ]
      },
      landscape: {
        columns: 4,
        rows: 4,
        widgets: [
          {
            id: 'a',
            type: 'clock' as const,
            placement: { col: 1, row: 1, colSpan: 1, rowSpan: 1 }
          },
          {
            id: 'b',
            type: 'weather' as const,
            placement: { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
            config: {}
          }
        ]
      }
    };
    const r = ScreenTemplateSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });
});

describe('migrateRegionsToCellGrid', () => {
  it('produces a parseable cell-grid template for a two-column grid', () => {
    const raw = migrateRegionsToCellGrid(
      'legacy-1',
      {
        type: 'grid',
        regions: [
          { id: 'main', size: '1fr' },
          { id: 'side', size: '30%' }
        ]
      },
      [
        { id: 'w1', type: 'clock', regionId: 'main', config: {} },
        { id: 'w2', type: 'queue-stats', regionId: 'side', config: {} }
      ]
    );
    const r = ScreenTemplateSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.layoutKind).toBe('cellGrid');
    }
  });
});
