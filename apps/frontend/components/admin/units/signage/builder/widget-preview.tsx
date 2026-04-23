'use client';

import {
  Bell,
  CloudSun,
  Clock,
  Code2,
  Film,
  ListOrdered,
  PanelTop,
  QrCode,
  ScanQrCode,
  Radio,
  Timer,
  Ticket,
  Users
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ScreenWidgetType } from '@quokkaq/shared-types';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BuilderWidgetPreviewModel = { id: string; type: ScreenWidgetType };

const WIDGET_ICONS: Record<ScreenWidgetType, LucideIcon> = {
  'called-tickets': Ticket,
  'content-player': Film,
  'queue-stats': Users,
  'eta-display': Timer,
  announcements: Bell,
  'rss-feed': Radio,
  weather: CloudSun,
  clock: Clock,
  'queue-ticker': ListOrdered,
  'custom-html': Code2,
  'screen-header': PanelTop,
  'screen-footer-qr': QrCode,
  'join-queue-qr': ScanQrCode
};

export function widgetShortLabel(
  t: (k: string, v?: { default: string }) => string,
  type: ScreenWidgetType
): string {
  const map: Record<ScreenWidgetType, { key: string; d: string }> = {
    'called-tickets': { key: 'widget.calledTickets', d: 'Call list' },
    'content-player': { key: 'widget.content', d: 'Content' },
    'queue-stats': { key: 'widget.queueStats', d: 'Queue summary' },
    'eta-display': { key: 'widget.eta', d: 'Wait time' },
    announcements: { key: 'widget.announcements', d: 'Announcements' },
    'rss-feed': { key: 'widget.rss', d: 'RSS' },
    weather: { key: 'widget.weather', d: 'Weather' },
    clock: { key: 'widget.clock', d: 'Time' },
    'queue-ticker': { key: 'widget.ticker', d: 'Wait line' },
    'custom-html': { key: 'widget.customHtml', d: 'HTML' },
    'screen-header': { key: 'widget.screenHeader', d: 'Header' },
    'screen-footer-qr': { key: 'widget.screenFooterQr', d: 'Footer + QR' },
    'join-queue-qr': { key: 'widget.joinQueueQr', d: 'Join queue QR' }
  };
  const m = map[type] ?? { key: 'widget.unknown', d: type };
  return t(m.key, { default: m.d });
}

export function BuilderWidgetPreview({
  widget,
  className
}: {
  widget: BuilderWidgetPreviewModel;
  className?: string;
}) {
  const t = useTranslations('admin.screenBuilder');
  const IconComp = WIDGET_ICONS[widget.type] ?? Ticket;
  const short = widgetShortLabel(t, widget.type);
  return (
    <div
      className={cn(
        'bg-card text-card-foreground flex min-h-[2.5rem] w-full max-w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm shadow-sm',
        className
      )}
    >
      <IconComp className='text-muted-foreground h-4 w-4 shrink-0' />
      <div className='min-w-0 flex-1'>
        <div className='truncate font-medium'>{short}</div>
        <div className='text-muted-foreground font-mono text-xs'>
          {widget.id}
        </div>
      </div>
    </div>
  );
}

export function BuilderWidgetSchematicChips({
  type
}: {
  type: ScreenWidgetType;
}) {
  const t = useTranslations('admin.screenBuilder');
  const IconComp = WIDGET_ICONS[type] ?? Ticket;
  return (
    <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
      <IconComp className='h-3.5 w-3.5 shrink-0' />
      <span className='truncate'>{widgetShortLabel(t, type)}</span>
    </div>
  );
}
