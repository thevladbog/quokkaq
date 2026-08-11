import type { ConditionContext } from '@quokkaq/shared-types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServicePickerWidget } from './service-picker-widget';
import { TicketFormWidget } from './ticket-form-widget';

function EmployeeOnlyFlow({
  submit
}: {
  submit: (value: unknown) => Promise<void>;
}) {
  const [identity, setIdentity] = useState<ConditionContext['identity']>({
    isAuthenticated: false,
    isEmployee: false,
    groups: []
  });
  const [selected, setSelected] = useState(false);
  const [success, setSuccess] = useState(false);
  if (success)
    return (
      <button
        type='button'
        onClick={() => {
          setIdentity({
            isAuthenticated: false,
            isEmployee: false,
            groups: []
          });
          setSelected(false);
          setSuccess(false);
        }}
      >
        Start over
      </button>
    );
  if (selected)
    return (
      <TicketFormWidget
        locale='en'
        fields={[
          {
            key: 'reason',
            label: { en: 'Reason' },
            type: 'text',
            required: true
          }
        ]}
        onSubmit={async (value) => {
          await submit(value);
          setSuccess(true);
        }}
      />
    );
  return (
    <>
      <button
        type='button'
        onClick={() =>
          setIdentity({ isAuthenticated: true, isEmployee: true, groups: [] })
        }
      >
        Badge identity
      </button>
      <ServicePickerWidget
        categories={[]}
        conditionContext={{ identity }}
        onSelectService={() => setSelected(true)}
        services={[
          {
            id: 'employee',
            label: 'Employee service',
            access: {
              when: {
                kind: 'rule',
                field: 'identity.isEmployee',
                operator: 'is-true'
              },
              whenFalse: 'lock'
            }
          }
        ]}
      />
    </>
  );
}

describe('ticket-station employee-only flow', () => {
  afterEach(cleanup);

  it('unlocks after badge identity, validates the required field, submits once, and resets after success', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<EmployeeOnlyFlow submit={submit} />);
    expect(
      screen.getByRole('button', { name: 'Employee service' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Badge identity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Employee service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Need access' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Start over' });
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(
      screen.getByRole('button', { name: 'Employee service' })
    ).toBeDisabled();
  });
});
