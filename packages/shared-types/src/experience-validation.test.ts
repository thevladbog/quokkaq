import { describe, expect, it } from 'vitest';
import {
  experienceFromKioskConfig,
  experienceFromScreenTemplate
} from './experience-legacy';
import { validateExperienceForPublish } from './experience-validation';

type RawAction = { type: string; [key: string]: unknown };

type RawWidget = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  actions: RawAction[];
  access?: unknown;
};

type RawPlacement = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

type RawVariant = {
  id: string;
  profile: {
    id: string;
    name: string;
    width: number;
    height: number;
    interactionMode: 'touch' | 'non-touch';
    viewingDistance: 'near' | 'standing' | 'far';
    safeArea: { top: number; right: number; bottom: number; left: number };
  };
  grid: { columns: number; rows: number };
};

type RawPage = {
  id: string;
  name: string;
  widgets: RawWidget[];
  access?: unknown;
  layouts: Record<
    string,
    { placements: Record<string, RawPlacement>; typographyScale?: number }
  >;
};

type RawExperience = {
  schemaVersion: 1;
  id: string;
  surface:
    | 'ticket-station'
    | 'queue-display'
    | 'counter-display'
    | 'visitor-mobile';
  startPageId: string;
  variants: RawVariant[];
  pages: RawPage[];
  flowPages?: Record<string, string>;
  theme?: unknown;
};

function variant(
  id: string,
  profile: Partial<RawVariant['profile']> = {}
): RawVariant {
  return {
    id,
    profile: {
      id: `${id}-profile`,
      name: `${id} profile`,
      width: id === 'landscape' ? 1180 : 820,
      height: id === 'landscape' ? 820 : 1180,
      interactionMode: 'touch',
      viewingDistance: 'near',
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      ...profile
    },
    grid: { columns: 10, rows: 10 }
  };
}

function widget(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
  actions: RawAction[] = []
): RawWidget {
  return { id, type, config, actions };
}

function page(
  id: string,
  widgets: RawWidget[],
  variants: RawVariant[] = [variant('portrait'), variant('landscape')]
): RawPage {
  const layouts = Object.fromEntries(
    variants.map((currentVariant) => {
      const rowsPerWidget = Math.floor(
        currentVariant.grid.rows / widgets.length
      );
      return [
        currentVariant.id,
        {
          placements: Object.fromEntries(
            widgets.map((currentWidget, index) => [
              currentWidget.id,
              {
                col: 1,
                row: index * rowsPerWidget + 1,
                colSpan: currentVariant.grid.columns,
                rowSpan:
                  index === widgets.length - 1
                    ? currentVariant.grid.rows - index * rowsPerWidget
                    : rowsPerWidget
              }
            ])
          )
        }
      ];
    })
  ) as RawPage['layouts'];

  return { id, name: id, widgets, layouts };
}

function stationTemplate(
  overrides: Partial<RawExperience> = {}
): RawExperience {
  const variants = [variant('portrait'), variant('landscape')];
  const services = page(
    'services',
    [widget('catalog', 'service-picker')],
    variants
  );
  return {
    schemaVersion: 1,
    id: 'station-template',
    surface: 'ticket-station',
    startPageId: 'services',
    variants,
    pages: [services],
    flowPages: { serviceCatalogPageId: 'services' },
    ...overrides
  };
}

function errorCodes(template: unknown): string[] {
  return validateExperienceForPublish(template).errors.map(
    (issue) => issue.code
  );
}

function warningCodes(template: unknown): string[] {
  return validateExperienceForPublish(template).warnings.map(
    (issue) => issue.code
  );
}

describe('validateExperienceForPublish', () => {
  it('returns the stable report shape for malformed unknown input without throwing', () => {
    const report = validateExperienceForPublish({ schemaVersion: 'one' });

    expect(report).toEqual({
      errors: [{ code: 'schema.invalid', path: [] }],
      warnings: [],
      canPublish: false
    });
  });

  it('does not inspect widgets when an unknown surface makes the template malformed', () => {
    const template = { ...stationTemplate(), surface: 'tablet-station' };

    expect(validateExperienceForPublish(template)).toEqual({
      errors: [{ code: 'schema.invalid', path: [] }],
      warnings: [],
      canPublish: false
    });
  });

  it('reports a missing start page with an editor path', () => {
    const template = stationTemplate({ startPageId: 'missing-page' });
    const report = validateExperienceForPublish(template);

    expect(report.errors).toContainEqual({
      code: 'page.start_missing',
      path: ['startPageId']
    });
    expect(report.canPublish).toBe(false);
  });

  it('distinguishes blocking unreachable pages from non-blocking unreferenced pages', () => {
    const template = stationTemplate();
    template.pages.push(
      page('orphan', [widget('orphan-media', 'media')], template.variants)
    );

    const report = validateExperienceForPublish(template);

    expect(report.errors).toContainEqual({
      code: 'page.unreachable',
      path: ['pages', 1]
    });
    expect(report.warnings).toContainEqual({
      code: 'page.unreferenced',
      path: ['pages', 1]
    });
    expect(report.canPublish).toBe(false);
  });

  it('uses semantic navigation rather than page array order', () => {
    const variants = [variant('portrait'), variant('landscape')];
    const services = page(
      'services',
      [
        widget('continue', 'media', {}, [
          { type: 'navigate', toPageId: 'review' }
        ])
      ],
      variants
    );
    const review = page(
      'review',
      [
        widget('finish', 'media', {}, [
          { type: 'navigate', toPageId: 'success' }
        ])
      ],
      variants
    );
    const success = page(
      'success',
      [
        widget('restart', 'media', {}, [
          { type: 'navigate', toPageId: 'services' }
        ])
      ],
      variants
    );
    const template = stationTemplate({
      variants,
      pages: [services, review, success]
    });

    expect(validateExperienceForPublish(template)).toEqual({
      errors: [],
      warnings: [],
      canPublish: true
    });
    expect(
      validateExperienceForPublish({
        ...template,
        pages: [success, review, services]
      })
    ).toEqual({ errors: [], warnings: [], canPublish: true });
  });

  it('reports missing navigate targets instead of treating them as graph edges', () => {
    const template = stationTemplate();
    template.pages[0]!.widgets[0]!.actions.push({
      type: 'navigate',
      toPageId: 'not-a-page'
    });

    expect(errorCodes(template)).toContain('action.target_missing');
  });

  it.each([
    ['ticket-station', 'custom-html', []],
    ['queue-display', 'service-picker', []],
    ['counter-display', 'identify', []],
    ['visitor-mobile', 'called-tickets', []],
    ['queue-display', 'rich-info', [{ type: 'submit-ticket' }]]
  ] as const)(
    'rejects %s widget/action combinations that are unsupported on the surface',
    (surface, type, actions) => {
      const template = stationTemplate({ surface });
      template.pages[0]!.widgets[0] = widget('surface-widget', type, {}, [
        ...actions
      ]);
      for (const currentVariant of template.variants) {
        delete template.pages[0]!.layouts[currentVariant.id]!.placements
          .catalog;
        template.pages[0]!.layouts[currentVariant.id]!.placements[
          'surface-widget'
        ] = {
          col: 1,
          row: 1,
          colSpan: 10,
          rowSpan: 10
        };
      }

      expect(errorCodes(template)).toContain('widget.unsupported_for_surface');
    }
  );

  it('accepts the mobile interaction palette without requiring a station printer action', () => {
    const template = stationTemplate({ surface: 'visitor-mobile' });
    template.pages[0]!.widgets[0] = widget(
      'mobile-services',
      'service-picker',
      {},
      [{ type: 'submit-ticket' }]
    );
    for (const currentVariant of template.variants) {
      delete template.pages[0]!.layouts[currentVariant.id]!.placements.catalog;
      template.pages[0]!.layouts[currentVariant.id]!.placements[
        'mobile-services'
      ] = {
        col: 1,
        row: 1,
        colSpan: 10,
        rowSpan: 10
      };
    }

    expect(validateExperienceForPublish(template)).toEqual({
      errors: [],
      warnings: [],
      canPublish: true
    });
  });

  it('requires every shared widget to have a placement in every variant', () => {
    const template = stationTemplate();
    delete template.pages[0]!.layouts.landscape!.placements.catalog;

    expect(validateExperienceForPublish(template).errors).toContainEqual({
      code: 'variant.unplaced_widget',
      path: ['pages', 0, 'layouts', 'landscape', 'placements', 'catalog']
    });
  });

  it('reports grid placement overflow in the affected variant', () => {
    const template = stationTemplate();
    template.pages[0]!.layouts.landscape!.placements.catalog!.colSpan = 11;

    expect(validateExperienceForPublish(template).errors).toContainEqual({
      code: 'variant.placement_overflow',
      path: ['pages', 0, 'layouts', 'landscape', 'placements', 'catalog']
    });
  });

  it('reports placement overlap in every affected variant', () => {
    const template = stationTemplate();
    template.pages[0]!.widgets.push(widget('overlap', 'media'));
    for (const currentVariant of template.variants) {
      template.pages[0]!.layouts[currentVariant.id]!.placements.overlap = {
        col: 1,
        row: 1,
        colSpan: 10,
        rowSpan: 10
      };
    }

    expect(
      errorCodes(template).filter(
        (code) => code === 'variant.placement_overlap'
      )
    ).toHaveLength(2);
  });

  it('requires flow slots implied by interactive widgets and behavior route slots', () => {
    const template = stationTemplate();
    const form = page(
      'form',
      [widget('ticket-form', 'ticket-form')],
      template.variants
    );
    template.pages.push(form);
    template.pages[0]!.widgets[0]!.actions.push({
      type: 'navigate',
      toPageId: 'form'
    });

    expect(validateExperienceForPublish(template).errors).toContainEqual({
      code: 'flow.required_page_missing',
      path: ['flowPages', 'serviceFormPageId']
    });
  });

  it('accepts per-service legacy QR routes and treats their declared slots as semantic graph transitions', () => {
    const template = experienceFromKioskConfig(
      { kioskAttractInactivityMode: 'off' },
      [
        {
          id: 'qr-service',
          unitId: 'unit-1',
          name: 'QR registration',
          isLeaf: true,
          identificationMode: 'qr'
        },
        {
          id: 'ticket-service',
          unitId: 'unit-1',
          name: 'Ticket service',
          isLeaf: true,
          identificationMode: 'none'
        }
      ]
    );

    expect(validateExperienceForPublish(template)).toEqual({
      errors: [],
      warnings: [{ code: 'theme.legacy_contrast_unknown', path: ['theme'] }],
      canPublish: true
    });
  });

  it('rejects malformed legacy QR terminal outcomes without evaluating arbitrary config', () => {
    const template = structuredClone(
      experienceFromKioskConfig({ kioskAttractInactivityMode: 'off' }, [
        {
          id: 'qr-service',
          unitId: 'unit-1',
          name: 'QR registration',
          isLeaf: true,
          identificationMode: 'qr'
        }
      ])
    ) as RawExperience;
    const catalog = template.pages.find(
      (currentPage) => currentPage.id === 'services'
    )!;
    const routing = catalog.widgets[0]!.config.legacyRouting as {
      routes: Array<{ terminalActions: Array<{ type: string }> }>;
    };
    routing.routes[0]!.terminalActions = [{ type: 'submit-ticket' }];

    expect(errorCodes(template)).toContain('schema.invalid');
  });

  it('uses the canonical condition schema and never includes malformed condition text in issues', () => {
    const template = stationTemplate();
    template.pages[0]!.access = {
      when: 'identity.badge == 123',
      whenFalse: 'hide'
    };
    template.pages[0]!.widgets[0]!.access = {
      when: {
        kind: 'rule',
        field: 'identity.groups',
        operator: 'gt',
        value: 1
      },
      whenFalse: 'lock'
    };

    const report = validateExperienceForPublish(template);

    expect(report.errors).toEqual([
      { code: 'condition.invalid', path: ['pages', 0, 'access', 'when'] },
      {
        code: 'condition.invalid',
        path: ['pages', 0, 'widgets', 0, 'access', 'when']
      }
    ]);
    expect(JSON.stringify(report)).not.toContain('identity.badge == 123');
  });

  it('accepts exactly 56px touch targets in portrait and landscape variants', () => {
    const touchVariants = [
      {
        ...variant('portrait', { width: 560, height: 560 }),
        grid: { columns: 10, rows: 10 }
      },
      {
        ...variant('landscape', { width: 560, height: 560 }),
        grid: { columns: 10, rows: 10 }
      }
    ];
    const template = stationTemplate({
      variants: touchVariants,
      pages: [
        page('services', [widget('catalog', 'service-picker')], touchVariants)
      ]
    });
    for (const currentVariant of touchVariants) {
      template.pages[0]!.layouts[currentVariant.id]!.placements.catalog = {
        col: 1,
        row: 1,
        colSpan: 1,
        rowSpan: 1
      };
    }

    expect(errorCodes(template)).not.toContain('touch.target_too_small');
  });

  it('rejects a 55px touch target with pixel details', () => {
    const touchVariant = {
      ...variant('portrait', { width: 550, height: 560 }),
      grid: { columns: 10, rows: 10 }
    };
    const template = stationTemplate({
      variants: [touchVariant],
      pages: [
        page('services', [widget('catalog', 'service-picker')], [touchVariant])
      ]
    });
    template.pages[0]!.layouts.portrait!.placements.catalog = {
      col: 1,
      row: 1,
      colSpan: 1,
      rowSpan: 1
    };

    expect(validateExperienceForPublish(template).errors).toContainEqual({
      code: 'touch.target_too_small',
      path: ['pages', 0, 'layouts', 'portrait', 'placements', 'catalog'],
      details: { minimum: 56, width: 55, height: 56 }
    });
  });

  it('does not impose touch targets on non-interactive widgets or non-touch profiles', () => {
    const touchVariant = {
      ...variant('portrait', { width: 550, height: 550 }),
      grid: { columns: 10, rows: 10 }
    };
    const displayVariant = {
      ...variant('landscape', {
        width: 550,
        height: 550,
        interactionMode: 'non-touch',
        viewingDistance: 'far'
      }),
      grid: { columns: 10, rows: 10 }
    };
    const template = stationTemplate({
      variants: [touchVariant, displayVariant],
      pages: [
        page(
          'services',
          [
            widget('clock', 'clock'),
            widget('display-picker', 'service-picker')
          ],
          [touchVariant, displayVariant]
        )
      ]
    });
    for (const currentVariant of template.variants) {
      template.pages[0]!.layouts[currentVariant.id]!.placements.clock = {
        col: 1,
        row: 1,
        colSpan: 1,
        rowSpan: 1
      };
      template.pages[0]!.layouts[currentVariant.id]!.placements[
        'display-picker'
      ] = {
        col: 2,
        row: 1,
        colSpan: 1,
        rowSpan: 1
      };
    }

    const report = validateExperienceForPublish(template);

    expect(report.errors).toContainEqual({
      code: 'touch.target_too_small',
      path: ['pages', 0, 'layouts', 'portrait', 'placements', 'display-picker'],
      details: { minimum: 56, width: 55, height: 55 }
    });
    expect(report.errors).not.toContainEqual({
      code: 'touch.target_too_small',
      path: ['pages', 0, 'layouts', 'portrait', 'placements', 'clock'],
      details: { minimum: 56, width: 55, height: 55 }
    });
    expect(report.errors).not.toContainEqual({
      code: 'touch.target_too_small',
      path: [
        'pages',
        0,
        'layouts',
        'landscape',
        'placements',
        'display-picker'
      ],
      details: { minimum: 56, width: 55, height: 55 }
    });
  });

  it('blocks station content that structurally exceeds its declared manual grid without pagination', () => {
    const template = stationTemplate();
    template.pages[0]!.widgets[0]!.config = {
      presentation: {
        mode: 'manual',
        grid: { rows: 8, columns: 8 },
        coordinateBase: 'zero-based',
        placements: [
          { serviceId: 'safe', row: 6, col: 0, rowSpan: 2, colSpan: 1 },
          { serviceId: 'would-scroll', row: 7, col: 1, rowSpan: 2, colSpan: 1 }
        ]
      },
      pagination: { enabled: false }
    };

    expect(validateExperienceForPublish(template).errors).toContainEqual({
      code: 'station.page_scroll_required',
      path: [
        'pages',
        0,
        'widgets',
        0,
        'config',
        'presentation',
        'placements',
        1
      ]
    });
  });

  it('accepts the manual-grid scroll boundary when all service placements fit', () => {
    const template = stationTemplate();
    template.pages[0]!.widgets[0]!.config = {
      presentation: {
        mode: 'manual',
        grid: { rows: 8, columns: 8 },
        coordinateBase: 'zero-based',
        placements: [
          { serviceId: 'fits', row: 6, col: 0, rowSpan: 2, colSpan: 1 }
        ]
      },
      pagination: { enabled: false }
    };

    expect(errorCodes(template)).not.toContain('station.page_scroll_required');
  });

  it('warns when display typography is scaled below its normal primary-text size', () => {
    const displayVariant = {
      ...variant('portrait', {
        interactionMode: 'non-touch',
        viewingDistance: 'far'
      }),
      grid: { columns: 10, rows: 10 }
    };
    const display = page(
      'queue',
      [widget('calls', 'called-tickets')],
      [displayVariant]
    );
    display.layouts.portrait!.typographyScale = 0.75;
    const template = stationTemplate({
      surface: 'queue-display',
      startPageId: 'queue',
      variants: [displayVariant],
      pages: [display],
      flowPages: undefined
    });

    expect(warningCodes(template)).toEqual([
      'display.primary_text_small',
      'variant.typography_scaled'
    ]);
  });

  it('does not require runtime-owned emergency or stale overlays in station templates', () => {
    const report = validateExperienceForPublish(stationTemplate());

    expect(report).toEqual({ errors: [], warnings: [], canPublish: true });
  });

  it('accepts normalized legacy queue-display fixtures', () => {
    const template = experienceFromScreenTemplate({
      id: 'legacy-display',
      layout: {
        type: 'fullscreen' as const,
        regions: [{ id: 'main', area: 'main', size: '1fr' }]
      },
      widgets: [
        {
          id: 'clock',
          type: 'clock' as const,
          regionId: 'main',
          config: {}
        }
      ]
    });

    expect(validateExperienceForPublish(template)).toEqual({
      errors: [],
      warnings: [],
      canPublish: true
    });
  });

  it('orders simultaneous issues by their editor path and then by code', () => {
    const template = stationTemplate({ startPageId: 'missing-page' });
    template.pages[0]!.widgets[0]!.type = 'custom-html';
    template.pages[0]!.widgets[0]!.actions.push({
      type: 'navigate',
      toPageId: 'missing-target'
    });
    delete template.pages[0]!.layouts.landscape!.placements.catalog;

    expect(validateExperienceForPublish(template).errors).toEqual([
      {
        code: 'variant.unplaced_widget',
        path: ['pages', 0, 'layouts', 'landscape', 'placements', 'catalog']
      },
      {
        code: 'widget.unsupported_for_surface',
        path: ['pages', 0, 'widgets', 0]
      },
      {
        code: 'action.target_missing',
        path: ['pages', 0, 'widgets', 0, 'actions', 0, 'toPageId']
      },
      { code: 'page.start_missing', path: ['startPageId'] }
    ]);
  });
});
