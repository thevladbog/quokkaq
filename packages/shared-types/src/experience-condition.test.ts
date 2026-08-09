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

describe('experience condition schema', () => {
  it('preserves a nested widget access condition with lock outcome', () => {
    const template = validTemplate();
    const rule = {
      kind: 'group',
      combinator: 'and',
      children: [
        {
          kind: 'rule',
          field: 'identity.isAuthenticated',
          operator: 'is-true'
        },
        {
          kind: 'group',
          combinator: 'or',
          children: [
            {
              kind: 'rule',
              field: 'identity.groups',
              operator: 'contains',
              value: 'Back office'
            },
            {
              kind: 'rule',
              field: 'live.queueLength',
              operator: 'lt',
              value: 5
            }
          ]
        }
      ]
    };

    template.pages[0]!.widgets[0]!.access = { when: rule, whenFalse: 'lock' };

    expect(
      ExperienceTemplateSchema.parse(template).pages[0]!.widgets[0]!.access
    ).toEqual({ when: rule, whenFalse: 'lock' });
  });

  it('rejects lock outcomes for page access', () => {
    const template = validTemplate();
    template.pages[0]!.access = {
      when: {
        kind: 'rule',
        field: 'live.isOpen',
        operator: 'is-true'
      },
      whenFalse: 'lock'
    };

    expect(() => ExperienceTemplateSchema.parse(template)).toThrow();
  });

  it('rejects an operator that is incompatible with its condition field', () => {
    const template = validTemplate();
    template.pages[0]!.widgets[0]!.access = {
      when: {
        kind: 'rule',
        field: 'identity.groups',
        operator: 'gt',
        value: 2
      },
      whenFalse: 'hide'
    };

    expect(() => ExperienceTemplateSchema.parse(template)).toThrow();
  });
});
