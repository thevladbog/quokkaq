'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

export interface StaffWorkstationShellProps {
  unitName: string;
  counterName: string;
  operatorName: string;
  statusControls: ReactNode;
  main: ReactNode;
  queue: ReactNode;
}

export function StaffWorkstationShell({
  unitName,
  counterName,
  operatorName,
  statusControls,
  main,
  queue
}: StaffWorkstationShellProps) {
  const { setOpen } = useSidebar();
  const sidebarClosedOnMount = useRef(false);

  useEffect(() => {
    if (sidebarClosedOnMount.current) return;

    sidebarClosedOnMount.current = true;
    setOpen(false);
  }, [setOpen]);

  return (
    <section
      data-testid='staff-workstation-shell'
      className='flex min-w-0 flex-col gap-3 min-[1366px]:h-full min-[1366px]:min-h-0 min-[1366px]:overflow-hidden'
    >
      <header className='flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <p className='truncate text-xs'>{unitName}</p>
          <h1 className='truncate text-xl font-bold'>{counterName}</h1>
          <p className='text-muted-foreground truncate text-xs'>
            {operatorName}
          </p>
        </div>
        <div className='sm:shrink-0'>{statusControls}</div>
      </header>
      <div className='grid min-h-0 flex-1 gap-4 min-[1366px]:grid-cols-[minmax(0,1fr)_25rem] min-[1366px]:gap-3'>
        <main className='min-h-0 min-w-0'>{main}</main>
        <aside className='min-h-0 min-w-0'>{queue}</aside>
      </div>
    </section>
  );
}
