import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessPolicy } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import {
  CONDITION_PREVIEW_SCENARIOS,
  ConditionPreviewScenarios,
  isSafePreviewContext
} from './condition-preview-scenarios';

afterEach(cleanup);

describe('condition preview scenarios', () => {
  it('contains only synthetic safe context fields', () => {
    expect(CONDITION_PREVIEW_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'anonymous',
      'employee',
      'employee-group',
      'queue-empty',
      'queue-active',
      'offline'
    ]);
    for (const scenario of CONDITION_PREVIEW_SCENARIOS) {
      expect(isSafePreviewContext(scenario.context)).toBe(true);
      expect(JSON.stringify(scenario.context)).not.toMatch(
        /badge|visitor|token|phone|passport|document/i
      );
    }

    expect(
      isSafePreviewContext({
        identity: {
          isAuthenticated: true,
          isEmployee: true,
          groups: ['employee:alex@example.test']
        }
      })
    ).toBe(false);
    expect(
      isSafePreviewContext({
        identity: {
          isAuthenticated: true,
          isEmployee: true,
          groups: ['employees'],
          badge: 'raw-badge-value'
        }
      })
    ).toBe(false);
  });

  it('evaluates the canonical condition and announces the locked result', () => {
    const policy: AccessPolicy = {
      when: {
        kind: 'rule',
        field: 'identity.isEmployee',
        operator: 'is-true'
      },
      whenFalse: 'lock'
    };
    render(<ConditionPreviewScenarios policy={policy} />);

    expect(screen.getByRole('status')).toHaveTextContent(/shown locked/i);
  });

  it('derives the employee-group scenario from the current policy without accepting arbitrary groups', () => {
    const policy: AccessPolicy = {
      when: {
        kind: 'rule',
        field: 'identity.groups',
        operator: 'contains',
        value: 'managers'
      },
      whenFalse: 'hide'
    };
    const onContextChange = vi.fn();
    render(
      <ConditionPreviewScenarios
        policy={policy}
        onContextChange={onContextChange}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /employee in selected group/i })
    );

    expect(onContextChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ groups: ['managers'] })
      })
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^shown$/i);
    expect(
      isSafePreviewContext(
        {
          identity: {
            isAuthenticated: true,
            isEmployee: true,
            groups: ['managers']
          }
        },
        policy
      )
    ).toBe(true);
    expect(
      isSafePreviewContext(
        {
          identity: {
            isAuthenticated: true,
            isEmployee: true,
            groups: ['payroll-admins']
          }
        },
        policy
      )
    ).toBe(false);
  });
});
