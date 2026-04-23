import type {
  ScreenTemplate,
  ScreenTemplateCellGrid
} from '@quokkaq/shared-types';

/** Built-in cell-grid layouts (same ids in portrait and landscape; placements may differ). */
export const SCREEN_TEMPLATE_PRESETS: Record<string, ScreenTemplateCellGrid> = {
  'info-heavy': {
    layoutKind: 'cellGrid',
    id: 'info-heavy',
    portrait: {
      columns: 12,
      rows: 12,
      widgets: [
        {
          id: 'w1',
          type: 'called-tickets',
          placement: { col: 1, row: 1, colSpan: 8, rowSpan: 12 },
          config: {}
        },
        {
          id: 'w2',
          type: 'clock',
          placement: { col: 9, row: 1, colSpan: 4, rowSpan: 2 },
          config: {}
        },
        {
          id: 'w6-weather',
          type: 'weather',
          placement: { col: 9, row: 3, colSpan: 4, rowSpan: 2 },
          config: { feedId: '' }
        },
        {
          id: 'w4',
          type: 'queue-stats',
          placement: { col: 9, row: 5, colSpan: 4, rowSpan: 4 },
          config: {}
        },
        {
          id: 'w5',
          type: 'announcements',
          placement: { col: 9, row: 9, colSpan: 4, rowSpan: 4 },
          config: {}
        }
      ]
    },
    landscape: {
      columns: 12,
      rows: 12,
      widgets: [
        {
          id: 'w1',
          type: 'called-tickets',
          placement: { col: 1, row: 1, colSpan: 8, rowSpan: 12 },
          config: {}
        },
        {
          id: 'w2',
          type: 'clock',
          placement: { col: 9, row: 1, colSpan: 4, rowSpan: 2 },
          config: {}
        },
        {
          id: 'w6-weather',
          type: 'weather',
          placement: { col: 9, row: 3, colSpan: 4, rowSpan: 2 },
          config: { feedId: '' }
        },
        {
          id: 'w4',
          type: 'queue-stats',
          placement: { col: 9, row: 5, colSpan: 4, rowSpan: 4 },
          config: {}
        },
        {
          id: 'w5',
          type: 'announcements',
          placement: { col: 9, row: 9, colSpan: 4, rowSpan: 4 },
          config: {}
        }
      ]
    }
  },
  'media-focus': {
    layoutKind: 'cellGrid',
    id: 'media-focus',
    portrait: {
      columns: 12,
      rows: 12,
      widgets: [
        {
          id: 'w1',
          type: 'content-player',
          placement: { col: 1, row: 1, colSpan: 12, rowSpan: 12 },
          config: { overlayTickets: true }
        }
      ]
    },
    landscape: {
      columns: 12,
      rows: 12,
      widgets: [
        {
          id: 'w1',
          type: 'content-player',
          placement: { col: 1, row: 1, colSpan: 12, rowSpan: 12 },
          config: { overlayTickets: true }
        }
      ]
    }
  },
  'split-3': {
    layoutKind: 'cellGrid',
    id: 'split-3',
    portrait: {
      columns: 12,
      rows: 12,
      widgets: [
        {
          id: 'w1',
          type: 'called-tickets',
          placement: { col: 1, row: 1, colSpan: 12, rowSpan: 4 },
          config: {}
        },
        {
          id: 'w2',
          type: 'content-player',
          placement: { col: 1, row: 5, colSpan: 12, rowSpan: 4 },
          config: { overlayTickets: false }
        },
        {
          id: 'w3',
          type: 'rss-feed',
          placement: { col: 1, row: 9, colSpan: 12, rowSpan: 4 },
          config: { feedId: '' }
        }
      ]
    },
    landscape: {
      columns: 12,
      rows: 12,
      widgets: [
        {
          id: 'w1',
          type: 'called-tickets',
          placement: { col: 1, row: 1, colSpan: 6, rowSpan: 12 },
          config: {}
        },
        {
          id: 'w2',
          type: 'content-player',
          placement: { col: 7, row: 1, colSpan: 6, rowSpan: 6 },
          config: { overlayTickets: false }
        },
        {
          id: 'w3',
          type: 'rss-feed',
          placement: { col: 7, row: 7, colSpan: 6, rowSpan: 6 },
          config: { feedId: '' }
        }
      ]
    }
  }
};

export function getScreenTemplatePreset(id: string): ScreenTemplate | null {
  return SCREEN_TEMPLATE_PRESETS[id] ?? null;
}
