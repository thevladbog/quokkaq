import { describe, expect, it } from 'vitest';
import type { KioskConfig, ServiceModel } from './index';
import { ExperienceTemplateSchema } from './experience-template';
import {
  ExperienceNormalizationError,
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

function expectNormalizationError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ExperienceNormalizationError);
    expect(error).toMatchObject({ code });
    expect((error as Error).message).toBe(
      `Experience normalization failed: ${code}`
    );
    return;
  }
  throw new Error(`Expected normalization error: ${code}`);
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
    expect(normalized.variants.map((variant) => variant.id)).toEqual([
      'signage-portrait'
    ]);
    expectParsed(normalized);
  });

  it('keeps fullscreen legacy display widgets non-overlapping and retains sanitized renderer compatibility', () => {
    const normalized = experienceFromScreenTemplate({
      id: 'fullscreen-multiple',
      layout: {
        type: 'fullscreen',
        regions: [
          {
            id: 'main',
            area: 'main',
            size: '1fr',
            panelStyle: 'card',
            backgroundColor: '#AaBbCc'
          }
        ]
      },
      widgets: [
        {
          id: 'calls',
          type: 'called-tickets',
          regionId: 'main',
          config: { limit: 6 },
          position: { x: 16, y: 24 },
          size: { width: '70%', height: '40%' },
          style: {
            backgroundColor: '#112233',
            textColor: 'not-a-color',
            fontSize: '2rem',
            padding: '12px'
          }
        },
        {
          id: 'clock',
          type: 'clock',
          regionId: 'main',
          config: { timezone: 'Europe/Moscow' }
        }
      ]
    });

    const page = normalized.pages[0]!;
    const placements = page.layouts['signage-portrait']!.placements;

    expect(normalized.variants.map((variant) => variant.id)).toEqual([
      'signage-portrait'
    ]);
    expect(placements).toEqual({
      'display-called-tickets-calls': {
        col: 1,
        row: 1,
        colSpan: 12,
        rowSpan: 12
      },
      'display-clock-clock': { col: 1, row: 13, colSpan: 12, rowSpan: 12 }
    });
    expect(
      page.widgets.find(
        (widget) => widget.id === 'display-called-tickets-calls'
      )
    ).toMatchObject({
      id: 'display-called-tickets-calls',
      config: {
        limit: 6,
        compatibility: {
          source: 'legacy-screen-regions',
          region: {
            id: 'main',
            area: 'main',
            size: '1fr',
            panelStyle: 'card',
            backgroundColor: '#aabbcc'
          },
          widget: {
            position: { x: 16, y: 24 },
            size: { width: '70%', height: '40%' },
            style: {
              backgroundColor: '#112233',
              fontSize: '2rem',
              padding: '12px'
            }
          }
        }
      }
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

    expect(normalized).toEqual(ExperienceTemplateSchema.parse(experience));
    expect(normalized).not.toBe(experience);
    expect(experience).toEqual(snapshot);
    expect(normalizeExperienceInput(normalized)).toEqual(normalized);
    expectParsed(normalized);
  });

  it('returns a canonical cloned versioned experience without unknown root fields', () => {
    const experience = {
      schemaVersion: 1 as const,
      id: 'canonical-versioned',
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
      ],
      unknownRoot: 'must not survive normalization'
    };
    const snapshot = structuredClone(experience);

    const normalized = normalizeExperienceInput(experience);

    expect(normalized).toEqual(ExperienceTemplateSchema.parse(experience));
    expect(normalized).not.toHaveProperty('unknownRoot');
    expect(experience).toEqual(snapshot);
    expect(normalizeExperienceInput(normalized)).toEqual(normalized);
  });

  it('rejects unknown theme fields instead of allowing a compatibility color bypass', () => {
    const versioned = {
      schemaVersion: 1,
      id: 'unsafe-theme',
      surface: 'queue-display',
      startPageId: 'queue-display',
      variants: [
        {
          id: 'signage-portrait',
          profile: {
            id: 'signage-1080x1920',
            name: 'Signage 1080×1920',
            width: 1080,
            height: 1920,
            interactionMode: 'non-touch',
            viewingDistance: 'far',
            safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
          },
          grid: { columns: 1, rows: 1 }
        }
      ],
      pages: [
        {
          id: 'queue-display',
          name: 'Queue display',
          widgets: [{ id: 'clock', type: 'clock', config: {} }],
          layouts: {
            'signage-portrait': {
              placements: { clock: { col: 1, row: 1, colSpan: 1, rowSpan: 1 } }
            }
          }
        }
      ],
      theme: {
        preset: 'legacy-kiosk',
        tokens: {
          header: '#000000',
          surface: '#111111',
          serviceGrid: '#222222'
        },
        perTileColor: '#ff0000'
      }
    };

    expect(ExperienceTemplateSchema.safeParse(versioned).success).toBe(false);
    expectNormalizationError(
      () => normalizeExperienceInput(versioned),
      'invalid-versioned-experience'
    );
  });

  it('fails closed for unsupported versions and ambiguous legacy source discriminators', () => {
    expectNormalizationError(
      () =>
        normalizeExperienceInput({
          schemaVersion: 2,
          id: 'old-screen',
          layout: { type: 'fullscreen', regions: [] },
          widgets: []
        }),
      'unsupported-schema-version'
    );
    expectNormalizationError(
      () =>
        normalizeExperienceInput({
          id: 'ambiguous-source',
          layout: { type: 'fullscreen', regions: [] },
          widgets: [],
          portrait: { columns: 1, rows: 1, widgets: [] },
          landscape: { columns: 1, rows: 1, widgets: [] }
        }),
      'ambiguous-legacy-input'
    );
  });

  it('rejects invalid or contradictory explicit display layout kinds without breaking bare legacy shapes', () => {
    const bareRegions = {
      id: 'bare-regions',
      layout: {
        type: 'fullscreen' as const,
        regions: [{ id: 'main', area: 'main', size: '1fr' }]
      },
      widgets: []
    };
    const bareCellGrid = {
      id: 'bare-cell-grid',
      portrait: { columns: 1, rows: 1, widgets: [] },
      landscape: { columns: 1, rows: 1, widgets: [] }
    };

    expectNormalizationError(
      () =>
        normalizeExperienceInput({
          ...bareRegions,
          layoutKind: 'unexpected-layout-kind'
        }),
      'invalid-screen-template'
    );
    expectNormalizationError(
      () =>
        normalizeExperienceInput({ ...bareRegions, layoutKind: 'cellGrid' }),
      'invalid-screen-template'
    );
    expectNormalizationError(
      () =>
        normalizeExperienceInput({ ...bareCellGrid, layoutKind: 'regions' }),
      'invalid-screen-template'
    );
    expect(normalizeExperienceInput(bareRegions).surface).toBe('queue-display');
    expect(normalizeExperienceInput(bareCellGrid).variants).toHaveLength(2);
  });

  it('rejects incompatible orientation-specific display content rather than selecting a face', () => {
    expectNormalizationError(
      () =>
        experienceFromScreenTemplate({
          id: 'incompatible-faces',
          portrait: {
            columns: 1,
            rows: 1,
            widgets: [
              {
                id: 'clock',
                type: 'clock',
                placement: { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
                config: { timezone: 'UTC' }
              }
            ]
          },
          landscape: {
            columns: 1,
            rows: 1,
            widgets: [
              {
                id: 'clock',
                type: 'clock',
                placement: { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
                config: { timezone: 'Europe/Moscow' }
              }
            ]
          }
        }),
      'incompatible-orientation-content'
    );
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
          gridRow: 0,
          gridCol: 0,
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
        coordinateBase: 'zero-based',
        placements: [
          {
            serviceId: 'payments',
            row: 0,
            col: 0,
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

  it('keeps a manual 8×8 grid fixed and unpaginated even for a large catalog', () => {
    const normalized = experienceFromKioskConfig(
      kioskConfig({ serviceGridLayout: 'manual' }),
      Array.from({ length: 30 }, (_, index) =>
        service(`manual-${index}`, {
          gridRow: Math.floor(index / 8),
          gridCol: index % 8
        })
      )
    );
    const picker = pageById(normalized, 'services')?.widgets.find(
      (widget) => widget.id === 'service-picker'
    );

    expect(picker?.config).toMatchObject({
      presentation: {
        mode: 'manual',
        grid: { rows: 8, columns: 8 },
        coordinateBase: 'zero-based'
      },
      pagination: { enabled: false, pageSize: 9, threshold: 12 }
    });
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

    expect(normalized.startPageId).toBe('services');
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
    expect(pageById(normalized, 'attract')?.widgets).toMatchObject([
      {
        id: 'attract-media',
        actions: [],
        config: {
          source: 'legacy-kiosk-attract',
          compatibility: {
            mode: 'session_then_attract',
            showAttractAfterSessionEnd: true,
            attractIdleSec: 60,
            showQueueDepthOnAttract: true,
            signage: { mode: 'inherit' }
          }
        }
      }
    ]);
    expect(pageById(normalized, 'success')?.widgets[0]?.actions).toEqual([
      { type: 'reset-session' },
      { type: 'navigate', toPageId: 'services' }
    ]);
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

  it('derives exact per-service modes and one submit outcome for non-QR legacy flows', () => {
    const normalized = experienceFromKioskConfig(kioskConfig(), [
      service('plain'),
      service('information-only', {
        behavior: {
          version: 1,
          information: { body: { en: 'Bring your ticket' } },
          fields: []
        }
      }),
      service('form-only', {
        behavior: {
          version: 1,
          fields: [
            {
              key: 'reason',
              label: { en: 'Reason' },
              type: 'text',
              required: true
            }
          ],
          dataRetentionDays: 1
        }
      }),
      service('identity-only', {
        identificationMode: 'phone'
      }),
      service('document', {
        identificationMode: 'document'
      }),
      service('custom', {
        identificationMode: 'custom'
      }),
      service('employee-login', {
        identificationMode: 'login'
      }),
      service('employee-badge', {
        identificationMode: 'badge'
      }),
      service('explicit-none-wins', {
        identificationMode: 'none',
        offerIdentification: true
      }),
      service('confirmation-only', {
        behavior: {
          version: 1,
          fields: [],
          route: { mode: 'page-slot', slot: 'confirmation' }
        }
      }),
      service('everything', {
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
      }),
      service('explicit-identity', {
        behavior: {
          version: 1,
          fields: [],
          route: { mode: 'page-slot', slot: 'identity' }
        }
      })
    ]);
    const picker = pageById(normalized, 'services')?.widgets.find(
      (widget) => widget.id === 'service-picker'
    );

    expect(normalized.pages.map((page) => page.id)).toEqual([
      'services',
      'service-info',
      'service-form',
      'identity',
      'confirmation',
      'success'
    ]);
    expect(picker?.config).toMatchObject({
      legacyRouting: {
        source: 'legacy-service-routes',
        canonicalSlots: [
          'service-info',
          'service-form',
          'identity',
          'confirmation',
          'success'
        ],
        routes: [
          {
            serviceId: 'plain',
            identificationMode: 'none',
            slots: ['success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'information-only',
            identificationMode: 'none',
            slots: ['service-info', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'form-only',
            identificationMode: 'none',
            slots: ['service-form', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'identity-only',
            identificationMode: 'phone',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'document',
            identificationMode: 'document',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'custom',
            identificationMode: 'custom',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'employee-login',
            identificationMode: 'login',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'employee-badge',
            identificationMode: 'badge',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'explicit-none-wins',
            identificationMode: 'none',
            slots: ['success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'confirmation-only',
            identificationMode: 'none',
            slots: ['confirmation', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'everything',
            identificationMode: 'phone',
            slots: [
              'service-info',
              'service-form',
              'identity',
              'confirmation',
              'success'
            ],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'explicit-identity',
            identificationMode: 'none',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          }
        ]
      }
    });
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

  it('routes QR identification through pre-registration redemption without a submit action', () => {
    const normalized = experienceFromKioskConfig(kioskConfig(), [
      service('qr-only', { identificationMode: 'qr' })
    ]);
    const picker = pageById(normalized, 'services')?.widgets.find(
      (widget) => widget.id === 'service-picker'
    );

    expect(picker?.config).toMatchObject({
      legacyRouting: {
        routes: [
          {
            serviceId: 'qr-only',
            identificationMode: 'qr',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'redeem-pre-registration' }]
          }
        ]
      }
    });
    expect(JSON.stringify(picker?.config)).not.toContain('submit-ticket');
    expect(pageById(normalized, 'identity')).toBeDefined();
    expectParsed(normalized);
  });

  it('keeps QR redemption and normal ticket outcomes distinct in one catalog', () => {
    const normalized = experienceFromKioskConfig(kioskConfig(), [
      service('normal', { identificationMode: 'phone' }),
      service('redeem', { identificationMode: 'qr' })
    ]);
    const picker = pageById(normalized, 'services')?.widgets.find(
      (widget) => widget.id === 'service-picker'
    );

    expect(picker?.config).toMatchObject({
      legacyRouting: {
        routes: [
          {
            serviceId: 'normal',
            identificationMode: 'phone',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'submit-ticket' }]
          },
          {
            serviceId: 'redeem',
            identificationMode: 'qr',
            slots: ['identity', 'success'],
            terminalActions: [{ type: 'redeem-pre-registration' }]
          }
        ]
      }
    });
    expectParsed(normalized);
  });

  it('preserves the complete effective attract policy from actual kiosk configuration', () => {
    const normalized = experienceFromKioskConfig(
      kioskConfig({
        kioskAttractInactivityMode: 'attract_only',
        showAttractAfterSessionEnd: false,
        attractIdleSec: 37,
        showQueueDepthOnAttract: false,
        kioskAttractSignageMode: 'materials',
        kioskAttractActiveMaterialIds: ['material-a', 'material-b'],
        kioskAttractSlideDurationSec: 9
      }),
      [service('attract-policy')]
    );

    expect(normalized.startPageId).toBe('services');
    expect(pageById(normalized, 'attract')?.widgets[0]?.config).toEqual({
      source: 'legacy-kiosk-attract',
      compatibility: {
        mode: 'attract_only',
        sessionIdleBeforeWarningSec: 45,
        sessionIdleCountdownSec: 15,
        showAttractAfterSessionEnd: false,
        attractIdleSec: 37,
        showQueueDepthOnAttract: false,
        signage: {
          mode: 'materials',
          materialIds: ['material-a', 'material-b'],
          slideDurationSec: 9
        }
      }
    });
    expectParsed(normalized);
  });

  it('runtime-parses kiosk sources and rejects malformed or duplicate service ids without input data in errors', () => {
    expectNormalizationError(
      () =>
        normalizeExperienceInput({
          kiosk: { serviceGridLayout: 'not-a-layout' },
          services: [{ id: 'bad', unitId: 'unit-1', name: 'Bad', isLeaf: true }]
        }),
      'invalid-kiosk-input'
    );
    expectNormalizationError(
      () =>
        normalizeExperienceInput({
          kiosk: {},
          services: [
            { id: 'same', unitId: 'unit-1', name: 'First', isLeaf: true },
            { id: 'same', unitId: 'unit-1', name: 'Second', isLeaf: true }
          ]
        }),
      'invalid-kiosk-input'
    );
    expectNormalizationError(
      () =>
        normalizeExperienceInput({
          kiosk: {},
          services: [{ id: 42, unitId: 'unit-1', name: 'Malformed' }]
        }),
      'invalid-kiosk-input'
    );
  });
});
