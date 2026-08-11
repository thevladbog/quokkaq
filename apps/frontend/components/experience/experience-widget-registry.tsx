'use client';

import type {
  DeviceProfile,
  ExperienceSurface,
  ExperienceWidget,
  ScreenWidgetType,
  AccessPolicy
} from '@quokkaq/shared-types';
import {
  AccessPolicySchema,
  ScreenWidgetTypeSchema
} from '@quokkaq/shared-types';
import { LockKeyhole, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type {
  ExperienceActivationEvent,
  ExperienceRuntimeContext,
  ExperienceRuntimeSession,
  ExperienceTicketStationAdapters
} from './experience-renderer';
import { cn } from '@/lib/utils';
import { ServicePickerWidget } from './widgets/service-picker-widget';
import { RichInfoWidget } from './widgets/rich-info-widget';
import { LanguageSwitchWidget } from './widgets/language-switch-widget';
import { TicketFormWidget } from './widgets/ticket-form-widget';
import { TicketSuccessWidget } from './widgets/ticket-success-widget';
import { IdentifyWidget } from './widgets/identify-widget';

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

type ExperienceServiceOption = {
  id: string;
  label: string;
  categoryId?: string;
  locale?: string;
  access?: AccessPolicy;
};

type ExperienceCategoryOption = {
  id: string;
  label: string;
  access?: AccessPolicy;
};

type ServicePickerOptions = {
  services: ExperienceServiceOption[];
  categories: ExperienceCategoryOption[];
};

export const MAX_QUEUE_DISPLAY_RECENT_CALLS = 3;

function activationEventFromWidget(
  widget: ExperienceWidget
): ExperienceActivationEvent {
  const event: ExperienceActivationEvent = {};
  for (const field of ['serviceId', 'categoryId', 'locale'] as const) {
    const value = widget.config[field];
    if (typeof value === 'string') event[field] = value;
  }
  return event;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function safeServicePickerOptions(
  widget: ExperienceWidget
): ServicePickerOptions {
  const catalog = widget.config.catalog;
  if (
    catalog === null ||
    typeof catalog !== 'object' ||
    Array.isArray(catalog)
  ) {
    return { services: [], categories: [] };
  }
  const configured = catalog as Record<string, unknown>;
  const accessFor = (item: Record<string, unknown>) => {
    const behavior = item.behavior;
    const candidate =
      behavior && typeof behavior === 'object' && !Array.isArray(behavior)
        ? (behavior as Record<string, unknown>).access
        : item.access;
    const parsed = AccessPolicySchema.safeParse(candidate);
    return parsed.success ? { access: parsed.data } : {};
  };
  const serviceIds = new Set<string>();
  const services = Array.isArray(configured.services)
    ? configured.services.slice(0, 100).flatMap((candidate) => {
        if (candidate === null || typeof candidate !== 'object') return [];
        const item = candidate as Record<string, unknown>;
        const id = nonEmptyString(item.id);
        const label = nonEmptyString(item.label);
        if (!id || !label || serviceIds.has(id)) return [];
        serviceIds.add(id);
        const categoryId = nonEmptyString(item.categoryId);
        const locale = nonEmptyString(item.locale);
        return [
          {
            id,
            label,
            ...(categoryId ? { categoryId } : {}),
            ...(locale ? { locale } : {}),
            ...accessFor(item)
          }
        ];
      })
    : [];
  const categoryIds = new Set<string>();
  const categories = Array.isArray(configured.categories)
    ? configured.categories.slice(0, 100).flatMap((candidate) => {
        if (candidate === null || typeof candidate !== 'object') return [];
        const item = candidate as Record<string, unknown>;
        const id = nonEmptyString(item.id);
        const label = nonEmptyString(item.label);
        if (!id || !label || categoryIds.has(id)) return [];
        categoryIds.add(id);
        return [{ id, label, ...accessFor(item) }];
      })
    : [];
  return { services, categories };
}

function QueueDisplayCalls({
  context,
  profile
}: {
  context: ExperienceRuntimeContext;
  profile: DeviceProfile;
}) {
  const t = useTranslations('experience.runtime.task12');
  const primary = context.display?.primaryCall;
  const recent = (context.display?.recentCalls ?? []).slice(
    0,
    MAX_QUEUE_DISPLAY_RECENT_CALLS
  );
  const layout = profile.height > profile.width ? 'portrait' : 'landscape';

  return (
    <section
      data-testid='queue-display-calls'
      data-layout={layout}
      data-profile-size={`${profile.width}x${profile.height}`}
      className='flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-700/60 bg-white p-5 shadow-sm'
    >
      <header className='flex shrink-0 items-center justify-between gap-6 text-xl font-semibold'>
        <span className='truncate'>{context.display?.unitName ?? ''}</span>
        <time className='font-mono text-2xl font-bold tabular-nums'>
          {context.display?.nowLabel ?? ''}
        </time>
      </header>
      <div
        data-testid='queue-display-call-hierarchy'
        className={cn(
          'mt-6 grid min-h-0 flex-1 gap-4 overflow-hidden',
          layout === 'portrait'
            ? 'grid-rows-[minmax(0,2fr)_minmax(0,1fr)]'
            : 'grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]'
        )}
      >
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
          className={cn(
            'grid min-h-0 gap-3 overflow-hidden',
            layout === 'portrait' ? 'grid-cols-3' : 'grid-rows-3'
          )}
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
  profile,
  locked,
  onActivate,
  ticketStation
}: {
  widget: ExperienceWidget;
  surface: ExperienceSurface;
  context: ExperienceRuntimeContext;
  profile: DeviceProfile;
  locked: boolean;
  onActivate: (event: ExperienceActivationEvent) => void;
  session: ExperienceRuntimeSession;
  ticketStation?: ExperienceTicketStationAdapters;
}) {
  const label = String(
    widget.config.label ?? widget.config.title ?? widget.type
  );
  if (widget.type === 'service-picker') {
    return (
      <ServicePickerWidget
        services={safeServicePickerOptions(widget).services}
        categories={safeServicePickerOptions(widget).categories}
        conditionContext={context}
        profile={profile}
        locked={locked}
        onSelectService={(service) =>
          onActivate({
            serviceId: service.id,
            ...(service.categoryId ? { categoryId: service.categoryId } : {}),
            ...(service.locale ? { locale: service.locale } : {})
          })
        }
        onSelectCategory={(category) => onActivate({ categoryId: category.id })}
      />
    );
  }
  if (widget.type === 'rich-info') {
    const body = widget.config.body;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return (
        <RichInfoWidget
          body={body as Record<string, string>}
          locale='en'
          requireAcknowledgement={widget.config.requireAcknowledgement === true}
          onContinue={() => onActivate({})}
        />
      );
    }
  }
  if (widget.type === 'language-switch') {
    const locales = Array.isArray(widget.config.locales)
      ? widget.config.locales.filter(
          (locale): locale is string => typeof locale === 'string'
        )
      : ['en'];
    return (
      <LanguageSwitchWidget
        locales={locales}
        onChange={(locale) => onActivate({ locale })}
      />
    );
  }
  if (widget.type === 'ticket-form') {
    const fields = widget.config.fields;
    if (Array.isArray(fields)) {
      return (
        <TicketFormWidget
          fields={fields as never}
          locale='en'
          onSubmit={(value) =>
            onActivate({ session: { documentsData: value.documentsData } })
          }
        />
      );
    }
  }
  if (widget.type === 'identify') {
    const service = widget.config.service;
    if (
      service &&
      typeof service === 'object' &&
      !Array.isArray(service) &&
      ticketStation?.identification
    ) {
      return (
        <IdentifyWidget
          service={service as never}
          adapter={ticketStation.identification}
          onIdentified={(identity, data) =>
            onActivate({
              session: {
                identity,
                ...(data ? { documentsData: data } : {})
              }
            })
          }
          onBack={() => onActivate({})}
        />
      );
    }
  }
  if (widget.type === 'ticket-success') {
    const success = widget.config.success;
    if (success && typeof success === 'object' && !Array.isArray(success)) {
      return (
        <TicketSuccessWidget
          success={success as never}
          onReset={() => onActivate({})}
        />
      );
    }
  }
  if (surface === 'queue-display' && widget.type === 'called-tickets') {
    return <QueueDisplayCalls context={context} profile={profile} />;
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
      onClick={
        locked ? undefined : () => onActivate(activationEventFromWidget(widget))
      }
      className='bg-card text-card-foreground focus-visible:ring-ring flex h-full min-h-11 w-full items-center justify-center overflow-hidden rounded-xl border p-5 text-center text-lg font-semibold shadow-sm outline-none focus-visible:ring-2 disabled:opacity-50'
    >
      {locked ? <LockKeyhole className='mr-2 size-5' aria-hidden /> : null}
      <span className='truncate'>{label}</span>
    </button>
  );
}
