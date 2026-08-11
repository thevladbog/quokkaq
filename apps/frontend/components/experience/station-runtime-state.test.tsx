import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StationRuntimeStateView } from './station-runtime-state';

describe('StationRuntimeStateView', () => {
  it('keeps the active experience content untouched', () => {
    render(
      <StationRuntimeStateView state='active'>
        <button type='button'>Choose a service</button>
      </StationRuntimeStateView>
    );
    expect(
      screen.getByRole('button', { name: 'Choose a service' })
    ).toBeVisible();
    expect(screen.queryByTestId('station-runtime-state')).toBeNull();
  });

  it('renders bounded states and a reset action', () => {
    const onReset = vi.fn();
    render(<StationRuntimeStateView state='print-failed' onReset={onReset} />);
    expect(screen.getByTestId('station-runtime-state')).toHaveAttribute(
      'data-state',
      'print-failed'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
