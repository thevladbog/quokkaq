'use client';

import type { ReactNode } from 'react';

import type { StationRuntimeState } from '@/lib/experience/station-runtime-state';

const labels: Record<StationRuntimeState, string> = {
  attract: 'Ready to begin',
  active: '',
  submitting: 'Creating your ticket…',
  'success-printing': 'Printing your ticket…',
  success: 'Your ticket is ready',
  'print-failed': 'Ticket created — printing needs attention',
  offline: 'Connection unavailable',
  'temporarily-unavailable': 'Temporarily unavailable',
  'timeout-warning': 'Are you still there?'
};

export function StationRuntimeStateView({
  state,
  children,
  onReset
}: {
  state: StationRuntimeState;
  children?: ReactNode;
  onReset?: () => void;
}) {
  if (state === 'active') return <>{children}</>;

  return (
    <section
      aria-live={state === 'submitting' ? 'polite' : 'assertive'}
      data-testid='station-runtime-state'
      data-state={state}
      className='flex h-full min-h-0 flex-col items-center justify-center gap-5 overflow-hidden p-8 text-center'
    >
      <h1 className='text-3xl font-bold'>{labels[state]}</h1>
      {state === 'timeout-warning' ? (
        <p className='text-lg'>Tap to continue or start over.</p>
      ) : null}
      {onReset && state !== 'submitting' && state !== 'success-printing' ? (
        <button
          type='button'
          className='min-h-14 rounded-lg border px-6 font-semibold'
          onClick={onReset}
        >
          Start over
        </button>
      ) : null}
    </section>
  );
}
