import { afterEach, describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DatePickerSingleOrRange,
  type DatePickerSingleOrRangeLabels
} from './date-picker-single-or-range';

vi.mock('next-intl', () => ({
  useLocale: () => 'en'
}));

afterEach(() => {
  cleanup();
});

const OPEN_LABEL = 'Open calendar';
const labels = { openCalendar: OPEN_LABEL, rangeAwaitingEnd: '...' };

/** Get the popover trigger button by its exact aria-label. */
function getTrigger() {
  return screen.getByRole('button', { name: OPEN_LABEL });
}

describe('DatePickerSingleOrRange — trigger label', () => {
  it('shows placeholder when no date is set', () => {
    render(
      <DatePickerSingleOrRange
        from=''
        onRangeChange={vi.fn()}
        labels={labels}
      />
    );
    expect(getTrigger()).toBeInTheDocument();
    expect(getTrigger().textContent).toContain(OPEN_LABEL);
  });

  it('shows awaiting-end indicator after first date picked', () => {
    render(
      <DatePickerSingleOrRange
        from='2026-04-10'
        to={undefined}
        onRangeChange={vi.fn()}
        labels={{ ...labels, rangeAwaitingEnd: '...' }}
      />
    );
    expect(getTrigger().textContent).toContain('...');
  });

  it('shows full date range when both from and to are set', () => {
    render(
      <DatePickerSingleOrRange
        from='2026-04-10'
        to='2026-04-15'
        onRangeChange={vi.fn()}
        labels={labels}
      />
    );
    const text = getTrigger().textContent ?? '';
    expect(text).toContain('April 10');
    expect(text).toContain('April 15');
  });

  it('shows single date (no dash) when from equals to', () => {
    render(
      <DatePickerSingleOrRange
        from='2026-04-10'
        to='2026-04-10'
        onRangeChange={vi.fn()}
        labels={labels}
      />
    );
    const text = getTrigger().textContent ?? '';
    expect(text).toContain('April 10');
    // Single-day range should not show a second date separated by em-dash.
    expect(text).not.toMatch(/April 10.*—.*April 10/);
  });
});

/** react-day-picker renders two months side-by-side, so there are always 2 grids. */
function getFirstGrid() {
  const grids = screen.getAllByRole('grid');
  if (grids.length === 0) throw new Error('Calendar grid not found');
  return grids[0];
}

/** A stateful wrapper that mirrors how a parent page would use the component. */
function StatefulPicker({
  initialFrom = '',
  initialTo = '',
  onRangeChange: spy
}: {
  initialFrom?: string;
  initialTo?: string;
  onRangeChange?: (from: string, to: string | undefined) => void;
}) {
  const l: DatePickerSingleOrRangeLabels = {
    openCalendar: OPEN_LABEL,
    rangeAwaitingEnd: '...'
  };
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  return (
    <DatePickerSingleOrRange
      from={from}
      to={to}
      onRangeChange={(f, t) => {
        setFrom(f);
        setTo(t ?? '');
        spy?.(f, t);
      }}
      labels={l}
    />
  );
}

describe('DatePickerSingleOrRange — popover behaviour', () => {
  it('opens the calendar when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DatePickerSingleOrRange
        from='2026-04-10'
        to='2026-04-15'
        onRangeChange={vi.fn()}
        labels={labels}
      />
    );
    // Calendar should not be present before opening.
    expect(screen.queryAllByRole('grid')).toHaveLength(0);
    await user.click(getTrigger());
    // Two month grids visible after opening.
    expect(screen.queryAllByRole('grid').length).toBeGreaterThan(0);
  });

  it('resets selection (to=undefined) when clicking a day on a complete range', async () => {
    const onRangeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DatePickerSingleOrRange
        from='2026-04-10'
        to='2026-04-15'
        onRangeChange={onRangeChange}
        labels={labels}
      />
    );

    // Open the popover.
    await user.click(getTrigger());
    const grid = getFirstGrid();

    // Click the first enabled day cell in the calendar grid.
    const clickable = within(grid)
      .getAllByRole('button')
      .find((b) => !b.hasAttribute('disabled'));
    if (!clickable) throw new Error('No enabled day cell found in calendar');

    await user.click(clickable);

    // When a range is already complete, any click must start a fresh selection.
    expect(onRangeChange).toHaveBeenCalledOnce();
    const [, secondArg] = onRangeChange.mock.calls[0];
    expect(secondArg).toBeUndefined();
  });

  it('stays open after a range-reset click, allowing the user to pick a new start', async () => {
    // UX flow:
    //   1. Calendar has a complete range {from, to}.
    //   2. User clicks any day → component resets to (clickedDay, undefined).
    //   3. The popover must stay open so the user can then pick the end date.
    //   4. When the user picks the end date, the popover finally closes.
    //
    // We use a StatefulPicker so that the component state actually updates between clicks.
    const onRangeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <StatefulPicker
        initialFrom='2026-04-10'
        initialTo='2026-04-15'
        onRangeChange={onRangeChange}
      />
    );

    // Open the calendar.
    await user.click(getTrigger());
    expect(screen.queryAllByRole('grid').length).toBeGreaterThan(0);

    // Click a day inside the grid (range-reset path: complete range → fresh start).
    const grid1 = getFirstGrid();
    const day1 = within(grid1)
      .getAllByRole('button')
      .find((b) => !b.hasAttribute('disabled'));
    if (!day1) throw new Error('No enabled day cell found for click 1');
    await user.click(day1);

    // After reset, onRangeChange was called with (newFrom, undefined).
    expect(onRangeChange).toHaveBeenCalledOnce();
    expect(onRangeChange.mock.calls[0][1]).toBeUndefined();

    // The popover must still be open — the reset path does NOT call setOpen(false).
    expect(screen.queryAllByRole('grid').length).toBeGreaterThan(0);

    // Second click picks the end date and completes the new range → popover closes.
    const grid2 = getFirstGrid();
    const day2 = within(grid2)
      .getAllByRole('button')
      .find((b) => !b.hasAttribute('disabled'));
    if (!day2) throw new Error('No enabled day cell found for click 2');
    await user.click(day2);

    expect(onRangeChange).toHaveBeenCalledTimes(2);
    // The second call should have a non-null `to` (range completed).
    const secondCallTo = onRangeChange.mock.calls[1][1];
    expect(typeof secondCallTo).toBe('string');

    // Calendar is now closed.
    expect(screen.queryAllByRole('grid')).toHaveLength(0);
  });
});
