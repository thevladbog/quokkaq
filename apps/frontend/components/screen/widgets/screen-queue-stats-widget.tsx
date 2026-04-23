'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  displayEstimateToCallMinutes,
  displayMaxWaitInQueueMinutes
} from '@/lib/queue-eta-display';
import {
  getQueueStatsCards,
  type QueueStatsWidgetConfig,
  type QueueStatCardType
} from '@/lib/queue-stats-config';

function StatCell({
  label,
  children,
  compact,
  className,
  style,
  labelFontSize,
  valueFontSize
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  labelFontSize?: string;
  valueFontSize?: string;
}) {
  return (
    <div
      className={cn(
        'bg-card/80 flex flex-col justify-center rounded-lg border text-center shadow-sm',
        compact ? 'min-h-[4.25rem] p-1.5' : 'min-h-[5.5rem] p-3',
        className
      )}
      style={style}
    >
      <div
        className={cn(
          'text-muted-foreground uppercase',
          compact ? 'text-[7px] leading-tight font-medium' : 'text-xs'
        )}
        style={labelFontSize ? { fontSize: labelFontSize } : undefined}
      >
        {label}
      </div>
      <div
        className={cn(
          'leading-tight font-bold tabular-nums',
          compact ? 'text-sm' : 'text-3xl'
        )}
        style={valueFontSize ? { fontSize: valueFontSize } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function fmtCount(
  t: (key: string, values?: Record<string, string | number>) => string,
  value: number | null | undefined
) {
  if (value == null) {
    return (
      <span className='text-muted-foreground text-2xl' aria-hidden>
        {t('stats.noData', { default: '—' })}
      </span>
    );
  }
  return <>{value}</>;
}

function fmtEstimateToCall(
  t: (key: string, values?: Record<string, string | number>) => string,
  value: number | null | undefined
) {
  if (value == null) {
    return (
      <span className='text-muted-foreground text-2xl' aria-hidden>
        {t('stats.noData', { default: '—' })}
      </span>
    );
  }
  const m = displayEstimateToCallMinutes(value);
  if (m <= 0) {
    return <>~0 {t('minutes')}</>;
  }
  return (
    <>
      ~{m} {t('minutes')}
    </>
  );
}

function fmtMaxWaitInQueue(
  t: (key: string, values?: Record<string, string | number>) => string,
  value: number | null | undefined
) {
  if (value == null) {
    return (
      <span className='text-muted-foreground text-2xl' aria-hidden>
        {t('stats.noData', { default: '—' })}
      </span>
    );
  }
  const m = displayMaxWaitInQueueMinutes(value);
  return (
    <>
      {m} {t('minutes')}
    </>
  );
}

export function ScreenQueueStatsWidget({
  queueLength,
  activeCounters,
  estimatedWaitMinutes,
  maxWaitingInQueueMinutes,
  servedToday,
  config,
  /** One horizontal row of five metrics (portrait bottom strip). */
  inlineRow = false
}: {
  queueLength?: number | null;
  activeCounters?: number | null;
  estimatedWaitMinutes?: number | null;
  maxWaitingInQueueMinutes?: number | null;
  servedToday?: number | null;
  config?: QueueStatsWidgetConfig;
  inlineRow?: boolean;
}) {
  const t = useTranslations('screen');
  const c = inlineRow;

  const cards = getQueueStatsCards(config);
  const enabledCards = cards.filter((card) => card.enabled);

  // Map card types to their data and labels
  const cardDataMap: Record<
    QueueStatCardType,
    { label: string; content: ReactNode }
  > = {
    queueLength: {
      label: t('stats.inQueue', { default: 'In queue' }),
      content: fmtCount(t, queueLength)
    },
    activeCounters: {
      label: t('stats.openWindows', { default: 'Open windows' }),
      content: fmtCount(t, activeCounters)
    },
    estimatedWait: {
      label: t('stats.estimateToCall', { default: 'Est. time to call' }),
      content: fmtEstimateToCall(t, estimatedWaitMinutes)
    },
    maxWait: {
      label: t('stats.maxWaitInQueue', { default: 'Longest wait (now)' }),
      content: fmtMaxWaitInQueue(t, maxWaitingInQueueMinutes)
    },
    servedToday: {
      label: t('stats.servedToday', { default: 'Served today' }),
      content: fmtCount(t, servedToday)
    }
  };

  // Determine grid columns class based on enabled cards count
  const gridColsClass = inlineRow
    ? enabledCards.length === 1
      ? 'grid-cols-1'
      : enabledCards.length === 2
        ? 'grid-cols-2'
        : enabledCards.length === 3
          ? 'grid-cols-3'
          : enabledCards.length === 4
            ? 'grid-cols-4'
            : 'grid-cols-5'
    : 'grid-cols-2';

  return (
    <div
      className={cn(
        'min-w-0 text-center',
        inlineRow ? 'w-max shrink-0' : 'w-full',
        inlineRow
          ? `grid auto-cols-[minmax(0,1fr)] ${gridColsClass} gap-0.5 sm:gap-1`
          : 'grid grid-cols-2 gap-1.5 sm:gap-2'
      )}
      role='region'
      aria-label={t('stats.aria', { default: 'Queue summary' })}
    >
      {enabledCards.map((card) => {
        const data = cardDataMap[card.type];
        const style: React.CSSProperties = {
          ...(card.backgroundColor && {
            backgroundColor: card.backgroundColor
          }),
          ...(card.textColor && { color: card.textColor })
        };

        return (
          <StatCell
            key={card.type}
            compact={c}
            label={data.label}
            className={
              !inlineRow && card.width === 2 ? 'col-span-2' : undefined
            }
            style={Object.keys(style).length > 0 ? style : undefined}
            labelFontSize={card.labelFontSize}
            valueFontSize={card.valueFontSize}
          >
            {data.content}
          </StatCell>
        );
      })}
    </div>
  );
}
