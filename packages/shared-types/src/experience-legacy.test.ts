import { describe, expect, it } from 'vitest';
import type { KioskConfig, ServiceModel } from './index';
import { ExperienceTemplateSchema } from './experience-template';
import {
  experienceFromKioskConfig,
  experienceFromScreenTemplate,
  normalizeExperienceInput
} from './experience-legacy';

function service(
  id: string,
  overrides: Partial<ServiceModel> = {}
): ServiceModel {
  return {
    id,
    unitId: 'unit-1',
    name: `Service ${id}`,
    isLeaf: true,
    ...overrides
  };
}

function kioskConfig(overrides: Partial<KioskConfig> = {}): KioskConfig {
  return {
    kioskAttractInactivityMode: 'off',
    ...overrides
  };
}

function pageById(
  template: ReturnType<typeof experienceFromKioskConfig>,
  id: string
) {
  return template.pages.find((page) => page.id === id);
}

function expectParsed(template: unknown) {
  expect(ExperienceTemplateSchema.safeParse(template).success).toBe(true);
}

describe('legacy experience normalization', () => {
  it('normalizes a bare regions signage template into one queue-display page', () => {
    const legacy = {
      id: 'lobby-screen',
      layout: {
        type: 'fullscreen' as const,
        regions: [{ id: 'main', area: 'main', size: '1fr' }]
      },
      widgets: [
        {
          id: 'calls-panel',
          type: 'called-tickets' as const,
          regionId: 'main',
          config: { limit: 6 }
        }
      ]
    };

    const normalized = experienceFromScreenTemplate(legacy);

    expect(normalized).toMatchObject({
      schemaVersion: 1,
      id: 'lobby-screen',
      surface: 'queue-display',
      startPageId: 'queue-display'
    });
    expect(normalized.pages).toHaveLength(1);
    expect(normalized.pages[0]).toMatchObject({
      id: 'queue-display',
      widgets: [
        {
          id: 'display-called-tickets-calls-panel',
          type: 'called-tickets',
          config: { limit: 6 }
        }
      ]
    });
    expectParsed(normalized);
  });

  it('normalizes a bare cell-grid signage template with complete portrait and landscape layouts', () => {
    const legacy = {
      id: 'entry-display',
      portrait: {
        columns: 4,
        rows: 6,
        widgets: [
          {
            id: 'entry-clock',
            type: 'clock' as const,
            placement: { col: 1, row: 1, colSpan: 4, rowSpan: 1 }
          }
        ]
      },
      landscape: {
        columns: 6,
        rows: 4,
        widgets: [
          {
            id: 'entry-clock',
            type: 'clock' as const,
            placement: { col: 5, row: 1, colSpan: 2, rowSpan: 1 }
          }
        ]
      }
    };

    const normalized = normalizeExperienceInput(legacy);

    expect(normalized.surface).toBe('queue-display');
    expect(normalized.variants.map((variant) => variant.id)).toEqual([
      'signage-portrait',
      'signage-landscape'
    ]);
    expect(normalized.pages).toHaveLength(1);
    expect(
      normalized.pages[0]?.layouts['signage-portrait']?.placements
    ).toEqual({
      'display-clock-entry-clock': {
        col: 1,
        row: 1,
        colSpan: 4,
        rowSpan: 1
      }
    });
    expect(
      normalized.pages[0]?.layouts['signage-landscape']?.placements
    ).toEqual({
      'display-clock-entry-clock': {
        col: 5,
        row: 1,
        colSpan: 2,
        rowSpan: 1
      }
    });
    expectParsed(normalized);
  });

  it('keeps colliding legacy widget slugs distinct without using array indexes', () => {
    const legacy = {
      id: 'collision-display',
      portrait: {
        columns: 4,
        rows: 6,
        widgets: [
          {
            id: 'entry clock',
            type: 'clock' as const,
            placement: { col: 1, row: 1, colSpan: 2, rowSpan: 1 }
          },
          {
            id: 'entry/clock',
            type: 'clock' as const,
            placement: { col: 3, row: 1, colSpan: 2, rowSpan: 1 }
          }
        ]
      },
      landscape: {
        columns: 4,
        rows: 6,
        widgets: [
          {
            id: 'entry clock',
            type: 'clock' as const,
            placement: { col: 1, row: 1, colSpan: 2, rowSpan: 1 }
          },
          {
            id: 'entry/clock',
            type: 'clock' as const,
            placement: { col: 3, row: 1, colSpan: 2, rowSpan: 1 }
          }
        ]
      }
    };

    const normalized = experienceFromScreenTemplate(legacy);
    const ids = normalized.pages[0]?.widgets.map((widget) => widget.id) ?? [];

    expect(new Set(ids)).toHaveLength(2);
    expect(ids).not.toContain('display-clock-entry-clock-0');
    expectParsed(normalized);
  });

  it('returns an already-versioned experience as an equivalent, unmodified value', () => {
    const experience = {
      schemaVersion: 1 as const,
      id: 'already-versioned',
      surface: 'queue-display' as const,
      startPageId: 'queue-display',
      variants: [
        {
          id: 'signage-portrait',
          profile: {
            id: 'signage-1080x1920',
            name: 'Signage 1080×1920',
            width: 1080,
            height: 1920,
            interactionMode: 'non-touch' as const,
            viewingDistance: 'far' as const,
            safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
          },
          grid: { columns: 6, rows: 12 }
        }
      ],
      pages: [
        {
          id: 'queue-display',
          name: 'Queue display',
          widgets: [
            { id: 'display-clock', type: 'clock' as const, config: {} }
          ],
          layouts: {
            'signage-portrait': {
              placements: {
                'display-clock': { col: 1, row: 1, colSpan: 6, rowSpan: 2 }
              }
            }
          }
        }
      ]
    };
    const snapshot = structuredClone(experience);

    const normalized = normalizeExperienceInput(experience);

    expect(normalized).toEqual(experience);
    expect(normalized).not.toBe(experience);
    expect(experience).toEqual(snapshot);
    expect(normalizeExperienceInput(normalized)).toEqual(normalized);
    expectParsed(normalized);
  });
});

describe('legacy kiosk derivation', () => {
  it('uses semantic category navigation for nested services without index-derived widget ids', () => {
    const services = [
      service('consultations', {
        name: 'Consultations',
        isLeaf: false,
        children: [
          service('consultation-general', {
            parentId: 'consultations',
            name: 'General consultation'
          })
        ]
      }),
      service('payments', {
        name: 'Payments',
        isLeaf: false,
        children: [
          service('payment-card', {
            parentId: 'payments',
            name: 'Card payment'
          })
        ]
      })
    ];

    const normalized = experienceFromKioskConfig(kioskConfig(), services);
    const picker = pageById(normalized, 'services')?.widgets.find(
      (widget) => widget.id === 'service-picker'
    );

    expect(picker).toMatchObject({
      type: 'service-picker',
      config: {
        catalog: {
          navigation: 'categories',
          rootCategoryIds: ['consultations', 'payments']
        }
      }
    });
    expect(
      normalized.pages
        .flatMap((page) => page.widgets)
        .map((widget) => widget.id)
    ).not.toContain('service-0');
    expectParsed(normalized);
  });

  it.each([
    { count: 2, grid: { rows: 1, columns: 2 } },
    { count: 6, grid: { rows: 2, columns: 3 } },
    { count: 12, grid: { rows: 4, columns: 3 } }
  ])(
    'derives the legacy auto grid for $count services without pagination',
    ({ count, grid }) => {
      const normalized = experienceFromKioskConfig(
        kioskConfig({ serviceGridLayout: 'auto' }),
        Array.from({ length: count }, (_, index) =>
          service(`service-${index + 1}`)
        )
      );
      const picker = pageById(normalized, 'services')?.widgets.find(
        (widget) => widget.id === 'service-picker'
      );

      expect(picker?.config).toMatchObject({
        presentation: { mode: 'auto', grid },
        pagination: { enabled: false, pageSize: 9, threshold: 12 }
      });
      expectParsed(normalized);
    }
  );

  it('derives pagination for 30 services instead of a scrolling 30-tile page', () => {
    const normalized = experienceFromKioskConfig(
      kioskConfig({ serviceGridLayout: 'auto' }),
      Array.from({ length: 30 }, (_, index) => service(`service-${index + 1}`))
    );
    const picker = pageById(normalized, 'services')?.widgets.find(
      (widget) => widget.id === 'service-picker'
    );

    expect(picker?.config).toMatchObject({
      presentation: { mode: 'auto', grid: { rows: 3, columns: 3 } },
      pagination: { enabled: true, pageSize: 9, threshold: 12 }
    });
    expect(normalized.pages).toHaveLength(2);
    expect(normalized.pages[0]?.widgets).toHaveLength(1);
    expectParsed(normalized);
  });

  it('preserves manual grid intent without copying per-tile colors into the experience', () => {
    const normalized = experienceFromKioskConfig(
      kioskConfig({ serviceGridLayout: 'manual' }),
      [
        service('payments', {
          gridRow: 2,
          gridCol: 3,
          gridRowSpan: 2,
          gridColSpan: 1,
          backgroundColor: '#f00000',
          textColor: '#ffffff'
        })
      ]
    );
    const picker = pageById(normalized, 'services')?.widgets.find(
      (widget) => widget.id === 'service-picker'
    );

    expect(picker?.config).toMatchObject({
      presentation: {
        mode: 'manual',
        grid: { rows: 8, columns: 8 },
        placements: [
          {
            serviceId: 'payments',
            row: 2,
            col: 3,
            rowSpan: 2,
            colSpan: 1
          }
        ]
      }
    });
    expect(JSON.stringify(normalized)).not.toContain('#f00000');
    expect(JSON.stringify(normalized)).not.toContain('#ffffff');
    expectParsed(normalized);
  });

  it('derives attract and appointment pages with the exact stable page ids', () => {
    const normalized = experienceFromKioskConfig(
      kioskConfig({
        kioskAttractInactivityMode: 'session_then_attract',
        isAppointmentCheckinEnabled: true,
        isAppointmentPhoneLookupEnabled: true
      }),
      [service('appointments')]
    );

    expect(normalized.startPageId).toBe('attract');
    expect(normalized.pages.map((page) => page.id)).toEqual([
      'attract',
      'services',
      'appointment',
      'success'
    ]);
    expect(pageById(normalized, 'appointment')?.widgets).toMatchObject([
      {
        id: 'appointment-checkin',
        type: 'ticket-form',
        config: { mode: 'appointment-checkin', phoneLookup: true }
      }
    ]);
    expect(
      pageById(normalized, 'services')?.widgets.find(
        (widget) => widget.id === 'appointment-entry'
      )
    ).toMatchObject({
      type: 'rich-info',
      actions: [{ type: 'navigate', toPageId: 'appointment' }]
    });
    expectParsed(normalized);
  });

  it.each(['phone', 'qr', 'document', 'custom', 'login', 'badge'] as const)(
    'keeps legacy %s identification canonical on the identity page',
    (identificationMode) => {
      const normalized = experienceFromKioskConfig(kioskConfig(), [
        service('identified', { identificationMode })
      ]);
      const identity = pageById(normalized, 'identity');

      expect(identity?.widgets).toMatchObject([
        {
          id: 'legacy-identification',
          type: 'identify',
          config: { source: 'legacy-service-identification' }
        }
      ]);
      expect(normalized.flowPages?.identityPageId).toBe('identity');
      expect(JSON.stringify(normalized)).not.toContain('"behavior"');
      expectParsed(normalized);
    }
  );

  it('does not add a language switcher when only one active locale is configured', () => {
    const normalized = experienceFromKioskConfig(
      {
        ...kioskConfig(),
        activeLocales: ['ru']
      } as KioskConfig,
      [service('single-locale', { name: 'Только русский' })]
    );

    expect(
      pageById(normalized, 'services')?.widgets.map((widget) => widget.id)
    ).toEqual(['service-picker']);
    expectParsed(normalized);
  });

  it('uses sanitized legacy-kiosk compatibility tokens and a complete portrait profile', () => {
    const normalized = experienceFromKioskConfig(
      kioskConfig({
        isCustomColorsEnabled: true,
        headerColor: '#AABBCC',
        bodyColor: 'not-a-color',
        serviceGridColor: '#123456'
      }),
      [service('colors')]
    );

    expect(normalized.theme).toEqual({
      preset: 'legacy-kiosk',
      tokens: {
        header: '#aabbcc',
        surface: '#fef8f3',
        serviceGrid: '#123456'
      }
    });
    expect(normalized.variants).toEqual([
      {
        id: 'kiosk-1080x1920',
        profile: {
          id: 'kiosk-1080x1920',
          name: 'Kiosk 1080×1920',
          width: 1080,
          height: 1920,
          interactionMode: 'touch',
          viewingDistance: 'standing',
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        grid: { columns: 12, rows: 24 }
      }
    ]);
    for (const page of normalized.pages) {
      expect(page.layouts['kiosk-1080x1920']).toBeDefined();
      expect(
        Object.keys(page.layouts['kiosk-1080x1920']?.placements ?? {})
      ).toEqual(page.widgets.map((widget) => widget.id));
    }
    expectParsed(normalized);
  });

  it('uses the selected base theme when legacy custom colors are disabled', () => {
    const normalized = experienceFromKioskConfig(
      kioskConfig({
        kioskBaseTheme: 'dark',
        isCustomColorsEnabled: false,
        headerColor: '#aabbcc',
        bodyColor: '#ddeeff',
        serviceGridColor: '#123456'
      }),
      [service('base-theme')]
    );

    expect(normalized.theme).toEqual({
      preset: 'legacy-kiosk',
      tokens: {
        header: '#0f0f0f',
        surface: '#1a1a1a',
        serviceGrid: '#141414'
      }
    });
    expectParsed(normalized);
  });

  it('derives service behavior slots without replacing canonical legacy identification', () => {
    const normalized = experienceFromKioskConfig(kioskConfig(), [
      service('behavior', {
        identificationMode: 'phone',
        behavior: {
          version: 1,
          information: { body: { en: 'Bring your ticket' } },
          fields: [
            {
              key: 'reason',
              label: { en: 'Reason' },
              type: 'text',
              required: true
            }
          ],
          dataRetentionDays: 1,
          route: { mode: 'page-slot', slot: 'confirmation' }
        }
      })
    ]);

    expect(normalized.pages.map((page) => page.id)).toEqual([
      'services',
      'service-info',
      'service-form',
      'identity',
      'confirmation',
      'success'
    ]);
    expect(normalized.flowPages).toMatchObject({
      serviceCatalogPageId: 'services',
      serviceInfoPageId: 'service-info',
      serviceFormPageId: 'service-form',
      identityPageId: 'identity',
      confirmationPageId: 'confirmation',
      successPageId: 'success'
    });
    expectParsed(normalized);
  });
});
