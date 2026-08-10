import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import { ServiceBehaviorEditor } from './service-behavior-editor';
import { ApiHttpError } from '@/lib/api-errors';

afterEach(cleanup);

describe('ServiceBehaviorEditor', () => {
  it('maps localized information, fields, access and route into a separate behavior save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={null}
        onSave={onSave}
        onSaved={onSaved}
      />
    );
    fireEvent.change(screen.getByLabelText(/information/i), {
      target: { value: 'Bring your ID' }
    });
    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/retention days/i), {
      target: { value: '7' }
    });
    fireEvent.change(screen.getByLabelText(/route mode/i), {
      target: { value: 'service-form' }
    });
    fireEvent.click(screen.getByRole('button', { name: /show locked/i }));
    fireEvent.click(screen.getByRole('button', { name: /save behavior/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      'service-1',
      expect.objectContaining({
        version: 1,
        information: { body: { en: 'Bring your ID' } },
        fields: [expect.objectContaining({ key: 'field_1' })],
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
      })
    );
    expect(onSaved).toHaveBeenCalledWith(onSave.mock.calls[0]?.[1]);
  });

  it('keeps unknown API envelopes form-level instead of inventing server field errors', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue({ fields: { dataRetentionDays: 'Too long' } });
    render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={null}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/retention days/i), {
      target: { value: '7' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save behavior/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save service behavior. Try again.'
    );
    expect(screen.queryByText('Too long')).toBeNull();
  });

  it('shows local schema errors at the invalid field before calling the plain-string API', async () => {
    const onSave = vi.fn();
    render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={null}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/^key$/i), {
      target: { value: 'Not valid' }
    });
    fireEvent.change(screen.getByLabelText(/retention days/i), {
      target: { value: '7' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save behavior/i }));

    expect(await screen.findByText('Check this value.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^key$/i)).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps generated API failures visible and lets an operator retry', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiHttpError('Service behavior is invalid', 400)
      );
    render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={null}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save behavior/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not save service behavior/i
    );
    expect(
      screen.getByRole('button', { name: /save behavior/i })
    ).toBeEnabled();
  });

  it('edits the actual field contract, including type and required state', () => {
    render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={null}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add field/i }));

    fireEvent.change(screen.getByLabelText(/field type/i), {
      target: { value: 'number' }
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /required/i }));

    expect(screen.getByLabelText(/field type/i)).toHaveValue('number');
    expect(screen.getByRole('checkbox', { name: /required/i })).toBeChecked();
  });

  it('edits select options and saves the exact canonical select field', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={null}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/field type/i), {
      target: { value: 'select' }
    });
    fireEvent.change(screen.getByLabelText(/option key/i), {
      target: { value: 'vip' }
    });
    fireEvent.change(screen.getByLabelText(/option label/i), {
      target: { value: 'VIP visitor' }
    });
    fireEvent.change(screen.getByLabelText(/retention days/i), {
      target: { value: '7' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save behavior/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      'service-1',
      expect.objectContaining({
        fields: [
          {
            key: 'field_1',
            label: { en: 'Field' },
            type: 'select',
            required: false,
            options: [{ key: 'vip', label: { en: 'VIP visitor' } }]
          }
        ]
      })
    );
  });

  it('keeps generated field and select-option keys unique after removals', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={null}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    fireEvent.click(
      screen.getAllByRole('button', { name: /remove field/i })[0]!
    );
    fireEvent.click(screen.getByRole('button', { name: /add field/i }));

    const fieldKeys = screen
      .getAllByLabelText(/^key$/i)
      .map((input) => (input as HTMLInputElement).value);
    expect(new Set(fieldKeys)).toHaveLength(fieldKeys.length);

    fireEvent.change(screen.getAllByLabelText(/field type/i)[0]!, {
      target: { value: 'select' }
    });
    fireEvent.click(screen.getByRole('button', { name: /add option/i }));
    fireEvent.click(
      screen.getAllByRole('button', { name: /remove option/i })[0]!
    );
    fireEvent.click(screen.getByRole('button', { name: /add option/i }));

    const optionKeys = screen
      .getAllByLabelText(/option key/i)
      .map((input) => (input as HTMLInputElement).value);
    expect(new Set(optionKeys)).toHaveLength(optionKeys.length);
  });

  it('resets editable state when the selected service changes and preserves page-slot routes', () => {
    const { rerender } = render(
      <ServiceBehaviorEditor
        serviceId='service-1'
        value={{
          version: 1,
          information: { body: { en: 'First service' } },
          fields: [],
          route: { mode: 'auto' }
        }}
        onSave={vi.fn()}
      />
    );

    rerender(
      <ServiceBehaviorEditor
        serviceId='service-2'
        value={{
          version: 1,
          information: { body: { en: 'Second service' } },
          fields: [],
          route: { mode: 'page-slot', slot: 'identity' }
        }}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/information/i)).toHaveValue('Second service');
    expect(screen.getByLabelText(/route mode/i)).toHaveValue('identity');
  });
});
