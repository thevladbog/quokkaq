import type { ConditionContext } from '@quokkaq/shared-types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServicePickerWidget } from './service-picker-widget';

const anonymous: ConditionContext = {
  identity: { isAuthenticated: false, isEmployee: false, groups: [] }
};

describe('ServicePickerWidget', () => {
  afterEach(cleanup);
  it('keeps an employee-only service visible but locked, then activates it after identity changes', () => {
    const onSelect = vi.fn();
    const services = [
      {
        id: 'employee',
        label: 'Employee service',
        access: {
          when: {
            kind: 'rule' as const,
            field: 'identity.isEmployee' as const,
            operator: 'is-true' as const
          },
          whenFalse: 'lock' as const
        }
      }
    ];
    const { rerender } = render(
      <ServicePickerWidget
        services={services}
        categories={[]}
        conditionContext={anonymous}
        onSelectService={onSelect}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Employee service' })
    ).toBeDisabled();
    rerender(
      <ServicePickerWidget
        services={services}
        categories={[]}
        conditionContext={{
          identity: { isAuthenticated: true, isEmployee: true, groups: [] }
        }}
        onSelectService={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Employee service' }));
    expect(onSelect).toHaveBeenCalledWith(services[0]);
  });

  it.each([2, 6, 12, 31])(
    'paginates %i services with explicit 56px controls',
    (count) => {
      const services = Array.from({ length: count }, (_, index) => ({
        id: `service-${index}`,
        label: `Service ${index}`
      }));
      render(
        <ServicePickerWidget
          services={services}
          categories={[]}
          conditionContext={anonymous}
          onSelectService={vi.fn()}
          profile={{ width: 820, height: 1180 }}
        />
      );

      expect(screen.getAllByTestId('service-picker-option')).toHaveLength(
        Math.min(count, 12)
      );
      if (count > 12)
        expect(screen.getByRole('button', { name: /next page/i })).toHaveClass(
          'min-h-14'
        );
    }
  );
});
