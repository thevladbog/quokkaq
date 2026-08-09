import { describe, expect, it } from 'vitest';
import { ExperienceTemplateSchema } from './experience-template';

function validTemplate() {
  return {
    schemaVersion: 1,
    id: 'front-desk',
    surface: 'ticket-station',
    startPageId: 'services',
    variants: [
      {
        id: 'portrait',
        profile: {
          id: 'ipad-10-9-portrait',
          name: 'iPad 10.9 portrait',
          width: 820,
          height: 1180,
          interactionMode: 'touch',
          viewingDistance: 'near',
          safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
        },
        grid: { columns: 12, rows: 18 }
      }
    ],
    pages: [
      {
        id: 'services',
        name: 'Service catalog',
        widgets: [{ id: 'catalog', type: 'service-picker', config: {} }],
        layouts: {
          portrait: {
            placements: {
              catalog: { col: 1, row: 2, colSpan: 12, rowSpan: 15 }
            }
          }
        }
      }
    ]
  };
}

function expectIssuePath(input: unknown, expectedPath: Array<string | number>) {
  const result = ExperienceTemplateSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues.map((issue) => issue.path)).toContainEqual(
    expectedPath
  );
}

describe('ExperienceTemplateSchema', () => {
  it('separates role-based surfaces from concrete device profiles', () => {
    const valid = validTemplate();

    expect(ExperienceTemplateSchema.parse(valid).surface).toBe(
      'ticket-station'
    );
    expect(() =>
      ExperienceTemplateSchema.parse({ ...valid, surface: 'tablet' })
    ).toThrow();
  });

  it('keeps widget content and ordered actions shared across variants', () => {
    const template = validTemplate();
    template.pages.push({
      id: 'confirmation',
      name: 'Confirmation',
      widgets: [
        {
          id: 'continue',
          type: 'rich-info',
          tone: 'emphasized',
          config: { title: 'Confirm service' },
          actions: [
            {
              type: 'set-session',
              key: 'selectedServiceId',
              value: { source: 'event', field: 'serviceId' }
            },
            { type: 'navigate', toPageId: 'services' }
          ]
        }
      ],
      layouts: {
        portrait: {
          placements: {
            continue: { col: 1, row: 1, colSpan: 12, rowSpan: 6 }
          },
          typographyScale: 1.25
        }
      }
    });

    const parsed = ExperienceTemplateSchema.parse(template);
    expect(parsed.pages[1]?.widgets[0]?.actions).toEqual([
      {
        type: 'set-session',
        key: 'selectedServiceId',
        value: { source: 'event', field: 'serviceId' }
      },
      { type: 'navigate', toPageId: 'services' }
    ]);
    expect(parsed.pages[1]?.layouts.portrait?.placements.continue).toEqual({
      col: 1,
      row: 1,
      colSpan: 12,
      rowSpan: 6
    });
  });

  it('resolves every configured flow page role to a page', () => {
    const valid = validTemplate();
    valid.flowPages = { serviceCatalogPageId: 'services' };

    expect(ExperienceTemplateSchema.safeParse(valid).success).toBe(true);
    expectIssuePath({ ...valid, flowPages: { successPageId: 'missing' } }, [
      'flowPages',
      'successPageId'
    ]);
  });

  it('requires every page to define each declared variant layout', () => {
    const template = validTemplate();
    template.variants.push({ ...template.variants[0]!, id: 'landscape' });

    expectIssuePath(template, ['pages', 0, 'layouts', 'landscape']);
  });

  it('requires every page layout to place each shared widget', () => {
    const template = validTemplate();
    template.pages[0]!.widgets.push({
      id: 'details',
      type: 'rich-info',
      config: {}
    });

    expectIssuePath(template, [
      'pages',
      0,
      'layouts',
      'portrait',
      'placements',
      'details'
    ]);
  });

  it.each([
    {
      name: 'duplicate variant ids',
      input: () => {
        const template = validTemplate();
        template.variants.push({ ...template.variants[0]! });
        return template;
      },
      path: ['variants', 1, 'id']
    },
    {
      name: 'duplicate page ids',
      input: () => {
        const template = validTemplate();
        template.pages.push({ ...template.pages[0]! });
        return template;
      },
      path: ['pages', 1, 'id']
    },
    {
      name: 'duplicate widget ids on one page',
      input: () => {
        const template = validTemplate();
        template.pages[0]!.widgets.push({
          id: 'catalog',
          type: 'rich-info',
          config: {}
        });
        return template;
      },
      path: ['pages', 0, 'widgets', 1, 'id']
    },
    {
      name: 'a third layout variant',
      input: () => {
        const template = validTemplate();
        template.variants.push(
          { ...template.variants[0]!, id: 'landscape' },
          { ...template.variants[0]!, id: 'wide' }
        );
        return template;
      },
      path: ['variants']
    },
    {
      name: 'a navigation action without a target page',
      input: () => {
        const template = validTemplate();
        template.pages[0]!.widgets[0]!.actions = [
          { type: 'navigate', toPageId: 'missing' }
        ];
        return template;
      },
      path: ['pages', 0, 'widgets', 0, 'actions', 0, 'toPageId']
    },
    {
      name: 'overlapping placements in one variant',
      input: () => {
        const template = validTemplate();
        template.pages[0]!.widgets.push({
          id: 'details',
          type: 'rich-info',
          config: {}
        });
        template.pages[0]!.layouts.portrait.placements.details = {
          col: 1,
          row: 2,
          colSpan: 1,
          rowSpan: 1
        };
        return template;
      },
      path: ['pages', 0, 'layouts', 'portrait', 'placements', 'details']
    },
    {
      name: 'a placement outside its variant grid',
      input: () => {
        const template = validTemplate();
        template.pages[0]!.layouts.portrait.placements.catalog.colSpan = 13;
        return template;
      },
      path: ['pages', 0, 'layouts', 'portrait', 'placements', 'catalog']
    }
  ])('rejects $name', ({ input, path }) => {
    expectIssuePath(input(), path);
  });
});
