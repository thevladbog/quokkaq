import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffWorkstationShell } from './StaffWorkstationShell';

const sidebar = vi.hoisted(() => ({ setOpen: vi.fn() }));

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ setOpen: sidebar.setOpen })
}));

describe('StaffWorkstationShell', () => {
  beforeEach(() => {
    sidebar.setOpen = vi.fn();
  });

  it('closes the sidebar on mount and renders fixed-height workstation slots', () => {
    render(
      <StaffWorkstationShell
        unitName='Central office'
        counterName='Counter 12'
        operatorName='Ada Operator'
        statusControls={<button type='button'>Available</button>}
        main={<div>Main workstation</div>}
        queue={<div>Queue</div>}
      />
    );

    expect(sidebar.setOpen).toHaveBeenCalledTimes(1);
    expect(sidebar.setOpen).toHaveBeenCalledWith(false);

    const shell = screen.getByTestId('staff-workstation-shell');
    expect(shell).toHaveClass(
      'min-[1366px]:h-full',
      'min-[1366px]:min-h-0',
      'min-[1366px]:overflow-hidden'
    );
    expect(shell.querySelector('main')).toHaveClass('min-h-0', 'min-w-0');
    expect(shell.querySelector('aside')).toHaveClass('min-h-0', 'min-w-0');
    expect(shell.querySelector('main')?.parentElement).toHaveClass(
      'min-h-0',
      'flex-1',
      'gap-4',
      'min-[1366px]:gap-3',
      'min-[1366px]:grid-cols-[minmax(0,1fr)_25rem]'
    );
    expect(shell.querySelector('main')?.parentElement).not.toHaveClass(
      'lg:grid-cols-[minmax(0,1fr)_22rem]',
      'xl:grid-cols-[minmax(0,1fr)_25rem]'
    );
    expect(shell.querySelector('header')).toHaveClass(
      'flex-col',
      'items-stretch',
      'sm:flex-row',
      'sm:items-center'
    );

    expect(screen.getByText('Central office')).toBeInTheDocument();
    expect(screen.getByText('Ada Operator')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Counter 12' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Available' })
    ).toBeInTheDocument();
    expect(screen.getByText('Main workstation')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
  });

  it('does not close the sidebar again after it is manually reopened', () => {
    const props = {
      unitName: 'Central office',
      counterName: 'Counter 12',
      operatorName: 'Ada Operator',
      statusControls: <button type='button'>Available</button>,
      main: <div>Main workstation</div>,
      queue: <div>Queue</div>
    };
    const { rerender } = render(<StaffWorkstationShell {...props} />);
    const reopenedSetOpen = vi.fn();

    sidebar.setOpen = reopenedSetOpen;
    rerender(<StaffWorkstationShell {...props} />);

    expect(reopenedSetOpen).not.toHaveBeenCalled();
  });
});
