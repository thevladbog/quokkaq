import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffServiceScopeSelector } from './StaffServiceScopeSelector';

const messages: Record<string, string> = {
  'scope.title': 'Service scope',
  'scope.hint': 'Choose the services handled here.',
  'scope.select_all': 'Select all',
  'scope.all_services': 'All services',
  'scope.selected_one': '{service}',
  'scope.selected_many': '{service} +{count}',
  'scope.matching_count': '{count} waiting'
};

function t(key: string, values?: Record<string, string | number | Date>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? '')
  );
}

const leaves = [
  { id: 'service-a', label: 'Payments' },
  { id: 'service-b', label: 'Documents' },
  { id: 'service-c', label: 'Consultations' }
];

afterEach(cleanup);

describe('StaffServiceScopeSelector', () => {
  it('does not allow the last selected service to be removed', () => {
    const onChange = vi.fn();

    render(
      <StaffServiceScopeSelector
        t={t}
        leaves={leaves}
        selectedIds={['service-a']}
        onChange={onChange}
        variant='dialog'
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Payments' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Payments' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns every leaf id when select all is activated', () => {
    const onChange = vi.fn();

    render(
      <StaffServiceScopeSelector
        t={t}
        leaves={leaves}
        selectedIds={['service-a']}
        onChange={onChange}
        variant='dialog'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onChange).toHaveBeenCalledWith([
      'service-a',
      'service-b',
      'service-c'
    ]);
  });

  it('keeps the compact summary visible when no service leaves exist', () => {
    render(
      <StaffServiceScopeSelector
        t={t}
        leaves={[]}
        selectedIds={[]}
        onChange={vi.fn()}
        summary={{ kind: 'all', labels: [], count: 0 }}
        waitingCount={0}
      />
    );

    expect(screen.getByText('All services')).toBeVisible();
    expect(screen.getByText('0 waiting')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Select all' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('gives select-all, checkbox, and checkbox-label targets a 36px floor', () => {
    render(
      <StaffServiceScopeSelector
        t={t}
        leaves={leaves}
        selectedIds={['service-a']}
        onChange={vi.fn()}
        variant='dialog'
      />
    );

    expect(screen.getByRole('button', { name: 'Select all' })).toHaveClass(
      'h-9'
    );
    for (const leaf of leaves) {
      expect(screen.getByRole('checkbox', { name: leaf.label })).toHaveClass(
        'size-9'
      );
      expect(screen.getByText(leaf.label)).toHaveClass('min-h-9', 'flex-1');
    }
  });

  it('activates an associated checkbox label exactly once', () => {
    const onChange = vi.fn();
    render(
      <StaffServiceScopeSelector
        t={t}
        leaves={leaves}
        selectedIds={['service-a']}
        onChange={onChange}
        variant='dialog'
      />
    );

    fireEvent.click(screen.getByText('Documents'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['service-a', 'service-b']);
  });

  it.each([
    {
      name: 'all services',
      summary: {
        kind: 'all' as const,
        labels: ['Payments', 'Documents', 'Consultations'],
        count: 3
      },
      expected: 'All services'
    },
    {
      name: 'one service',
      summary: {
        kind: 'single' as const,
        labels: ['Documents'],
        count: 1
      },
      expected: 'Documents'
    },
    {
      name: 'multiple services',
      summary: {
        kind: 'multiple' as const,
        labels: ['Payments', 'Consultations'],
        count: 2
      },
      expected: 'Payments +1'
    }
  ])('keeps a compact $name summary visible', ({ summary, expected }) => {
    render(
      <StaffServiceScopeSelector
        t={t}
        leaves={leaves}
        selectedIds={leaves.map((leaf) => leaf.id)}
        onChange={vi.fn()}
        summary={summary}
        waitingCount={7}
      />
    );

    expect(screen.getByText(expected)).toBeVisible();
    expect(screen.getByText('7 waiting')).toBeVisible();
  });
});
