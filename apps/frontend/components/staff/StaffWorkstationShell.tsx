'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

export interface StaffWorkstationShellProps {
  unitName: string;
  counterName: string;
  statusControls: ReactNode;
  main: ReactNode;
  queue: ReactNode;
}

export function StaffWorkstationShell({
  unitName,
  counterName,
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
      className='flex min-w-0 flex-col gap-3 md:h-full md:min-h-0 md:overflow-hidden'
    >
      <header className='flex shrink-0 items-center justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-xs'>{unitName}</p>
          <h1 className='truncate text-xl font-bold'>{counterName}</h1>
        </div>
        <div className='shrink-0'>{statusControls}</div>
      </header>
      <div className='grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]'>
        <main className='min-h-0 min-w-0'>{main}</main>
        <aside className='min-h-0 min-w-0'>{queue}</aside>
      </div>
    </section>
  );
}
