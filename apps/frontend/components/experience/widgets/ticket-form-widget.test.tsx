import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TicketFormWidget } from './ticket-form-widget';

describe('TicketFormWidget', () => {
  afterEach(cleanup);
  it('keeps trusted field values namespaced under documentsData.form and blocks invalid submit', async () => {
    const onSubmit = vi.fn();
    render(
      <TicketFormWidget
        fields={[
          {
            key: 'phone',
            label: { en: 'Phone' },
            type: 'phone',
            required: true
          }
        ]}
        locale='en'
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/invalid/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Phone'), {
      target: { value: '8 (999) 123-45-67' }
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText('Phone is invalid')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Phone'), {
      target: { value: '+79991234567' }
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        documentsData: { form: { phone: '+79991234567' } }
      })
    );
  });
});
