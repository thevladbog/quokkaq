'use client';

import type { ScreenCellGridFace, Ticket, Unit } from '@quokkaq/shared-types';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';

import { CalledTicketsTable } from '@/components/screen/called-tickets-table';
import {
  ContentPlayer,
  type ContentSlide
} from '@/components/screen/content-player';
import { QueueTicker } from '@/components/screen/queue-ticker';
import { ScreenAnnouncementsWidget } from '@/components/screen/widgets/screen-announcements-widget';
import { ScreenClockWidget } from '@/components/screen/widgets/screen-clock-widget';
import { ScreenEtaWidget } from '@/components/screen/widgets/screen-eta-widget';
import { ScreenFooterQrWidget } from '@/components/screen/widgets/screen-footer-qr-widget';
import { ScreenHeaderWidget } from '@/components/screen/widgets/screen-header-widget';
import {
  parseJoinQueueQrAlign,
  ScreenJoinQueueQrWidget
} from '@/components/screen/widgets/screen-join-queue-qr-widget';
import { ScreenQueueStatsWidget } from '@/components/screen/widgets/screen-queue-stats-widget';
import { ScreenRssFeedWidget } from '@/components/screen/widgets/screen-rss-widget';
import { ScreenWeatherWidget } from '@/components/screen/widgets/screen-weather-widget';
import { clockUse24HourFromConfig } from '@/lib/screen-clock-config';
import { queueTickerConfigFromRecord } from '@/lib/queue-ticker-config';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { cn } from '@/lib/utils';

export type ScreenGridQueueStatus = {
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

export type ScreenGridAnnouncement = {
  id: string;
  text: string;
  style: string;
  priority: number;
};

export type ScreenGridRuntimeProps = {
  unitId: string;
  locale: string;
  /** Selected face supplied by the caller; this component never detects orientation. */
  face: ScreenCellGridFace;
  unit: Unit;
  calledTickets: Ticket[];
  waitingTickets: Ticket[];
  queueStatus: ScreenGridQueueStatus | null;
  contentSlides: ContentSlide[];
  defaultImageSeconds: number;
  announcements: ScreenGridAnnouncement[];
  adBodyColor: string;
  historyLimit: number;
  currentTime: Date;
  virtualQueueEnabled: boolean;
  queueUrl: string;
};

type CellWidget = ScreenCellGridFace['widgets'][number];

export function ScreenGridRuntime({
  unitId,
  locale,
  face,
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
  queueUrl
}: ScreenGridRuntimeProps) {
  const t = useTranslations('screen');
  const { columns, rows, widgets } = face;
  const embedsQueueTicker = widgets.some(
    (widget) => widget.type === 'queue-ticker'
  );
  const hasClockElsewhere = widgets.some((widget) => widget.type === 'clock');

  const renderOne = (widget: CellWidget): ReactNode => {
    const config = (widget.config ?? {}) as Record<string, unknown>;
    const boxStyle: CSSProperties = {
      ...(widget.style?.backgroundColor
        ? { backgroundColor: widget.style.backgroundColor }
        : {}),
      ...(widget.style?.textColor ? { color: widget.style.textColor } : {}),
      ...(widget.style?.fontSize ? { fontSize: widget.style.fontSize } : {}),
      ...(widget.type === 'queue-ticker'
        ? {}
        : widget.style?.padding
          ? { padding: widget.style.padding }
          : {})
    };
    const inner = (() => {
      switch (widget.type) {
        case 'screen-header':
          return (
            <ScreenHeaderWidget
              unit={unit}
              locale={locale}
              currentTime={currentTime}
              config={config}
              hideClock={hasClockElsewhere}
            />
          );
        case 'screen-footer-qr':
          return (
            <ScreenFooterQrWidget
              queueStatus={queueStatus}
              virtualQueueEnabled={virtualQueueEnabled}
              queueUrl={queueUrl}
              showQr={(config.showQr as boolean | undefined) !== false}
              showStats={(config.showStats as boolean | undefined) !== false}
            />
          );
        case 'join-queue-qr':
          return (
            <ScreenJoinQueueQrWidget
              virtualQueueEnabled={virtualQueueEnabled}
              queueUrl={queueUrl}
              align={parseJoinQueueQrAlign(
                (config as { align?: unknown }).align
              )}
            />
          );
        case 'clock':
          return (
            <ScreenClockWidget
              locale={locale}
              textAlign='center'
              size='default'
              use24Hour={clockUse24HourFromConfig(config)}
            />
          );
        case 'eta-display':
          return (
            <ScreenEtaWidget
              minutes={queueStatus?.estimatedWaitMinutes ?? 0}
              compact={(config as { compact?: boolean }).compact === true}
            />
          );
        case 'queue-stats':
          return (
            <ScreenQueueStatsWidget
              queueLength={queueStatus?.queueLength ?? null}
              activeCounters={queueStatus?.activeCounters ?? null}
              estimatedWaitMinutes={queueStatus?.estimatedWaitMinutes ?? null}
              maxWaitingInQueueMinutes={
                queueStatus?.maxWaitingInQueueMinutes ?? null
              }
              servedToday={queueStatus?.servedToday ?? null}
              config={config}
              inlineRow={false}
            />
          );
        case 'announcements': {
          const maxItems = (config as { maxItems?: number }).maxItems;
          const items =
            typeof maxItems === 'number' && maxItems > 0
              ? announcements.slice(0, maxItems)
              : announcements;
          return <ScreenAnnouncementsWidget items={items} strip={false} />;
        }
        case 'content-player': {
          const overlayTickets =
            (config as { overlayTickets?: boolean }).overlayTickets === true;
          return (
            <ContentPlayer
              slides={contentSlides}
              defaultImageSeconds={defaultImageSeconds}
              overlayMode={overlayTickets || undefined}
              overlay={
                overlayTickets ? (
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
                ) : undefined
              }
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
          const ticker = queueTickerConfigFromRecord(config);
          return (
            <QueueTicker
              tickets={waitingTickets}
              locale={locale}
              labelRu={ticker.labelRu}
              labelEn={ticker.labelEn}
              direction={ticker.direction}
              durationSeconds={ticker.durationSeconds}
            />
          );
        }
        case 'rss-feed': {
          const feedId = String(
            (config as { feedId?: string }).feedId ?? ''
          ).trim();
          return feedId ? (
            <ScreenRssFeedWidget unitId={unitId} feedId={feedId} />
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('feeds.missing', { default: 'Configure feed in admin' })}
            </p>
          );
        }
        case 'weather': {
          const feedId = String(
            (config as { feedId?: string }).feedId ?? ''
          ).trim();
          return feedId ? (
            <ScreenWeatherWidget
              unitId={unitId}
              feedId={feedId}
              layout='stacked'
            />
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('feeds.missing', { default: 'Configure feed in admin' })}
            </p>
          );
        }
        case 'custom-html': {
          const html = sanitizeHtml(
            String((config as { html?: string }).html ?? '')
          );
          return html ? (
            <div
              className='prose dark:prose-invert max-h-full max-w-none overflow-auto'
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : null;
        }
        default:
          return null;
      }
    })();

    return (
      <div
        key={widget.id}
        data-screen-widget={widget.type}
        className={cn(
          'min-h-0 min-w-0 overflow-hidden',
          widget.type === 'called-tickets' ||
            widget.type === 'content-player' ||
            widget.type === 'queue-ticker'
            ? 'flex h-full min-h-0 flex-col'
            : ''
        )}
        style={Object.keys(boxStyle).length > 0 ? boxStyle : undefined}
      >
        {widget.type === 'content-player' &&
        !(config as { overlayTickets?: boolean }).overlayTickets ? (
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
          {widgets.map((widget) => {
            const { col, row, colSpan, rowSpan } = widget.placement;
            const itemStyle: CSSProperties = {
              gridColumn: `${col} / span ${colSpan}`,
              gridRow: `${row} / span ${rowSpan}`,
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden'
            };
            return (
              <div
                key={widget.id}
                style={itemStyle}
                className='min-h-0 min-w-0'
              >
                {renderOne(widget)}
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
