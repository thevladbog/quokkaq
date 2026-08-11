import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScreenTemplateCellGrid,
  Ticket,
  Unit
} from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import { ScreenRendererCellGrid } from './screen-renderer-cell-grid';
import { ScreenGridRuntime } from './screen-grid-runtime';

const widgets: ScreenTemplateCellGrid['portrait']['widgets'] = [
  {
    id: 'header',
    type: 'screen-header',
    placement: { col: 1, row: 1, colSpan: 2, rowSpan: 1 },
    config: { showDate: false }
  },
  {
    id: 'called',
    type: 'called-tickets',
    placement: { col: 3, row: 1, colSpan: 2, rowSpan: 1 }
  },
  {
    id: 'stats',
    type: 'queue-stats',
    placement: { col: 5, row: 1, colSpan: 2, rowSpan: 1 }
  },
  {
    id: 'media',
    type: 'content-player',
    placement: { col: 1, row: 2, colSpan: 2, rowSpan: 1 }
  },
  {
    id: 'announcement',
    type: 'announcements',
    placement: { col: 3, row: 2, colSpan: 2, rowSpan: 1 }
  },
  {
    id: 'qr',
    type: 'screen-footer-qr',
    placement: { col: 5, row: 2, colSpan: 2, rowSpan: 1 },
    config: { showStats: false }
  }
];

const template: ScreenTemplateCellGrid = {
  layoutKind: 'cellGrid',
  id: 'characterization',
  portrait: { columns: 6, rows: 2, widgets },
  landscape: { columns: 6, rows: 2, widgets }
};

const unit: Unit = {
  id: 'unit-1',
  name: 'Presnensky office',
  code: 'PRE',
  companyId: 'company-1',
  timezone: 'Europe/Moscow',
  kind: 'subdivision',
  sortOrder: 0,
  skillBasedRoutingEnabled: false
};

const calledTicket: Ticket = {
  id: 'ticket-1',
  queueNumber: 'A-039',
  unitId: unit.id,
  serviceId: 'service-1',
  status: 'called',
  counter: { id: 'counter-3', name: 'Window 03' }
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    media: '(orientation: landscape)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ScreenRendererCellGrid legacy behavior', () => {
  it('renders the existing called-ticket, stats, header, media, announcement, and QR widgets', () => {
    render(
      <ScreenRendererCellGrid
        unitId={unit.id}
        locale='en'
        template={template}
        unit={unit}
        calledTickets={[calledTicket]}
        waitingTickets={[]}
        queueStatus={{
          queueLength: 7,
          estimatedWaitMinutes: 12,
          activeCounters: 3,
          servedToday: 41
        }}
        contentSlides={[
          {
            id: 'welcome',
            type: 'image',
            url: '/welcome.png',
            durationSec: 30
          }
        ]}
        defaultImageSeconds={10}
        announcements={[
          {
            id: 'notice',
            text: 'Bring your passport',
            style: 'info',
            priority: 1
          }
        ]}
        adBodyColor='#ffffff'
        historyLimit={3}
        currentTime={new Date('2026-07-21T11:32:00.000Z')}
        virtualQueueEnabled
        queueUrl='https://queue.example/join'
        forcedLayoutFace='portrait'
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Presnensky office' })
    ).toBeVisible();
    const calledWidget = document.querySelector(
      '[data-screen-widget="called-tickets"]'
    );
    expect(calledWidget).not.toBeNull();
    expect(
      within(calledWidget as HTMLElement).getAllByText('A-039')[0]
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Queue summary' })
    ).toHaveTextContent('7');
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      '/welcome.png'
    );
    expect(screen.getByText('Bring your passport')).toBeVisible();
    expect(screen.getByText('scanToJoinQueue')).toBeVisible();
    expect(
      document.querySelector('[data-screen-widget="screen-footer-qr"] svg')
    ).not.toBeNull();
  });

  it('renders a caller-selected face without reading browser orientation', () => {
    const matchMedia = vi.fn(() => ({
      matches: true,
      media: '(orientation: landscape)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    render(
      <ScreenGridRuntime
        unitId={unit.id}
        locale='en'
        face={{
          columns: 1,
          rows: 1,
          widgets: [
            {
              id: 'header-only',
              type: 'screen-header',
              placement: { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
              config: { title: 'Selected portrait face', showDate: false }
            }
          ]
        }}
        unit={unit}
        calledTickets={[]}
        waitingTickets={[]}
        queueStatus={null}
        contentSlides={[]}
        defaultImageSeconds={10}
        announcements={[]}
        adBodyColor='#ffffff'
        historyLimit={3}
        currentTime={new Date('2026-07-21T11:32:00.000Z')}
        virtualQueueEnabled={false}
        queueUrl=''
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Selected portrait face' })
    ).toBeVisible();
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('keeps legacy browser-orientation face selection in the compatibility wrapper', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      media: '(orientation: landscape)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const orientationTemplate: ScreenTemplateCellGrid = {
      layoutKind: 'cellGrid',
      id: 'orientation',
      portrait: {
        columns: 1,
        rows: 1,
        widgets: [
          {
            id: 'header',
            type: 'screen-header',
            placement: { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
            config: { title: 'Portrait title', showDate: false }
          }
        ]
      },
      landscape: {
        columns: 1,
        rows: 1,
        widgets: [
          {
            id: 'header',
            type: 'screen-header',
            placement: { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
            config: { title: 'Landscape title', showDate: false }
          }
        ]
      }
    };

    render(
      <ScreenRendererCellGrid
        unitId={unit.id}
        locale='en'
        template={orientationTemplate}
        unit={unit}
        calledTickets={[]}
        waitingTickets={[]}
        queueStatus={null}
        contentSlides={[]}
        defaultImageSeconds={10}
        announcements={[]}
        adBodyColor='#ffffff'
        historyLimit={3}
        currentTime={new Date('2026-07-21T11:32:00.000Z')}
        virtualQueueEnabled={false}
        queueUrl=''
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Landscape title' })
    ).toBeVisible();
    expect(screen.queryByText('Portrait title')).toBeNull();
  });
});
