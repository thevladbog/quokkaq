import { describe, expect, it } from 'vitest';
import { ServiceBehaviorSchema } from './service-behavior';

function textField(key = 'room') {
  return {
    key,
    label: { en: 'Room', ru: 'Кабинет' },
    type: 'text' as const,
    required: true
  };
}

function groupAtDepth(depth: number): unknown {
  let node: unknown = {
    kind: 'rule',
    field: 'identity.isAuthenticated',
    operator: 'is-true'
  };
  for (let index = 0; index < depth; index += 1) {
    node = { kind: 'group', combinator: 'and', children: [node] };
  }
  return node;
}

describe('service behavior schema', () => {
  it('parses portable keyed options and the canonical Task 2 access policy', () => {
    const behavior = ServiceBehaviorSchema.parse({
      version: 1,
      information: {
        body: { en: 'Bring an employee badge', ru: 'Возьмите пропуск' },
        requireAcknowledgement: true
      },
      fields: [
        textField(),
        {
          key: 'floor',
          label: { en: 'Floor', ru: 'Этаж' },
          type: 'number',
          required: false
        },
        {
          key: 'contact_phone',
          label: { en: 'Phone', ru: 'Телефон' },
          type: 'phone',
          required: false
        },
        {
          key: 'visit_reason',
          label: { en: 'Reason', ru: 'Причина' },
          type: 'select',
          required: true,
          options: [
            {
              key: 'consultation',
              label: { en: 'Consultation', ru: 'Консультация' }
            },
            { key: 'pickup', label: { en: 'Pickup', ru: 'Получение' } }
          ]
        },
        {
          key: 'arrival',
          label: { en: 'Arrival', ru: 'Прибыл' },
          type: 'checkbox',
          required: true
        }
      ],
      dataRetentionDays: 7,
      route: { mode: 'page-slot', slot: 'service-form' },
      access: {
        when: {
          kind: 'rule',
          field: 'identity.isAuthenticated',
          operator: 'is-true'
        },
        whenFalse: 'lock'
      }
    });

    const select = behavior.fields[3];
    if (select?.type !== 'select') {
      throw new Error('expected select field');
    }
    expect(select.options[0]?.key).toBe('consultation');
    expect(behavior.access?.whenFalse).toBe('lock');
  });

  it.each([
    {
      name: 'an unsupported behavior version',
      behavior: { version: 2 }
    },
    {
      name: 'a field key outside the portable key format',
      behavior: {
        version: 1,
        fields: [{ ...textField('Room') }],
        dataRetentionDays: 1
      }
    },
    {
      name: 'duplicate requested field keys',
      behavior: {
        version: 1,
        fields: [textField('room'), { ...textField('room'), type: 'number' }],
        dataRetentionDays: 1
      }
    },
    {
      name: 'requested fields without retention',
      behavior: { version: 1, fields: [textField()] }
    },
    {
      name: 'select options without stable keys',
      behavior: {
        version: 1,
        fields: [
          {
            key: 'reason',
            label: { en: 'Reason' },
            type: 'select',
            required: true,
            options: [{ en: 'Consultation' }]
          }
        ],
        dataRetentionDays: 1
      }
    },
    {
      name: 'duplicate select option keys',
      behavior: {
        version: 1,
        fields: [
          {
            key: 'reason',
            label: { en: 'Reason' },
            type: 'select',
            required: true,
            options: [
              { key: 'consultation', label: { en: 'Consultation' } },
              { key: 'consultation', label: { en: 'Second consultation' } }
            ]
          }
        ],
        dataRetentionDays: 1
      }
    },
    {
      name: 'an access rule with an incompatible operator',
      behavior: {
        version: 1,
        access: {
          when: {
            kind: 'rule',
            field: 'identity.groups',
            operator: 'gt',
            value: 1
          },
          whenFalse: 'hide'
        }
      }
    },
    {
      name: 'a route outside the page-slot union',
      behavior: {
        version: 1,
        route: { mode: 'page-slot', slot: 'service-picker' }
      }
    }
  ])('rejects $name', ({ behavior }) => {
    expect(ServiceBehaviorSchema.safeParse(behavior).success).toBe(false);
  });

  it.each([
    [
      'more than 50 fields',
      {
        version: 1,
        fields: Array.from({ length: 51 }, (_, index) =>
          textField(`field_${index}`)
        ),
        dataRetentionDays: 1
      }
    ],
    [
      'more than eight localized entries',
      {
        version: 1,
        fields: [
          {
            ...textField(),
            label: Object.fromEntries(
              Array.from({ length: 9 }, (_, index) => [`l${index}`, 'Room'])
            )
          }
        ],
        dataRetentionDays: 1
      }
    ],
    [
      'a locale key longer than 16 characters',
      {
        version: 1,
        fields: [
          { ...textField(), label: { this_locale_key_is_too_long: 'Room' } }
        ],
        dataRetentionDays: 1
      }
    ],
    [
      'a field label longer than 160 characters',
      {
        version: 1,
        fields: [{ ...textField(), label: { en: 'a'.repeat(161) } }],
        dataRetentionDays: 1
      }
    ],
    [
      'an information body longer than 4000 characters',
      { version: 1, information: { body: { en: 'a'.repeat(4001) } } }
    ],
    [
      'more than 50 select options',
      {
        version: 1,
        fields: [
          {
            key: 'reason',
            label: { en: 'Reason' },
            type: 'select',
            required: true,
            options: Array.from({ length: 51 }, (_, index) => ({
              key: `option_${index}`,
              label: { en: 'Option' }
            }))
          }
        ],
        dataRetentionDays: 1
      }
    ],
    [
      'an access AST deeper than eight groups',
      { version: 1, access: { when: groupAtDepth(9), whenFalse: 'hide' } }
    ],
    [
      'more than 100 access AST nodes',
      {
        version: 1,
        access: {
          when: {
            kind: 'group',
            combinator: 'or',
            children: Array.from({ length: 20 }, () => ({
              kind: 'group',
              combinator: 'and',
              children: Array.from({ length: 4 }, () => ({
                kind: 'rule',
                field: 'live.isOpen',
                operator: 'is-true'
              }))
            }))
          },
          whenFalse: 'hide'
        }
      }
    ],
    [
      'an access group with more than 20 children',
      {
        version: 1,
        access: {
          when: {
            kind: 'group',
            combinator: 'or',
            children: Array.from({ length: 21 }, () => ({
              kind: 'rule',
              field: 'live.isOpen',
              operator: 'is-true'
            }))
          },
          whenFalse: 'hide'
        }
      }
    ]
  ])('rejects $0', (_name, behavior) => {
    expect(ServiceBehaviorSchema.safeParse(behavior).success).toBe(false);
  });

  it('accepts the access AST boundaries and rejects raw behavior above 64 KiB', () => {
    const oneHundredNodes = Array.from({ length: 20 }, (_, groupIndex) => ({
      kind: 'group' as const,
      combinator: 'or' as const,
      children: Array.from({ length: groupIndex === 19 ? 3 : 4 }, () => ({
        kind: 'rule' as const,
        field: 'live.isOpen' as const,
        operator: 'is-true' as const
      }))
    }));
    const atBound = {
      version: 1,
      access: {
        when: {
          kind: 'group' as const,
          combinator: 'or' as const,
          children: oneHundredNodes
        },
        whenFalse: 'hide' as const
      }
    };
    const localized = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`l${index}`, 'x'.repeat(160)])
    );
    const atSizeBase = {
      version: 1,
      information: { body: { en: 'x' } },
      route: { mode: 'auto' as const },
      access: {
        when: {
          kind: 'rule' as const,
          field: 'live.isOpen' as const,
          operator: 'is-true' as const
        },
        whenFalse: 'hide' as const
      },
      fields: Array.from({ length: 22 }, (_, index) => ({
        key: `field_${index}`,
        label: localized,
        type: 'select' as const,
        required: false,
        options: [{ key: 'option', label: localized }]
      })),
      dataRetentionDays: 1
    };
    const baseBytes = new TextEncoder().encode(
      JSON.stringify(atSizeBase)
    ).length;
    const padding = 64 * 1024 - baseBytes;
    const atSize = {
      ...atSizeBase,
      information: { body: { en: 'x'.repeat(padding + 1) } }
    };
    const aboveSize = {
      ...atSize,
      information: { body: { en: 'x'.repeat(padding + 2) } }
    };

    expect(padding).toBeGreaterThanOrEqual(0);
    expect(padding + 1).toBeLessThanOrEqual(4000);
    expect(new TextEncoder().encode(JSON.stringify(atSize)).length).toBe(
      64 * 1024
    );
    expect(
      ServiceBehaviorSchema.safeParse({
        version: 1,
        access: { when: groupAtDepth(7), whenFalse: 'hide' }
      }).success
    ).toBe(true);
    expect(ServiceBehaviorSchema.safeParse(atBound).success).toBe(true);
    expect(ServiceBehaviorSchema.safeParse(atSize).success).toBe(true);
    expect(ServiceBehaviorSchema.safeParse(aboveSize).success).toBe(false);
  });

  it('rejects records with inherited required behavior keys at every behavior boundary', () => {
    const inheritedBehavior = Object.create({
      version: 1,
      fields: [],
      route: { mode: 'auto' }
    });
    const inheritedLabel = Object.create({ en: 'Room' });
    const inheritedOption = Object.create({
      key: 'consultation',
      label: { en: 'Consultation' }
    });

    expect(ServiceBehaviorSchema.safeParse(inheritedBehavior).success).toBe(
      false
    );
    expect(
      ServiceBehaviorSchema.safeParse({
        version: 1,
        fields: [{ ...textField(), label: inheritedLabel }],
        dataRetentionDays: 1
      }).success
    ).toBe(false);
    expect(
      ServiceBehaviorSchema.safeParse({
        version: 1,
        fields: [
          {
            key: 'reason',
            label: { en: 'Reason' },
            type: 'select',
            required: true,
            options: [inheritedOption]
          }
        ],
        dataRetentionDays: 1
      }).success
    ).toBe(false);
  });
});
