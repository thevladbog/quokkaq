import type { ScreenTemplate } from '@quokkaq/shared-types';

/** Built-in screen layouts for `/screen/[unitId]`. */
export const SCREEN_TEMPLATE_PRESETS: Record<string, ScreenTemplate> = {
  'info-heavy': {
    id: 'info-heavy',
    layout: {
      type: 'grid',
      regions: [
        { id: 'main', area: 'main', size: '1fr', panelStyle: 'default' },
        {
          id: 'side',
          area: 'side',
          size: '420px',
          panelStyle: 'scrollPadded'
        }
      ]
    },
    widgets: [
      { id: 'w1', type: 'called-tickets', regionId: 'main', config: {} },
      { id: 'w2', type: 'clock', regionId: 'side', config: {} },
      { id: 'w3', type: 'eta-display', regionId: 'side', config: {} },
      { id: 'w4', type: 'queue-stats', regionId: 'side', config: {} },
      { id: 'w5', type: 'announcements', regionId: 'side', config: {} }
    ]
  },
  'media-focus': {
    id: 'media-focus',
    layout: {
      type: 'fullscreen',
      regions: [{ id: 'full', area: 'full', size: '1fr' }]
    },
    widgets: [
      {
        id: 'w1',
        type: 'content-player',
        regionId: 'full',
        config: { overlayTickets: true }
      }
    ]
  },
  'split-3': {
    id: 'split-3',
    layout: {
      type: 'grid',
      regions: [
        { id: 'top', area: 'top', size: '40%', panelStyle: 'splitSection' },
        { id: 'mid', area: 'mid', size: '35%', panelStyle: 'card' },
        {
          id: 'bottom',
          area: 'bottom',
          size: '25%',
          panelStyle: 'splitSection'
        }
      ]
    },
    widgets: [
      { id: 'w1', type: 'called-tickets', regionId: 'top', config: {} },
      { id: 'w2', type: 'content-player', regionId: 'mid', config: {} },
      { id: 'w3', type: 'rss-feed', regionId: 'bottom', config: { feedId: '' } }
    ]
  }
};

export function getScreenTemplatePreset(id: string): ScreenTemplate | null {
  return SCREEN_TEMPLATE_PRESETS[id] ?? null;
}
