'use client';

import { useMemo, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import QRCode from 'react-qr-code';
import {
  ScreenTemplateSchema,
  isScreenTemplateCellGrid,
  type ScreenTemplate
} from '@quokkaq/shared-types';
import { formatAppDate, formatAppTime } from '@/lib/format-datetime';
import { getGetUnitsUnitIdTicketsQueryKey } from '@/lib/api/generated/tickets-counters';
import { useScreenRendererLiveData } from '@/components/screen/use-screen-renderer-live-data';
import { ContentPlayer } from '@/components/screen/content-player';
import { ScreenFullscreenAnnouncementOverlay } from '@/components/screen/screen-fullscreen-announcement-overlay';
import { ScreenRenderer } from '@/components/screen/screen-renderer';
import { CalledTicketsTable } from '@/components/screen/called-tickets-table';
import { QueueTicker } from '@/components/screen/queue-ticker';
import { Spinner } from '@/components/ui/spinner';
import { getUnitDisplayName } from '@/lib/unit-display';
import {
  displayEstimateToCallMinutes,
  displayMaxWaitInQueueMinutes
} from '@/lib/queue-eta-display';

interface ScreenUnitClientProps {
  unitId: string;
}

export function ScreenUnitClient({ unitId }: ScreenUnitClientProps) {
  const t = useTranslations('screen');
  const live = useScreenRendererLiveData(unitId);
  const {
    locale,
    intlLocale,
    queryClient,
    unit,
    isUnitLoading,
    ticketsLoading,
    ticketsPending,
    ticketsError,
    currentTime,
    contentSlides,
    queueStatus,
    calledTickets,
    waitingTicketsForScreen,
    annForRenderer,
    annFullscreen,
    virtualQueueEnabled,
    queueUrl,
    config,
    adConfig
  } = live;

  const screenTmpl: ScreenTemplate | null = useMemo(() => {
    if (!unit?.config) return null;
    const r = ScreenTemplateSchema.safeParse(
      (unit.config as { screenTemplate?: unknown })?.screenTemplate
    );
    return r.success ? r.data : null;
  }, [unit]);

  const useScreenTemplate = useMemo((): ScreenTemplate | null => {
    if (!screenTmpl) return null;
    const v = ScreenTemplateSchema.safeParse(screenTmpl);
    return v.success ? v.data : null;
  }, [screenTmpl]);

  const screenTemplateHasClock = useMemo(() => {
    const v = useScreenTemplate;
    if (!v) return false;
    if (isScreenTemplateCellGrid(v)) {
      return (
        v.portrait.widgets.some((w) => w.type === 'clock') ||
        v.landscape.widgets.some((w) => w.type === 'clock')
      );
    }
    return v.widgets.some((w) => w.type === 'clock');
  }, [useScreenTemplate]);

  /** Cell-grid layouts define chrome via widgets only — never the legacy unit top bar. */
  const showDefaultUnitTopBar = useMemo(
    () => !useScreenTemplate || !isScreenTemplateCellGrid(useScreenTemplate),
    [useScreenTemplate]
  );

  const showContent =
    Boolean(adConfig && adConfig.width > 0) && contentSlides.length > 0;
  const adWidth = adConfig?.width || 0;

  const isCustomColorsEnabled = adConfig?.isCustomColorsEnabled || false;
  const headerColor = isCustomColorsEnabled ? adConfig?.headerColor || '' : '';
  const bodyColor = isCustomColorsEnabled ? adConfig?.bodyColor || '' : '';

  if (isUnitLoading) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        <Spinner className='h-12 w-12' />
      </div>
    );
  }

  if (!unit) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        <h1 className='text-2xl'>{t('unitNotFound')}</h1>
      </div>
    );
  }

  if (ticketsLoading || ticketsPending) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        <Spinner className='h-12 w-12' />
      </div>
    );
  }

  if (ticketsError) {
    return (
      <div className='bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center'>
        <p className='text-muted-foreground max-w-md text-lg'>
          {t('ticketsLoadError')}
        </p>
        <button
          type='button'
          className='text-primary text-sm font-medium underline underline-offset-4'
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: getGetUnitsUnitIdTicketsQueryKey(unitId)
            })
          }
        >
          {t('ticketsLoadRetry')}
        </button>
      </div>
    );
  }

  return (
    <div
      className='bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden'
      style={{ backgroundColor: bodyColor || undefined }}
    >
      {annFullscreen.length > 0 && (
        <ScreenFullscreenAnnouncementOverlay items={annFullscreen} />
      )}
      {showDefaultUnitTopBar && (
        <div
          className='bg-card z-10 flex h-20 flex-none items-center justify-between border-b px-8 shadow-sm'
          style={{ backgroundColor: headerColor || undefined }}
        >
          <div className='flex items-center gap-4'>
            {(config?.adScreen?.logoUrl || config?.logoUrl) && (
              <div className='relative h-12 w-auto md:h-16'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={config?.adScreen?.logoUrl || config?.logoUrl || ''}
                  alt='Logo'
                  className='h-full w-auto object-contain'
                />
              </div>
            )}
            <h1 className='text-primary text-4xl font-bold'>
              {getUnitDisplayName(unit, locale)}
            </h1>
          </div>
          <div className='text-right'>
            {!screenTemplateHasClock && (
              <div className='font-mono text-3xl font-bold'>
                {formatAppTime(currentTime, intlLocale)}
              </div>
            )}
            <div
              className={
                screenTemplateHasClock
                  ? 'text-muted-foreground text-xl'
                  : 'text-muted-foreground text-lg'
              }
            >
              {formatAppDate(currentTime, intlLocale, 'full')}
            </div>
          </div>
        </div>
      )}

      {useScreenTemplate ? (
        <div className='min-h-0 flex-1 overflow-hidden'>
          <ScreenRenderer
            unitId={unitId}
            locale={locale}
            template={useScreenTemplate}
            unit={unit}
            calledTickets={calledTickets}
            waitingTickets={waitingTicketsForScreen}
            queueStatus={queueStatus}
            contentSlides={contentSlides}
            defaultImageSeconds={adConfig?.duration || 5}
            announcements={annForRenderer}
            adBodyColor={bodyColor}
            historyLimit={adConfig?.recentCallsHistoryLimit ?? 0}
            currentTime={currentTime}
            virtualQueueEnabled={virtualQueueEnabled}
            queueUrl={queueUrl}
          />
        </div>
      ) : (
        <div
          className='flex flex-1 flex-col overflow-hidden landscape:flex-row'
          style={
            {
              '--ad-size': `${adWidth}%`
            } as CSSProperties
          }
        >
          {showContent && (
            <div className='bg-muted/10 order-2 h-[var(--ad-size)] w-full border-t p-4 landscape:order-1 landscape:h-full landscape:w-[var(--ad-size)] landscape:border-t-0 landscape:border-r'>
              <div className='relative h-full w-full'>
                <ContentPlayer
                  slides={contentSlides}
                  defaultImageSeconds={adConfig?.duration || 5}
                />
              </div>
            </div>
          )}

          <div
            className={`bg-background order-1 p-0 landscape:order-2 ${showContent ? 'h-[calc(100%-var(--ad-size))] w-full landscape:h-full landscape:w-[calc(100%-var(--ad-size))]' : 'h-full w-full'}`}
          >
            <CalledTicketsTable
              tickets={calledTickets}
              backgroundColor={bodyColor}
              historyLimit={adConfig?.recentCallsHistoryLimit ?? 0}
            />
          </div>
        </div>
      )}

      {!useScreenTemplate && (queueStatus || virtualQueueEnabled) && (
        <div className='bg-card/90 z-20 flex flex-none items-center justify-between gap-6 border-t px-8 py-2'>
          {queueStatus && (
            <div className='flex flex-wrap items-center gap-4 text-sm'>
              {queueStatus.services && queueStatus.services.length > 0 ? (
                queueStatus.services.map((svc) => (
                  <span
                    key={svc.serviceId}
                    className='bg-muted/60 flex items-center gap-1.5 rounded-full px-3 py-0.5'
                  >
                    <strong className='max-w-[140px] truncate'>
                      {svc.serviceName}
                    </strong>
                    <span className='text-muted-foreground'>
                      {t('serviceQueue', { count: svc.queueLength })}
                      {displayEstimateToCallMinutes(svc.estimatedWaitMinutes) >
                        0 &&
                        ` · ~${displayEstimateToCallMinutes(svc.estimatedWaitMinutes)} ${t('minutes')}`}
                    </span>
                  </span>
                ))
              ) : (
                <>
                  <span>
                    {t('queueLength')}:{' '}
                    <strong className='tabular-nums transition-all duration-300'>
                      {queueStatus.queueLength}
                    </strong>
                  </span>
                  {displayEstimateToCallMinutes(
                    queueStatus.estimatedWaitMinutes
                  ) > 0 && (
                    <span>
                      {t('estimateToCall')}:{' '}
                      <strong className='tabular-nums transition-all duration-300'>
                        ~
                        {displayEstimateToCallMinutes(
                          queueStatus.estimatedWaitMinutes
                        )}{' '}
                        {t('minutes')}
                      </strong>
                    </span>
                  )}
                  {displayMaxWaitInQueueMinutes(
                    queueStatus.maxWaitingInQueueMinutes
                  ) > 0 && (
                    <span>
                      {t('maxWaitInQueueNow')}:{' '}
                      <strong className='tabular-nums transition-all duration-300'>
                        {displayMaxWaitInQueueMinutes(
                          queueStatus.maxWaitingInQueueMinutes
                        )}{' '}
                        {t('minutes')}
                      </strong>
                    </span>
                  )}
                  {queueStatus.activeCounters > 0 && (
                    <span>
                      {t('activeCounters')}:{' '}
                      <strong>{queueStatus.activeCounters}</strong>
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {virtualQueueEnabled && (
            <div className='flex items-center gap-3'>
              <p className='text-muted-foreground max-w-[120px] text-right text-xs leading-tight'>
                {t('scanToJoinQueue')}
              </p>
              <div className='rounded bg-white p-1'>
                <QRCode value={queueUrl} size={64} />
              </div>
            </div>
          )}
        </div>
      )}

      {!useScreenTemplate && (
        <div className='z-20 flex-none'>
          <QueueTicker tickets={waitingTicketsForScreen} locale={locale} />
        </div>
      )}
    </div>
  );
}
