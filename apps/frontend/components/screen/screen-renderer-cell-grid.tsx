'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ScreenTemplateCellGrid } from '@quokkaq/shared-types';
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
import { ScreenRssFeedWidget } from '@/components/screen/widgets/screen-rss-widget';
import { ScreenWeatherWidget } from '@/components/screen/widgets/screen-weather-widget';
import { ScreenHeaderWidget } from '@/components/screen/widgets/screen-header-widget';
import { ScreenFooterQrWidget } from '@/components/screen/widgets/screen-footer-qr-widget';
import {
  ScreenJoinQueueQrWidget,
  parseJoinQueueQrAlign
} from '@/components/screen/widgets/screen-join-queue-qr-widget';
import { clockUse24HourFromConfig } from '@/lib/screen-clock-config';
import { queueTickerConfigFromRecord } from '@/lib/queue-ticker-config';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/lib/api';

type QueueStatus = {
  queueLength: number;
  estimatedWaitMinutes: number;
  maxWaitingInQueueMinutes?: number;
  activeCounters: number;
  servedToday?: number;
  services?: Array<{
    serviceId: string;
    serviceName: string;
    queueLength: number;
    estimatedWaitMinutes: number;
  }>;
};

type Ann = {
  id: string;
  text: string;
  style: string;
  priority: number;
};

type CellWidget = ScreenTemplateCellGrid['portrait']['widgets'][number];

export type ScreenRendererCellGridProps = {
  unitId: string;
  locale: string;
  template: ScreenTemplateCellGrid;
  unit: Unit;
  calledTickets: Ticket[];
  waitingTickets: Ticket[];
  queueStatus: QueueStatus | null;
  contentSlides: ContentSlide[];
  defaultImageSeconds: number;
  announcements: Ann[];
  adBodyColor: string;
  historyLimit: number;
  currentTime: Date;
  virtualQueueEnabled: boolean;
  queueUrl: string;
  /** When set (e.g. admin builder), ignore viewport orientation and use this face. */
  forcedLayoutFace?: 'portrait' | 'landscape';
};

function useLandscapeOrientation(): boolean {
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const fn = () => setLandscape(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return landscape;
}

export function ScreenRendererCellGrid(props: ScreenRendererCellGridProps) {
  const {
    unitId,
    locale,
    template,
    unit,
    calledTickets,
    waitingTickets,
    queueStatus,
    contentSlides,
    defaultImageSeconds,
    announcements,
    adBodyColor,
    historyLimit,
    currentTime,
    virtualQueueEnabled,
    queueUrl,
    forcedLayoutFace
  } = props;
  const t = useTranslations('screen');
  const mqLandscape = useLandscapeOrientation();
  const landscape =
    forcedLayoutFace !== undefined
      ? forcedLayoutFace === 'landscape'
      : mqLandscape;
  const face = landscape ? template.landscape : template.portrait;
  const { columns, rows, widgets } = face;

  /** Avoid duplicate strip: `queue-ticker` is also rendered as a grid widget. */
  const embedsQueueTicker = widgets.some((w) => w.type === 'queue-ticker');

  const hasClockElsewhere = widgets.some((w) => w.type === 'clock');

  const renderOne = (w: CellWidget): ReactNode => {
    const cfg = (w.config ?? {}) as Record<string, unknown>;
    const boxStyle: CSSProperties = {
      ...(w.style?.backgroundColor
        ? { backgroundColor: w.style.backgroundColor }
        : {}),
      ...(w.style?.textColor ? { color: w.style.textColor } : {}),
      ...(w.style?.fontSize ? { fontSize: w.style.fontSize } : {}),
      ...(w.type === 'queue-ticker'
        ? {}
        : w.style?.padding
          ? { padding: w.style.padding }
          : {})
    };
    const inner = (() => {
      switch (w.type) {
        case 'screen-header':
          return (
            <ScreenHeaderWidget
              unit={unit}
              locale={locale}
              currentTime={currentTime}
              config={cfg}
              hideClock={hasClockElsewhere}
            />
          );
        case 'screen-footer-qr':
          return (
            <ScreenFooterQrWidget
              queueStatus={queueStatus}
              virtualQueueEnabled={virtualQueueEnabled}
              queueUrl={queueUrl}
              showQr={(cfg.showQr as boolean | undefined) !== false}
              showStats={(cfg.showStats as boolean | undefined) !== false}
            />
          );
        case 'join-queue-qr':
          return (
            <ScreenJoinQueueQrWidget
              virtualQueueEnabled={virtualQueueEnabled}
              queueUrl={queueUrl}
              align={parseJoinQueueQrAlign((cfg as { align?: unknown }).align)}
            />
          );
        case 'clock':
          return (
            <ScreenClockWidget
              locale={locale}
              textAlign='center'
              size='default'
              use24Hour={clockUse24HourFromConfig(cfg)}
            />
          );
        case 'eta-display':
          return (
            <ScreenEtaWidget
              minutes={queueStatus?.estimatedWaitMinutes ?? 0}
              compact={(cfg as { compact?: boolean }).compact === true}
            />
          );
        case 'queue-stats':
          return (
            <ScreenQueueStatsWidget
              queueLength={queueStatus == null ? null : queueStatus.queueLength}
              activeCounters={
                queueStatus == null ? null : queueStatus.activeCounters
              }
              estimatedWaitMinutes={
                queueStatus == null ? null : queueStatus.estimatedWaitMinutes
              }
              maxWaitingInQueueMinutes={
                queueStatus == null
                  ? null
                  : queueStatus.maxWaitingInQueueMinutes
              }
              servedToday={queueStatus == null ? null : queueStatus.servedToday}
              config={cfg as Record<string, unknown>}
              inlineRow={false}
            />
          );
        case 'announcements': {
          const max = (cfg as { maxItems?: number })?.maxItems;
          const list =
            typeof max === 'number' && max > 0
              ? announcements.slice(0, max)
              : announcements;
          return <ScreenAnnouncementsWidget items={list} strip={false} />;
        }
        case 'content-player': {
          const overlayTickets =
            (cfg as { overlayTickets?: boolean }).overlayTickets === true;
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
        case 'queue-ticker': {
          const q = queueTickerConfigFromRecord(cfg);
          return (
            <QueueTicker
              tickets={waitingTickets}
              locale={locale}
              labelRu={q.labelRu}
              labelEn={q.labelEn}
              direction={q.direction}
              durationSeconds={q.durationSeconds}
            />
          );
        }
        case 'rss-feed': {
          const feedId = String(
            (cfg as { feedId?: string })?.feedId ?? ''
          ).trim();
          if (!feedId) {
            return (
              <p className='text-muted-foreground text-sm'>
                {t('feeds.missing', { default: 'Configure feed in admin' })}
              </p>
            );
          }
          return <ScreenRssFeedWidget unitId={unitId} feedId={feedId} />;
        }
        case 'weather': {
          const feedId = String(
            (cfg as { feedId?: string })?.feedId ?? ''
          ).trim();
          if (!feedId) {
            return (
              <p className='text-muted-foreground text-sm'>
                {t('feeds.missing', { default: 'Configure feed in admin' })}
              </p>
            );
          }
          return (
            <ScreenWeatherWidget
              unitId={unitId}
              feedId={feedId}
              layout='stacked'
            />
          );
        }
        case 'custom-html': {
          const html = String((cfg as { html?: string })?.html ?? '');
          if (!html) return null;
          return (
            <div
              className='prose dark:prose-invert max-h-full max-w-none overflow-auto'
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        default:
          return null;
      }
    })();

    return (
      <div
        key={w.id}
        data-screen-widget={w.type}
        className={cn(
          'min-h-0 min-w-0 overflow-hidden',
          w.type === 'called-tickets' ||
            w.type === 'content-player' ||
            w.type === 'queue-ticker'
            ? 'flex h-full min-h-0 flex-col'
            : ''
        )}
        style={Object.keys(boxStyle).length > 0 ? boxStyle : undefined}
      >
        {w.type === 'content-player' &&
        !(cfg as { overlayTickets?: boolean }).overlayTickets ? (
          <div className='h-full min-h-[120px]'>{inner}</div>
        ) : (
          inner
        )}
      </div>
    );
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    height: '100%',
    width: '100%',
    gap: '2px'
  };

  return (
    <div className='flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden'>
      <div className='min-h-0 flex-1 overflow-hidden px-0 py-0'>
        <div className='h-full w-full' style={gridStyle}>
          {widgets.map((w) => {
            const { col, row, colSpan, rowSpan } = w.placement;
            const itemStyle: CSSProperties = {
              gridColumn: `${col} / span ${colSpan}`,
              gridRow: `${row} / span ${rowSpan}`,
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden'
            };
            return (
              <div key={w.id} style={itemStyle} className='min-h-0 min-w-0'>
                {renderOne(w)}
              </div>
            );
          })}
        </div>
      </div>
      {!embedsQueueTicker ? (
        <div className='min-h-12 shrink-0 border-t'>
          <QueueTicker tickets={waitingTickets} locale={locale} />
        </div>
      ) : null}
    </div>
  );
}
