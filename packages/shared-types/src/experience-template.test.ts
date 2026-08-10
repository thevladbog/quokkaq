import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_TEMPLATE_LIMITS,
  ExperienceDraftSchema,
  ExperiencePageSchema,
  ExperienceTemplateSchema,
  ExperienceWidgetSchema
} from './experience-template';
import { AccessPolicySchema } from './experience-condition';

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
  it('differs from published validation only by allowing incomplete variant placements', () => {
    const editable = validTemplate();
    editable.variants.push({ ...editable.variants[0]!, id: 'landscape' });
    editable.pages[0]!.layouts.landscape = { placements: {} };

    const parsedDraft = ExperienceDraftSchema.safeParse(editable);
    expect(parsedDraft.success).toBe(true);
    if (!parsedDraft.success) return;
    expect(parsedDraft.data.pages[0]!.widgets[0]!.actions).toEqual([]);
    expect(
      Object.hasOwn(parsedDraft.data.pages[0]!.widgets[0]!, 'actions')
    ).toBe(true);
    expect(ExperienceTemplateSchema.safeParse(editable).success).toBe(false);

    const malformedAction = structuredClone(editable);
    malformedAction.pages[0]!.widgets[0]!.actions = [
      { type: 'navigate', toPageId: '' }
    ];
    expect(ExperienceDraftSchema.safeParse(malformedAction).success).toBe(
      false
    );
  });

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

  it('rejects prototype-chain variant ids with a Zod issue', () => {
    const template = validTemplate();
    template.variants[0]!.id = '__proto__';

    const result = ExperienceTemplateSchema.safeParse(template);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
      'pages',
      0,
      'layouts',
      '__proto__'
    ]);
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

  it('keeps a positive drawable safe area for touch and non-touch profiles', () => {
    const onePixel = validTemplate();
    onePixel.variants[0]!.profile.width = 320;
    onePixel.variants[0]!.profile.height = 320;
    onePixel.variants[0]!.profile.safeArea = {
      top: 319,
      right: 319,
      bottom: 0,
      left: 0
    };
    expect(ExperienceTemplateSchema.safeParse(onePixel).success).toBe(true);

    const zeroWidth = validTemplate();
    zeroWidth.variants[0]!.profile.width = 320;
    zeroWidth.variants[0]!.profile.safeArea = {
      top: 0,
      right: 320,
      bottom: 0,
      left: 0
    };
    expectIssuePath(zeroWidth, ['variants', 0, 'profile', 'safeArea']);

    const nonTouch = validTemplate();
    nonTouch.variants[0]!.profile.height = 320;
    nonTouch.variants[0]!.profile.interactionMode = 'non-touch';
    nonTouch.variants[0]!.profile.safeArea = {
      top: 320,
      right: 0,
      bottom: 0,
      left: 0
    };
    expectIssuePath(nonTouch, ['variants', 0, 'profile', 'safeArea']);
  });

  it('enforces exported editor resource limits at schema boundaries', () => {
    const template = validTemplate();
    for (
      let index = 1;
      index < EXPERIENCE_TEMPLATE_LIMITS.maxVariants;
      index++
    ) {
      const id = `variant-${index}`;
      template.variants.push({ ...template.variants[0]!, id });
      template.pages[0]!.layouts[id] = {
        placements: { catalog: { col: 1, row: 1, colSpan: 1, rowSpan: 1 } }
      };
    }
    expect(ExperienceTemplateSchema.safeParse(template).success).toBe(true);
    template.variants.push({ ...template.variants[0]!, id: 'too-many' });
    expectIssuePath(template, ['variants']);

    const pageBoundaries = validTemplate();
    const sourcePage = pageBoundaries.pages[0]!;
    pageBoundaries.pages = Array.from(
      { length: EXPERIENCE_TEMPLATE_LIMITS.maxPages },
      (_, index) => ({ ...sourcePage, id: `page-${index}` })
    );
    pageBoundaries.startPageId = 'page-0';
    expect(ExperienceTemplateSchema.safeParse(pageBoundaries).success).toBe(
      true
    );
    pageBoundaries.pages.push({ ...sourcePage, id: 'too-many-pages' });
    expectIssuePath(pageBoundaries, ['pages']);

    const page = validTemplate().pages[0]!;
    page.widgets = Array.from(
      { length: EXPERIENCE_TEMPLATE_LIMITS.maxWidgetsPerPage + 1 },
      (_, index) => ({ id: `widget-${index}`, type: 'media', config: {} })
    );
    expect(ExperiencePageSchema.safeParse(page).success).toBe(false);

    expect(
      ExperienceWidgetSchema.safeParse({
        id: 'actions',
        type: 'media',
        config: {},
        actions: Array.from(
          { length: EXPERIENCE_TEMPLATE_LIMITS.maxActionsPerWidget + 1 },
          () => ({ type: 'reset-session' })
        )
      }).success
    ).toBe(false);

    const condition = {
      when: {
        kind: 'group',
        combinator: 'and',
        children: Array.from(
          { length: EXPERIENCE_TEMPLATE_LIMITS.maxConditionNodes + 1 },
          (_, index) => ({
            kind: 'rule',
            field: 'live.queueLength',
            operator: 'gt',
            value: index
          })
        )
      },
      whenFalse: 'hide'
    };
    expect(AccessPolicySchema.safeParse(condition).success).toBe(false);
  });

  it('rejects oversized placement records without reading values beyond the limit', () => {
    let beyondLimitRead = false;
    const template = validTemplate();
    const placements: Record<string, unknown> = {};
    for (let index = 0; index <= 200; index++) {
      Object.defineProperty(placements, `widget-${index}`, {
        enumerable: true,
        get() {
          if (index === 200) beyondLimitRead = true;
          return { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
        }
      });
    }
    template.pages[0]!.layouts.portrait.placements = placements as {
      catalog: { col: number; row: number; colSpan: number; rowSpan: number };
    };

    const result = ExperienceTemplateSchema.safeParse(template);

    expect(result.success).toBe(false);
    expect(beyondLimitRead).toBe(false);
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
      name: 'a ninth layout variant',
      input: () => {
        const template = validTemplate();
        for (let index = 1; index <= 8; index++) {
          template.variants.push({
            ...template.variants[0]!,
            id: `variant-${index}`
          });
        }
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
