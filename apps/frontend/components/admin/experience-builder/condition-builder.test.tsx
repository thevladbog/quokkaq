import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessPolicy, ConditionNode } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import {
  ConditionBuilder,
  appendConditionChild,
  replaceConditionAtPath,
  ruleForConditionField
} from './condition-builder';

afterEach(cleanup);

describe('condition builder', () => {
  it('changes operators and values to the canonical type for the selected field', () => {
    expect(ruleForConditionField('live.queueLength')).toEqual({
      kind: 'rule',
      field: 'live.queueLength',
      operator: 'gte',
      value: 1
    });
    expect(ruleForConditionField('identity.isEmployee')).toEqual({
      kind: 'rule',
      field: 'identity.isEmployee',
      operator: 'is-true'
    });
  });

  it('preserves nested AND/OR structure when adding and replacing children', () => {
    const initial: ConditionNode = {
      kind: 'group',
      combinator: 'and',
      children: [
        {
          kind: 'group',
          combinator: 'or',
          children: [ruleForConditionField('identity.isAuthenticated')]
        }
      ]
    };

    const appended = appendConditionChild(initial, [0], 'rule');
    const changed = replaceConditionAtPath(
      appended,
      [0, 1],
      ruleForConditionField('identity.groups')
    );

    expect(changed).toEqual({
      kind: 'group',
      combinator: 'and',
      children: [
        {
          kind: 'group',
          combinator: 'or',
          children: [
            ruleForConditionField('identity.isAuthenticated'),
            {
              kind: 'rule',
              field: 'identity.groups',
              operator: 'contains',
              value: 'employees'
            }
          ]
        }
      ]
    });
  });

  it('refuses a nested group that would exceed the canonical node budget', () => {
    const atBudgetMinusOne: ConditionNode = {
      kind: 'group',
      combinator: 'and',
      children: [
        ...Array.from(
          { length: 4 },
          (): ConditionNode => ({
            kind: 'group',
            combinator: 'and',
            children: Array.from({ length: 20 }, () =>
              ruleForConditionField('identity.isAuthenticated')
            )
          })
        ),
        {
          kind: 'group',
          combinator: 'and',
          children: Array.from({ length: 13 }, () =>
            ruleForConditionField('identity.isAuthenticated')
          )
        }
      ]
    };

    expect(appendConditionChild(atBudgetMinusOne, [], 'group')).toEqual(
      atBudgetMinusOne
    );
  });

  it('shows an invalid saved field without dropping its access policy', () => {
    const onChange = vi.fn();
    const invalid = {
      when: {
        kind: 'rule',
        field: 'future.badgeLevel',
        operator: 'eq',
        value: 4
      },
      whenFalse: 'lock'
    } as unknown as AccessPolicy;
    render(<ConditionBuilder value={invalid} onChange={onChange} />);

    expect(screen.getByText(/unsupported saved field/i)).toBeInTheDocument();
    expect(screen.getByText('future.badgeLevel')).toBeInTheDocument();
    expect(screen.getByText(/show locked/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('wraps a top-level rule in a canonical group before adding a nested group', () => {
    const onChange = vi.fn();
    const value: AccessPolicy = {
      when: ruleForConditionField('identity.isAuthenticated'),
      whenFalse: 'hide'
    };
    render(<ConditionBuilder value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /add group/i }));

    expect(onChange).toHaveBeenCalledWith({
      when: {
        kind: 'group',
        combinator: 'and',
        children: [
          ruleForConditionField('identity.isAuthenticated'),
          {
            kind: 'group',
            combinator: 'and',
            children: [ruleForConditionField('identity.isAuthenticated')]
          }
        ]
      },
      whenFalse: 'hide'
    });
  });

  it('fails closed for malformed saved policies without trying to repair them', () => {
    const onChange = vi.fn();
    render(
      <ConditionBuilder
        value={null as unknown as AccessPolicy}
        onChange={onChange}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /unsupported saved field/i
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fails closed for policy extensions and resource-unbounded saved trees', () => {
    const onChange = vi.fn();
    const extended = {
      when: ruleForConditionField('identity.isAuthenticated'),
      whenFalse: 'hide',
      expression: 'identity.badge == "secret"'
    } as unknown as AccessPolicy;
    const unbounded = {
      when: {
        kind: 'group',
        combinator: 'and',
        children: Array.from({ length: 100 }, () =>
          ruleForConditionField('identity.isAuthenticated')
        )
      },
      whenFalse: 'hide'
    } as unknown as AccessPolicy;

    const { rerender } = render(
      <ConditionBuilder value={extended} onChange={onChange} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /unsupported saved field/i
    );

    rerender(<ConditionBuilder value={unbounded} onChange={onChange} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /unsupported saved field/i
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets an editor choose a hide or locked outcome without a raw expression field', () => {
    const onChange = vi.fn();
    const value: AccessPolicy = {
      when: ruleForConditionField('identity.isAuthenticated'),
      whenFalse: 'hide'
    };
    render(<ConditionBuilder value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /show locked/i }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, whenFalse: 'lock' });
    expect(screen.queryByRole('textbox', { name: /expression/i })).toBeNull();
  });

  it('groups each typed rule semantically for assistive technology', () => {
    const value: AccessPolicy = {
      when: ruleForConditionField('live.queueLength'),
      whenFalse: 'hide'
    };
    render(<ConditionBuilder value={value} onChange={vi.fn()} />);

    expect(
      screen.getByRole('group', { name: /condition rule/i })
    ).toContainElement(screen.getByRole('combobox', { name: /field/i }));
    expect(screen.getByRole('spinbutton', { name: /value/i })).toHaveValue(1);
  });
});
