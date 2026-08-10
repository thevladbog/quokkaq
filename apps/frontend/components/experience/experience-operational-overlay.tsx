'use client';

import {
  AlertTriangle,
  DoorClosed,
  RadioTower,
  Users,
  WifiOff
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type {
  OperationalState,
  ResolvedOperationalState
} from '@/lib/experience/operational-state';
import { cn } from '@/lib/utils';

const statePresentation: Record<
  Exclude<OperationalState, 'normal'>,
  {
    title: string;
    description: string;
    tone: string;
    icon: typeof AlertTriangle;
  }
> = {
  emergency: {
    title: 'Attention',
    description: 'Follow staff instructions.',
    tone: 'border-red-500 bg-[#2b1111] text-white',
    icon: AlertTriangle
  },
  'temporarily-unavailable': {
    title: 'Temporarily unavailable',
    description: 'Please wait for service to resume.',
    tone: 'border-amber-500 bg-amber-50 text-amber-950',
    icon: RadioTower
  },
  'stale-offline': {
    title: 'Data is temporarily not updating',
    description: 'The last available queue state is no longer current.',
    tone: 'border-amber-500 bg-[#fff7e6] text-amber-950',
    icon: WifiOff
  },
  closed: {
    title: 'This location is closed',
    description: 'Opening information will appear here when available.',
    tone: 'border-neutral-400 bg-white text-neutral-950',
    icon: DoorClosed
  },
  'no-active-counters': {
    title: 'No service counters are active',
    description: 'Please wait for a counter to open.',
    tone: 'border-blue-400 bg-blue-50 text-blue-950',
    icon: Users
  },
  empty: {
    title: 'The queue is currently empty',
    description: 'New calls will appear here automatically.',
    tone: 'border-emerald-500 bg-emerald-50 text-emerald-950',
    icon: Users
  }
};

export function ExperienceOperationalOverlay({
  resolved
}: {
  resolved: ResolvedOperationalState;
}) {
  const t = useTranslations('experience.runtime.task12');
  if (resolved.state === 'normal') {
    return resolved.media === 'failed' ? (
      <div
        role='status'
        data-operational-state='media-failure'
        className='absolute right-6 bottom-6 z-20 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm'
      >
        {t('mediaFailure', { default: 'Media is temporarily unavailable' })}
      </div>
    ) : null;
  }

  const presentation = statePresentation[resolved.state];
  const Icon = presentation.icon;
  return (
    <section
      role={resolved.state === 'emergency' ? 'alert' : 'status'}
      aria-live={resolved.state === 'emergency' ? 'assertive' : 'polite'}
      data-operational-state={resolved.state}
      className={cn(
        'absolute inset-0 z-30 flex items-center justify-center border-2 p-12 text-center',
        presentation.tone
      )}
    >
      <div className='mx-auto flex max-w-3xl flex-col items-center gap-5'>
        <Icon className='size-14' strokeWidth={1.7} aria-hidden />
        <h1 className='text-4xl font-bold tracking-tight md:text-6xl'>
          {t(`states.${resolved.state}.title`, {
            default: presentation.title
          })}
        </h1>
        <p className='max-w-2xl text-xl opacity-75 md:text-2xl'>
          {t(`states.${resolved.state}.description`, {
            default: presentation.description
          })}
        </p>
      </div>
    </section>
  );
}
