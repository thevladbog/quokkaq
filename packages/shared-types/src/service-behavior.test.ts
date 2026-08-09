import { describe, expect, it } from 'vitest';
import { ServiceBehaviorSchema } from './service-behavior';

describe('service behavior schema', () => {
  it('parses information, requested fields, category access, and a route', () => {
    const behavior = ServiceBehaviorSchema.parse({
      version: 1,
      information: {
        body: { en: 'Bring an employee badge', ru: 'Возьмите пропуск' },
        requireAcknowledgement: true
      },
      fields: [
        {
          key: 'room',
          label: { en: 'Room', ru: 'Кабинет' },
          type: 'text',
          required: true
        },
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
            { en: 'Consultation', ru: 'Консультация' },
            { en: 'Pickup', ru: 'Получение' }
          ]
        },
        {
          key: 'consent',
          label: { en: 'Consent', ru: 'Согласие' },
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

    expect(behavior.fields[0]?.key).toBe('room');
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
        fields: [
          {
            key: 'Room',
            label: { en: 'Room' },
            type: 'text',
            required: true
          }
        ],
        dataRetentionDays: 1
      }
    },
    {
      name: 'duplicate requested field keys',
      behavior: {
        version: 1,
        fields: [
          {
            key: 'room',
            label: { en: 'Room' },
            type: 'text',
            required: true
          },
          {
            key: 'room',
            label: { en: 'Another room' },
            type: 'number',
            required: false
          }
        ],
        dataRetentionDays: 1
      }
    },
    {
      name: 'requested fields without retention',
      behavior: {
        version: 1,
        fields: [
          {
            key: 'room',
            label: { en: 'Room' },
            type: 'text',
            required: true
          }
        ]
      }
    },
    {
      name: 'a select field without localized options',
      behavior: {
        version: 1,
        fields: [
          {
            key: 'reason',
            label: { en: 'Reason' },
            type: 'select',
            required: true,
            options: []
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
});
