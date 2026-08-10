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

const serviceBehaviorBounds = {
  maxDepth: 8,
  maxGroupChildren: 20
} as const;

function conditionAtDepth(depth: number): ConditionNode {
  let node: ConditionNode = ruleForConditionField('identity.isAuthenticated');
  for (let level = 1; level < depth; level += 1) {
    node = { kind: 'group', combinator: 'and', children: [node] };
  }
  return node;
}

function policyWithChildren(count: number): AccessPolicy {
  return {
    when: {
      kind: 'group',
      combinator: 'and',
      children: Array.from({ length: count }, () =>
        ruleForConditionField('identity.isAuthenticated')
      )
    },
    whenFalse: 'hide'
  };
}

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
      /saved condition is invalid/i
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
      /saved condition is invalid/i
    );

    rerender(<ConditionBuilder value={unbounded} onChange={onChange} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /maximum of 100 nodes/i
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the generic builder limited by the canonical 100-node budget only', () => {
    const onChange = vi.fn();
    const atNodeLimit = policyWithChildren(99);
    const aboveNodeLimit = policyWithChildren(100);
    const aboveServiceChildLimit = policyWithChildren(21);
    const { rerender } = render(
      <ConditionBuilder value={atNodeLimit} onChange={onChange} />
    );

    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <ConditionBuilder value={aboveServiceChildLimit} onChange={onChange} />
    );
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<ConditionBuilder value={aboveNodeLimit} onChange={onChange} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts 20 direct Service behavior children and preserves 21 read-only', () => {
    const onChange = vi.fn();
    const policyAboveLimit = policyWithChildren(21);
    const serializedPolicy = JSON.stringify(policyAboveLimit);
    const { rerender } = render(
      <ConditionBuilder
        value={policyWithChildren(20)}
        onChange={onChange}
        semanticBounds={serviceBehaviorBounds}
      />
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getAllByRole('button', { name: /add rule/i }).at(-1)
    ).toBeDisabled();

    rerender(
      <ConditionBuilder
        value={policyAboveLimit}
        onChange={onChange}
        semanticBounds={serviceBehaviorBounds}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /maximum group size of 20/i
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      /unsupported saved field/i
    );
    expect(JSON.stringify(policyAboveLimit)).toBe(serializedPolicy);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts Service behavior depth 8 and preserves depth 9 read-only', () => {
    const onChange = vi.fn();
    const policyAtDepth = {
      when: conditionAtDepth(8),
      whenFalse: 'hide' as const
    };
    const policyAboveDepth = {
      when: conditionAtDepth(9),
      whenFalse: 'hide' as const
    };
    const serializedPolicy = JSON.stringify(policyAboveDepth);
    const { rerender } = render(
      <ConditionBuilder
        value={policyAtDepth}
        onChange={onChange}
        semanticBounds={serviceBehaviorBounds}
      />
    );

    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <ConditionBuilder
        value={policyAboveDepth}
        onChange={onChange}
        semanticBounds={serviceBehaviorBounds}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/maximum depth of 8/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      /unsupported saved field/i
    );
    expect(JSON.stringify(policyAboveDepth)).toBe(serializedPolicy);
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
