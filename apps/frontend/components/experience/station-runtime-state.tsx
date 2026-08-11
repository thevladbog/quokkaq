'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { StationRuntimeState } from '@/lib/experience/station-runtime-state';

const labelKeys: Record<StationRuntimeState, string> = {
  attract: 'stationRuntime.states.attract',
  active: 'stationRuntime.states.active',
  submitting: 'stationRuntime.states.submitting',
  'success-printing': 'stationRuntime.states.successPrinting',
  success: 'stationRuntime.states.success',
  'print-failed': 'stationRuntime.states.printFailed',
  offline: 'stationRuntime.states.offline',
  'temporarily-unavailable': 'stationRuntime.states.temporarilyUnavailable',
  'timeout-warning': 'stationRuntime.states.timeoutWarning'
};

export function StationRuntimeStateView({
  state,
  children,
  onReset,
  onContinue
}: {
  state: StationRuntimeState;
  children?: ReactNode;
  onReset?: () => void;
  onContinue?: () => void;
}) {
  const t = useTranslations('experience.runtime.task12');
  if (state === 'active') return <>{children}</>;

  return (
    <section
      aria-live={state === 'submitting' ? 'polite' : 'assertive'}
      data-testid='station-runtime-state'
      data-state={state}
      className='flex h-full min-h-0 flex-col items-center justify-center gap-5 overflow-hidden p-8 text-center'
    >
      <h1 className='text-3xl font-bold'>{t(labelKeys[state])}</h1>
      {state === 'timeout-warning' ? (
        <p className='text-lg'>{t('stationRuntime.timeoutDescription')}</p>
      ) : null}
      {onContinue && state === 'timeout-warning' ? (
        <Button
          type='button'
          size='lg'
          className='min-h-14 font-semibold'
          onClick={onContinue}
        >
          {t('stationRuntime.actions.continue')}
        </Button>
      ) : null}
      {onReset && state !== 'submitting' && state !== 'success-printing' ? (
        <Button
          type='button'
          variant='outline'
          size='lg'
          className='min-h-14 font-semibold'
          onClick={onReset}
        >
          {t('stationRuntime.actions.startOver')}
        </Button>
      ) : null}
    </section>
  );
}
