'use client';

import { useMemo, type ReactNode, type CSSProperties } from 'react';
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
import { ScreenRssFeedWidget } from '@/components/screen/widgets/screen-rss-widget';
import { ScreenWeatherWidget } from '@/components/screen/widgets/screen-weather-widget';
import { clockUse24HourFromConfig } from '@/lib/screen-clock-config';
import { getUnitDisplayName } from '@/lib/unit-display';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/lib/api';

type QueueStatus = {
  queueLength: number;
  estimatedWaitMinutes: number;
  maxWaitingInQueueMinutes?: number;
  activeCounters: number;
  servedToday?: number;
};

type Ann = {
  id: string;
  text: string;
  style: string;
  priority: number;
};

type TemplateWidget = ScreenTemplate['widgets'][number];

type WidgetRenderOpts = {
  clockTextAlign?: 'left' | 'center';
  clockSize?: 'default' | 'compact';
  /** `column` = icon and °C under the clock in portrait strip. */
  weatherLayout?: 'row' | 'stacked' | 'column';
  etaCompact?: boolean;
  queueStatsInlineRow?: boolean;
  announcementsStrip?: boolean;
};

type MapRegionOptions = { variant?: 'default' | 'portraitStrip' };

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

function regionBoxStyle(region: ScreenLayoutRegion): CSSProperties | undefined {
  if (!region.backgroundColor) {
    return undefined;
  }
  return { backgroundColor: region.backgroundColor };
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

  const widgetsByRegion = useMemo(() => {
    const m = new Map<string, typeof template.widgets>();
    for (const w of template.widgets) {
      const list = m.get(w.regionId) ?? [];
      list.push(w);
      m.set(w.regionId, list);
    }
    return m;
  }, [template]);

  const renderWidget = (
    type: string,
    config: Record<string, unknown>,
    o?: WidgetRenderOpts
  ) => {
    switch (type) {
      case 'clock': {
        return (
          <ScreenClockWidget
            locale={locale}
            textAlign={o?.clockTextAlign === 'left' ? 'left' : 'center'}
            size={o?.clockSize === 'compact' ? 'compact' : 'default'}
            use24Hour={clockUse24HourFromConfig(config)}
          />
        );
      }
      case 'eta-display':
        return (
          <ScreenEtaWidget
            minutes={qs?.estimatedWaitMinutes ?? 0}
            compact={o?.etaCompact === true}
          />
        );
      case 'queue-stats':
        return (
          <ScreenQueueStatsWidget
            queueLength={qs == null ? null : qs.queueLength}
            activeCounters={qs == null ? null : qs.activeCounters}
            estimatedWaitMinutes={qs == null ? null : qs.estimatedWaitMinutes}
            maxWaitingInQueueMinutes={
              qs == null ? null : qs.maxWaitingInQueueMinutes
            }
            servedToday={qs == null ? null : qs.servedToday}
            inlineRow={o?.queueStatsInlineRow === true}
          />
        );
      case 'announcements': {
        const max = (config as { maxItems?: number })?.maxItems;
        const list =
          typeof max === 'number' && max > 0
            ? announcements.slice(0, max)
            : announcements;
        return (
          <ScreenAnnouncementsWidget
            items={list}
            strip={o?.announcementsStrip === true}
          />
        );
      }
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
        return <QueueTicker tickets={waitingTickets} />;
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
        return (
          <ScreenWeatherWidget
            unitId={props.unitId}
            feedId={feedId}
            layout={
              o?.weatherLayout === 'row'
                ? 'row'
                : o?.weatherLayout === 'column'
                  ? 'column'
                  : 'stacked'
            }
          />
        );
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

  const mapRegionWidgets = (
    widgets: TemplateWidget[],
    mopts?: MapRegionOptions
  ): ReactNode[] => {
    const strip = mopts?.variant === 'portraitStrip';
    /** Eta is duplicated by queue-stats est. wait in the strip. */
    const sourceWidgets: TemplateWidget[] =
      strip && widgets.some((w) => w.type === 'queue-stats')
        ? widgets.filter((w) => w.type !== 'eta-display')
        : widgets;
    const out: ReactNode[] = [];
    let i = 0;
    while (i < sourceWidgets.length) {
      const a = sourceWidgets[i]!;
      const b = sourceWidgets[i + 1];
      if (a.type === 'clock' && b?.type === 'weather') {
        if (strip) {
          out.push(
            <div
              key={`${a.id}-clock-weather-${b.id}`}
              data-screen-widget='clock-weather'
              className='flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3'
            >
              <div className='min-w-0 flex-shrink'>
                {renderWidget('clock', a.config ?? {}, {
                  clockTextAlign: 'left',
                  clockSize: 'compact'
                })}
              </div>
              <div className='shrink-0'>
                {renderWidget('weather', b.config ?? {}, {
                  weatherLayout: 'column'
                })}
              </div>
            </div>
          );
        } else {
          out.push(
            <div
              key={`${a.id}-clock-weather-${b.id}`}
              data-screen-widget='clock-weather'
              className='border-border/50 flex w-full min-w-0 flex-none items-center justify-between gap-2 border-b pb-2 sm:gap-4 sm:pb-2.5'
            >
              <div className='min-w-0 flex-1'>
                {renderWidget('clock', a.config ?? {}, {
                  clockTextAlign: 'left'
                })}
              </div>
              <div className='shrink-0'>
                {renderWidget('weather', b.config ?? {}, {
                  weatherLayout: 'row'
                })}
              </div>
            </div>
          );
        }
        i += 2;
        continue;
      }
      const wopts: WidgetRenderOpts | undefined = !strip
        ? (() => {
            const o: WidgetRenderOpts = {};
            if (
              a.type === 'eta-display' &&
              (a.config as { compact?: boolean } | undefined)?.compact === true
            ) {
              o.etaCompact = true;
            }
            return Object.keys(o).length > 0 ? o : undefined;
          })()
        : a.type === 'eta-display'
          ? { etaCompact: true }
          : a.type === 'queue-stats'
            ? { queueStatsInlineRow: true }
            : a.type === 'announcements'
              ? { announcementsStrip: true }
              : undefined;
      const boxStyle: CSSProperties = {
        ...(a.style?.backgroundColor
          ? { backgroundColor: a.style.backgroundColor }
          : {}),
        ...(a.style?.textColor ? { color: a.style.textColor } : {}),
        ...(a.style?.fontSize ? { fontSize: a.style.fontSize } : {}),
        ...(a.style?.padding ? { padding: a.style.padding } : {}),
        ...(a.size?.width ? { width: a.size.width, maxWidth: '100%' } : {}),
        ...(a.size?.height ? { minHeight: a.size.height } : {}),
        ...(a.position
          ? {
              position: 'relative' as const,
              left: a.position.x,
              top: a.position.y
            }
          : {})
      };
      out.push(
        <div
          key={a.id}
          data-screen-widget={a.type}
          className={cn(
            a.type === 'called-tickets' ? 'h-full min-h-0 p-1' : '',
            strip ? 'min-w-0 flex-1 self-center' : 'w-full'
          )}
          style={Object.keys(boxStyle).length > 0 ? boxStyle : undefined}
        >
          {a.type === 'content-player' ? (
            <div className='h-full min-h-[200px]'>
              {renderWidget(a.type, a.config ?? {})}
            </div>
          ) : (
            renderWidget(a.type, a.config ?? {}, wopts)
          )}
        </div>
      );
      i += 1;
    }
    return out;
  };

  const { layout } = template;
  const regions = layout.regions;

  const mainGrid = (() => {
    if (layout.type === 'fullscreen' || regions.length === 0) {
      return (
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden p-2'>
          {regions[0] ? (
            <div
              className='relative min-h-0 flex-1'
              style={regionBoxStyle(regions[0]!)}
            >
              {mapRegionWidgets(widgetsByRegion.get(regions[0].id) ?? [])}
            </div>
          ) : null}
        </div>
      );
    }

    if (layout.type === 'grid' && regions.length === 2) {
      const mainR = regions[0]!;
      const sideR = regions[1]!;
      const mainW = widgetsByRegion.get(mainR.id) ?? [];
      const sideWidgets = widgetsByRegion.get(sideR.id) ?? [];
      const landscapeTwoCol = (
        <div
          className='h-full min-h-0 w-full flex-1 gap-2 overflow-hidden p-2 landscape:gap-4 landscape:p-4'
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(0,${mainR.size}) minmax(0,${sideR.size})`,
            gridTemplateRows: 'minmax(0,1fr)'
          }}
        >
          <div
            key={mainR.id}
            className={regionPanelClass(layout, mainR, 0)}
            style={regionBoxStyle(mainR)}
          >
            {mapRegionWidgets(mainW)}
          </div>
          <div
            key={sideR.id}
            className={regionPanelClass(layout, sideR, 1)}
            style={regionBoxStyle(sideR)}
          >
            {mapRegionWidgets(sideWidgets)}
          </div>
        </div>
      );
      const portraitMainAndStrip = (
        <div className='flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden landscape:hidden'>
          <div
            className='min-h-0 flex-1 overflow-y-auto p-2'
            data-screen-region='main'
          >
            {mapRegionWidgets(mainW)}
          </div>
          <div
            className='border-border/50 bg-muted/20 flex max-h-32 min-h-0 w-full flex-none flex-col overflow-hidden border-t sm:max-h-36'
            role='complementary'
            aria-label={t('portraitInfoStrip', {
              default: 'Time, weather, and queue info'
            })}
          >
            <div className='flex min-h-0 w-full min-w-0 flex-1 flex-nowrap items-center justify-start gap-1 overflow-x-auto overflow-y-hidden px-2 py-1.5 [scrollbar-gutter:stable] sm:gap-1.5 sm:px-2.5 sm:py-2'>
              {mapRegionWidgets(sideWidgets, { variant: 'portraitStrip' })}
            </div>
          </div>
        </div>
      );
      return (
        <div className='relative h-full min-h-0 w-full flex-1'>
          <div className='hidden h-full min-h-0 w-full landscape:block'>
            {landscapeTwoCol}
          </div>
          {portraitMainAndStrip}
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
              style={regionBoxStyle(reg)}
            >
              {mapRegionWidgets(widgetsByRegion.get(reg.id) ?? [])}
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
              style={regionBoxStyle(reg)}
            >
              {mapRegionWidgets(widgetsByRegion.get(reg.id) ?? [])}
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
        <QueueTicker tickets={waitingTickets} />
      </div>
    </div>
  );
}

export function screenRendererHeaderTitle(unit: Unit, locale: string): string {
  return getUnitDisplayName(unit, locale);
}
