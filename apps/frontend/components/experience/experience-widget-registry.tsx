'use client';

import type {
  ExperienceSurface,
  ExperienceWidget,
  ScreenWidgetType
} from '@quokkaq/shared-types';
import { ScreenWidgetTypeSchema } from '@quokkaq/shared-types';
import { LockKeyhole, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type {
  ExperienceRuntimeAdapters,
  ExperienceRuntimeContext
} from './experience-renderer';

const allWidgetTypes = ScreenWidgetTypeSchema.options;
const without = (blocked: ReadonlySet<ScreenWidgetType>) =>
  new Set(allWidgetTypes.filter((type) => !blocked.has(type)));
const displayBlocked = new Set<ScreenWidgetType>([
  'service-picker',
  'ticket-form',
  'identify',
  'ticket-success'
]);

/** Mirrors the shared publish validator's surface capability contract. */
const surfaceCapabilities: Record<
  ExperienceSurface,
  ReadonlySet<ScreenWidgetType>
> = {
  'queue-display': without(displayBlocked),
  'counter-display': without(displayBlocked),
  'ticket-station': without(new Set<ScreenWidgetType>(['custom-html'])),
  'visitor-mobile': new Set([
    'service-picker',
    'rich-info',
    'ticket-form',
    'language-switch',
    'ticket-success',
    'media',
    'eta-display',
    'clock',
    'join-queue-qr'
  ])
};

export function supportsExperienceWidget(
  surface: ExperienceSurface,
  type: unknown
): type is ScreenWidgetType {
  return (
    typeof type === 'string' &&
    surfaceCapabilities[surface].has(type as ScreenWidgetType)
  );
}

export function isKnownExperienceWidget(
  type: unknown
): type is ScreenWidgetType {
  return ScreenWidgetTypeSchema.safeParse(type).success;
}

export type QueueDisplayCall = {
  id: string;
  queueNumber: string;
  counterName: string;
};

export type QueueDisplayRuntimeData = {
  unitName: string;
  nowLabel: string;
  primaryCall?: QueueDisplayCall;
  recentCalls?: QueueDisplayCall[];
};

export const MAX_QUEUE_DISPLAY_RECENT_CALLS = 3;

function QueueDisplayCalls({
  context,
  adapters
}: {
  context: ExperienceRuntimeContext;
  adapters: ExperienceRuntimeAdapters;
}) {
  const t = useTranslations('experience.runtime.task12');
  const primary = context.display?.primaryCall;
  const recent = (context.display?.recentCalls ?? []).slice(
    0,
    MAX_QUEUE_DISPLAY_RECENT_CALLS
  );
  const lastAnnouncedCallId = useRef<string | null>(null);
  const audioCall = adapters.audioCall;

  useEffect(() => {
    if (!primary) {
      lastAnnouncedCallId.current = null;
      return;
    }
    if (lastAnnouncedCallId.current === primary.id) return;
    lastAnnouncedCallId.current = primary.id;
    audioCall?.(primary);
  }, [audioCall, primary]);

  return (
    <section className='flex h-full min-h-0 flex-col rounded-2xl border border-emerald-700/60 bg-white p-5 shadow-sm'>
      <header className='flex shrink-0 items-center justify-between gap-6 text-xl font-semibold'>
        <span className='truncate'>{context.display?.unitName ?? ''}</span>
        <time className='font-mono text-2xl font-bold tabular-nums'>
          {context.display?.nowLabel ?? ''}
        </time>
      </header>
      <div className='mt-6 grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)] gap-4'>
        <div
          data-testid='primary-called-ticket'
          data-motion={context.prefersReducedMotion ? 'reduced' : 'full'}
          className='flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-xl bg-neutral-950 px-8 py-10 text-center text-white motion-safe:transition-colors motion-reduce:transition-none'
        >
          {primary ? (
            <>
              <p className='text-sm font-medium tracking-[0.18em] text-neutral-400 uppercase'>
                {t('queue.invited', { default: 'Now serving' })}
              </p>
              <strong className='mt-5 max-w-full truncate font-mono text-[clamp(4rem,10vw,9rem)] leading-none font-black tracking-tight'>
                {primary.queueNumber}
              </strong>
              <p className='mt-6 max-w-full truncate text-3xl font-semibold uppercase'>
                {primary.counterName}
              </p>
            </>
          ) : (
            <p className='text-3xl font-semibold text-neutral-300'>
              {t('queue.waiting', { default: 'Waiting for the next call' })}
            </p>
          )}
        </div>
        <ol
          className='grid min-h-0 grid-rows-3 gap-3'
          aria-label={t('queue.recent', { default: 'Next and recent calls' })}
        >
          {recent.map((call) => (
            <li
              key={call.id}
              data-testid='recent-called-ticket'
              className='flex min-h-0 items-center gap-3 overflow-hidden rounded-xl bg-neutral-100 px-5 py-4 font-mono text-xl font-semibold'
            >
              <strong className='shrink-0'>{call.queueNumber}</strong>
              <span aria-hidden>·</span>
              <span className='truncate'>{call.counterName}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function ExperienceWidgetDiagnostic({
  reason
}: {
  reason: 'unknown' | 'unsupported';
}) {
  const t = useTranslations('experience.runtime.task12');
  return (
    <div
      role='status'
      className='flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed border-amber-500 bg-amber-50 p-5 text-center text-sm font-semibold text-amber-950'
    >
      <TriangleAlert className='mr-2 size-5 shrink-0' aria-hidden />
      {reason === 'unsupported'
        ? t('widget.unsupported', {
            default: 'Widget is not available on this surface'
          })
        : t('widget.unknown', { default: 'Unknown widget type' })}
    </div>
  );
}

export function ExperienceWidgetRegistry({
  widget,
  surface,
  context,
  adapters,
  locked,
  onActivate
}: {
  widget: ExperienceWidget;
  surface: ExperienceSurface;
  context: ExperienceRuntimeContext;
  adapters: ExperienceRuntimeAdapters;
  locked: boolean;
  onActivate: () => void;
}) {
  const label = String(
    widget.config.label ?? widget.config.title ?? widget.type
  );
  if (surface === 'queue-display' && widget.type === 'called-tickets') {
    return <QueueDisplayCalls context={context} adapters={adapters} />;
  }

  if (widget.actions.length === 0) {
    return (
      <div className='bg-card text-card-foreground flex h-full min-h-11 w-full items-center justify-center overflow-hidden rounded-xl border p-5 text-center text-lg font-semibold shadow-sm'>
        <span className='truncate'>{label}</span>
      </div>
    );
  }

  return (
    <button
      type='button'
      aria-disabled={locked ? 'true' : undefined}
      onClick={locked ? undefined : onActivate}
      className='bg-card text-card-foreground focus-visible:ring-ring flex h-full min-h-11 w-full items-center justify-center overflow-hidden rounded-xl border p-5 text-center text-lg font-semibold shadow-sm outline-none focus-visible:ring-2 disabled:opacity-50'
    >
      {locked ? <LockKeyhole className='mr-2 size-5' aria-hidden /> : null}
      <span className='truncate'>{label}</span>
    </button>
  );
}
