import { describe, expect, it } from 'vitest';
import type { ConditionContext } from '@quokkaq/shared-types';
import {
  conditionSummary,
  evaluateCondition,
  evaluateConditionResult
} from './condition-evaluator';

const context: ConditionContext = {
  identity: {
    isAuthenticated: true,
    isEmployee: true,
    groups: ['Back office']
  },
  live: {
    queueLength: 4,
    isOpen: true,
    isConnected: true
  },
  session: { selectedServiceId: null }
};

describe('condition evaluator', () => {
  it('evaluates a nested AND/OR condition when a matching branch is true', () => {
    const rule = {
      kind: 'group' as const,
      combinator: 'and' as const,
      children: [
        {
          kind: 'rule' as const,
          field: 'identity.isAuthenticated' as const,
          operator: 'is-true' as const
        },
        {
          kind: 'group' as const,
          combinator: 'or' as const,
          children: [
            {
              kind: 'rule' as const,
              field: 'live.queueLength' as const,
              operator: 'gt' as const,
              value: 8
            },
            {
              kind: 'rule' as const,
              field: 'identity.groups' as const,
              operator: 'contains' as const,
              value: 'Back office'
            }
          ]
        }
      ]
    };

    expect(evaluateCondition(rule, context)).toBe(true);
  });

  it('returns false when a valid rule does not match', () => {
    expect(
      evaluateCondition(
        {
          kind: 'rule',
          field: 'live.queueLength',
          operator: 'gte',
          value: 5
        },
        context
      )
    ).toBe(false);
  });

  it('returns a missing-value diagnostic when a required field is absent', () => {
    expect(
      evaluateConditionResult(
        {
          kind: 'rule',
          field: 'live.queueLength',
          operator: 'gt',
          value: 0
        },
        { identity: { isAuthenticated: true } }
      )
    ).toEqual({
      matches: false,
      diagnostics: [{ code: 'missing-value', field: 'live.queueLength' }]
    });
  });

  it('returns a type-mismatch diagnostic instead of coercing a wrong-typed value', () => {
    const wrongTypedContext = {
      ...context,
      live: { ...context.live, queueLength: '4' }
    } as unknown as ConditionContext;

    expect(
      evaluateConditionResult(
        {
          kind: 'rule',
          field: 'live.queueLength',
          operator: 'eq',
          value: 4
        },
        wrongTypedContext
      )
    ).toEqual({
      matches: false,
      diagnostics: [{ code: 'type-mismatch', field: 'live.queueLength' }]
    });
  });

  it.each([
    {
      name: 'an empty AND group',
      node: { kind: 'group', combinator: 'and', children: [] }
    },
    {
      name: 'an empty OR group',
      node: { kind: 'group', combinator: 'or', children: [] }
    },
    {
      name: 'a boolean rule with an invalid operator',
      node: {
        kind: 'rule',
        field: 'identity.isAuthenticated',
        operator: 'eq',
        value: true
      }
    },
    {
      name: 'a rule with an unknown field',
      node: {
        kind: 'rule',
        field: 'live.waitingRoomCapacity',
        operator: 'is-true'
      }
    },
    {
      name: 'a malformed node',
      node: null
    }
  ])('fails closed for $name', ({ node }) => {
    expect(() => evaluateConditionResult(node as never, context)).not.toThrow();
    expect(evaluateCondition(node as never, context)).toBe(false);
    expect(evaluateConditionResult(node as never, context)).toEqual({
      matches: false,
      diagnostics: [{ code: 'invalid-condition' }]
    });
  });

  it('summarizes conditions with localized human-readable wording', () => {
    const rule = {
      kind: 'group' as const,
      combinator: 'and' as const,
      children: [
        {
          kind: 'rule' as const,
          field: 'identity.isAuthenticated' as const,
          operator: 'is-true' as const
        },
        {
          kind: 'rule' as const,
          field: 'identity.groups' as const,
          operator: 'contains' as const,
          value: 'Back office'
        }
      ]
    };

    expect(conditionSummary(rule, 'en')).toBe(
      'Authenticated and group contains Back office'
    );
    expect(conditionSummary(rule, 'ru')).toBe(
      'Авторизован и группа содержит Back office'
    );
  });

  it('keeps an OR group inside an AND group unambiguous in both locales', () => {
    const rule = {
      kind: 'group' as const,
      combinator: 'and' as const,
      children: [
        {
          kind: 'rule' as const,
          field: 'identity.isAuthenticated' as const,
          operator: 'is-true' as const
        },
        {
          kind: 'group' as const,
          combinator: 'or' as const,
          children: [
            {
              kind: 'rule' as const,
              field: 'identity.groups' as const,
              operator: 'contains' as const,
              value: 'Back office'
            },
            {
              kind: 'rule' as const,
              field: 'live.isOpen' as const,
              operator: 'is-true' as const
            }
          ]
        }
      ]
    };

    expect(conditionSummary(rule, 'en')).toBe(
      'Authenticated and (group contains Back office or Open)'
    );
    expect(conditionSummary(rule, 'ru')).toBe(
      'Авторизован и (группа содержит Back office или Открыто)'
    );
  });

  it('keeps an AND group inside an OR group unambiguous in both locales', () => {
    const rule = {
      kind: 'group' as const,
      combinator: 'or' as const,
      children: [
        {
          kind: 'rule' as const,
          field: 'identity.isEmployee' as const,
          operator: 'is-true' as const
        },
        {
          kind: 'group' as const,
          combinator: 'and' as const,
          children: [
            {
              kind: 'rule' as const,
              field: 'identity.groups' as const,
              operator: 'contains' as const,
              value: 'Back office'
            },
            {
              kind: 'rule' as const,
              field: 'live.isConnected' as const,
              operator: 'is-true' as const
            }
          ]
        }
      ]
    };

    expect(conditionSummary(rule, 'en')).toBe(
      'Employee or (group contains Back office and Connected)'
    );
    expect(conditionSummary(rule, 'ru')).toBe(
      'Сотрудник или (группа содержит Back office и Подключено)'
    );
  });
});
