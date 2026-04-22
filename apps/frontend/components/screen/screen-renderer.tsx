'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ScreenLayout,
  ScreenLayoutRegion,
  ScreenTemplate
} from '@quokkaq/shared-types';
import type { Unit } from '@quokkaq/shared-types';
import {
  ContentPlayer,
  type ContentSlide
} from '@/components/screen/content-player';
import { CalledTicketsTable } from '@/components/screen/called-tickets-table';
import { QueueTicker } from '@/components/screen/queue-ticker';
import { ScreenClockWidget } from '@/components/screen/widgets/screen-clock-widget';
import { ScreenEtaWidget } from '@/components/screen/widgets/screen-eta-widget';
import { ScreenQueueStatsWidget } from '@/components/screen/widgets/screen-queue-stats-widget';
import { ScreenAnnouncementsWidget } from '@/components/screen/widgets/screen-announcements-widget';
import { ScreenProgressBarWidget } from '@/components/screen/widgets/screen-progress-widget';
import { ScreenRssFeedWidget } from '@/components/screen/widgets/screen-rss-widget';
import { ScreenWeatherWidget } from '@/components/screen/widgets/screen-weather-widget';
import { getUnitDisplayName } from '@/lib/unit-display';
import type { Ticket } from '@/lib/api';

type QueueStatus = {
  queueLength: number;
  estimatedWaitMinutes: number;
  activeCounters: number;
  servedToday?: number;
};

type Ann = {
  id: string;
  text: string;
  style: string;
  priority: number;
};

type ScreenRendererProps = {
  unitId: string;
  locale: string;
  template: ScreenTemplate;
  unit: Unit;
  calledTickets: Ticket[];
  waitingTickets: Ticket[];
  queueStatus: QueueStatus | null;
  contentSlides: ContentSlide[];
  defaultImageSeconds: number;
  announcements: Ann[];
  adBodyColor: string;
  historyLimit: number;
};

type PanelStyle = NonNullable<ScreenLayoutRegion['panelStyle']>;

function effectivePanelStyle(
  layout: ScreenLayout,
  region: ScreenLayoutRegion,
  regionIndex: number
): PanelStyle {
  if (region.panelStyle) {
    return region.panelStyle;
  }
  if (
    layout.type === 'grid' &&
    layout.regions.length === 2 &&
    regionIndex === 1
  ) {
    return 'scrollPadded';
  }
  if (layout.type === 'grid' && layout.regions.length >= 3) {
    return 'splitSection';
  }
  return 'default';
}

function regionPanelClass(
  layout: ScreenLayout,
  region: ScreenLayoutRegion,
  regionIndex: number
): string {
  const base = 'min-h-0 overflow-hidden';
  const style = effectivePanelStyle(layout, region, regionIndex);
  switch (style) {
    case 'scrollPadded':
      return `${base} bg-muted/5 flex flex-col gap-3 overflow-y-auto rounded-xl border p-3`;
    case 'card':
      return `${base} rounded-lg border p-2`;
    case 'splitSection':
      return `${base} rounded-lg border p-2`;
    case 'default':
    default:
      return base;
  }
}

export function ScreenRenderer(props: ScreenRendererProps) {
  const {
    template,
    calledTickets,
    waitingTickets,
    queueStatus,
    contentSlides,
    defaultImageSeconds,
    announcements,
    adBodyColor,
    historyLimit,
    locale
  } = props;
  const t = useTranslations('screen');
  const qs = queueStatus;
  const firstWait = waitingTickets[0] ?? null;

  const widgetsByRegion = useMemo(() => {
    const m = new Map<string, typeof template.widgets>();
    for (const w of template.widgets) {
      const list = m.get(w.regionId) ?? [];
      list.push(w);
      m.set(w.regionId, list);
    }
    return m;
  }, [template]);

  const renderWidget = (type: string, config: Record<string, unknown>) => {
    switch (type) {
      case 'clock':
        return <ScreenClockWidget locale={locale} />;
      case 'eta-display':
        return <ScreenEtaWidget minutes={qs?.estimatedWaitMinutes ?? 0} />;
      case 'queue-stats':
        return (
          <ScreenQueueStatsWidget
            queueLength={qs == null ? null : qs.queueLength}
            activeCounters={qs == null ? null : qs.activeCounters}
            estimatedWaitMinutes={qs == null ? null : qs.estimatedWaitMinutes}
            servedToday={qs == null ? null : qs.servedToday}
          />
        );
      case 'announcements':
        return <ScreenAnnouncementsWidget items={announcements} />;
      case 'progress-bar':
        return <ScreenProgressBarWidget ticket={firstWait} />;
      case 'content-player': {
        const overlayTickets =
          (config as { overlayTickets?: boolean }).overlayTickets === true;
        if (overlayTickets) {
          return (
            <ContentPlayer
              slides={contentSlides}
              defaultImageSeconds={defaultImageSeconds}
              overlayMode
              overlay={
                <div
                  className='bg-background/90 max-h-40 w-full overflow-hidden rounded-lg border p-2 shadow-lg'
                  style={{ maxHeight: '10rem' }}
                >
                  <CalledTicketsTable
                    tickets={calledTickets}
                    backgroundColor={adBodyColor}
                    historyLimit={historyLimit}
                  />
                </div>
              }
            />
          );
        }
        return (
          <ContentPlayer
            slides={contentSlides}
            defaultImageSeconds={defaultImageSeconds}
          />
        );
      }
      case 'called-tickets':
        return (
          <CalledTicketsTable
            tickets={calledTickets}
            backgroundColor={adBodyColor}
            historyLimit={historyLimit}
          />
        );
      case 'queue-ticker':
        return <QueueTicker tickets={waitingTickets} locale={locale} />;
      case 'rss-feed': {
        const feedId = String(
          (config as { feedId?: string })?.feedId ?? ''
        ).trim();
        if (!feedId) {
          return (
            <p className='text-muted-foreground text-sm'>
              {t('feeds.missing', { default: 'Configure feed in admin' })}
            </p>
          );
        }
        return <ScreenRssFeedWidget unitId={props.unitId} feedId={feedId} />;
      }
      case 'weather': {
        const feedId = String(
          (config as { feedId?: string })?.feedId ?? ''
        ).trim();
        if (!feedId) {
          return (
            <p className='text-muted-foreground text-sm'>
              {t('feeds.missing', { default: 'Configure feed in admin' })}
            </p>
          );
        }
        return <ScreenWeatherWidget unitId={props.unitId} feedId={feedId} />;
      }
      case 'custom-html': {
        const html = String((config as { html?: string })?.html ?? '');
        if (!html) return null;
        return (
          <div
            className='prose dark:prose-invert max-w-none'
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }
      default:
        return null;
    }
  };

  const { layout } = template;
  const regions = layout.regions;

  const mainGrid = (() => {
    if (layout.type === 'fullscreen' || regions.length === 0) {
      return (
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden p-2'>
          {regions[0] ? (
            <div className='relative min-h-0 flex-1'>
              {(widgetsByRegion.get(regions[0].id) ?? []).map((w) => (
                <div key={w.id} className='h-full min-h-0 p-1'>
                  {renderWidget(w.type, w.config ?? {})}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (layout.type === 'grid' && regions.length === 2) {
      return (
        <div
          className='h-full min-h-0 w-full flex-1 gap-4 overflow-hidden p-4'
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(0,${regions[0].size}) minmax(0,${regions[1].size})`,
            gridTemplateRows: 'minmax(0,1fr)'
          }}
        >
          {regions.map((reg, idx) => (
            <div key={reg.id} className={regionPanelClass(layout, reg, idx)}>
              {(widgetsByRegion.get(reg.id) ?? []).map((w) => (
                <div
                  key={w.id}
                  className={
                    w.type === 'called-tickets' ? 'h-full min-h-0' : ''
                  }
                >
                  {w.type === 'content-player' ? (
                    <div className='h-full min-h-[200px]'>
                      {renderWidget(w.type, w.config ?? {})}
                    </div>
                  ) : (
                    renderWidget(w.type, w.config ?? {})
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    if (layout.type === 'grid' && regions.length >= 3) {
      return (
        <div
          className='grid h-full min-h-0 w-full flex-1 gap-2 overflow-hidden p-2'
          style={{
            gridTemplateRows: regions.map((r) => r.size).join(' '),
            gridTemplateColumns: '1fr'
          }}
        >
          {regions.map((reg) => (
            <div
              key={reg.id}
              className={`${regionPanelClass(layout, reg, 0)} min-h-0`}
            >
              {(widgetsByRegion.get(reg.id) ?? []).map((w) => (
                <div key={w.id} className='h-full min-h-0'>
                  {w.type === 'content-player' ? (
                    <div className='h-full min-h-[200px]'>
                      {renderWidget(w.type, w.config ?? {})}
                    </div>
                  ) : (
                    renderWidget(w.type, w.config ?? {})
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    if (layout.type === 'split-h' || layout.type === 'split-v') {
      return (
        <div className='grid h-full min-h-0 w-full flex-1 grid-cols-1 gap-2 overflow-hidden p-2 md:grid-cols-2'>
          {regions.map((reg) => (
            <div
              key={reg.id}
              className='min-h-0 overflow-hidden rounded-lg border p-2'
            >
              {(widgetsByRegion.get(reg.id) ?? []).map((w) => (
                <div key={w.id}>{renderWidget(w.type, w.config ?? {})}</div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className='text-muted-foreground p-4 text-sm'>
        {t('templateUnknown', { id: template.id, default: 'Unknown template' })}
      </div>
    );
  })();

  return (
    <div className='flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden'>
      <div className='min-h-0 flex-1 overflow-hidden'>{mainGrid}</div>
      <div className='shrink-0 border-t py-1'>
        <QueueTicker tickets={waitingTickets} locale={locale} />
      </div>
    </div>
  );
}

export function screenRendererHeaderTitle(unit: Unit, locale: string): string {
  return getUnitDisplayName(unit, locale);
}
