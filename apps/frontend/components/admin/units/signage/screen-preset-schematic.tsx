'use client';

import { useTranslations } from 'next-intl';
import type { ScreenTemplate } from '@quokkaq/shared-types';

type Props = { template: ScreenTemplate };

function widgetSchematicKey(
  type: string
):
  | 'tickets'
  | 'clock'
  | 'weather'
  | 'eta'
  | 'queueStats'
  | 'announcements'
  | 'content'
  | 'rss' {
  switch (type) {
    case 'called-tickets':
      return 'tickets';
    case 'clock':
      return 'clock';
    case 'weather':
      return 'weather';
    case 'eta-display':
      return 'eta';
    case 'queue-stats':
      return 'queueStats';
    case 'announcements':
      return 'announcements';
    case 'content-player':
      return 'content';
    case 'rss-feed':
      return 'rss';
    default:
      return 'tickets';
  }
}

/**
 * Simplified structure of the **selected** built-in template (updates on preset change, before Apply).
 */
export function ScreenPresetSchematic({ template }: Props) {
  const t = useTranslations('admin.signage');
  const wlabel = (type: string) => {
    const k = widgetSchematicKey(type);
    return t(`schematicWidget.${k}`);
  };
  const { layout } = template;
  const regions = layout.regions;

  if (layout.type === 'fullscreen' && regions[0]) {
    return (
      <div
        className='border-primary/40 text-muted-foreground flex h-full min-h-0 w-full items-center justify-center border-2 border-dashed p-1 text-center text-[10px] leading-tight font-medium sm:text-xs'
        title={template.id}
      >
        <div className='px-0.5'>
          <p className='text-foreground'>{t('schematicWidget.content')}</p>
          {template.widgets.some(
            (x) => (x.config as { overlayTickets?: boolean })?.overlayTickets
          ) && (
            <p className='text-primary mt-0.5'>
              {t('schematicWidget.tickets')}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (layout.type === 'grid' && regions.length === 2) {
    return (
      <div
        className='grid h-full min-h-0 w-full flex-1 gap-1 p-1 sm:gap-1.5 sm:p-1.5'
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,0.9fr)',
          gridTemplateRows: 'minmax(0,1fr)',
          minHeight: '84px'
        }}
      >
        {regions.map((reg) => (
          <div
            key={reg.id}
            className='bg-muted/40 text-muted-foreground flex min-h-0 flex-col gap-0.5 overflow-hidden rounded border p-0.5 text-left text-[8px] leading-tight sm:text-[10px]'
            title={reg.id}
          >
            {(template.widgets || [])
              .filter((w) => w.regionId === reg.id)
              .map((w) => (
                <div
                  key={w.id}
                  className='text-foreground/90 bg-background/80 line-clamp-1 rounded px-0.5'
                >
                  {wlabel(w.type)}
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
        className='grid h-full min-h-0 w-full flex-1 grid-cols-1 gap-0.5 p-0.5 sm:gap-1 sm:p-1'
        style={{
          gridTemplateRows: regions.map((r) => r.size).join(' '),
          minHeight: '100px'
        }}
      >
        {regions.map((reg) => (
          <div
            key={reg.id}
            className='bg-muted/40 text-muted-foreground flex min-h-0 flex-1 items-start overflow-hidden rounded border p-0.5 text-left text-[8px] sm:text-[10px]'
            title={reg.id}
          >
            <div className='line-clamp-2 flex w-full flex-col gap-0.5'>
              {(template.widgets || [])
                .filter((w) => w.regionId === reg.id)
                .map((w) => (
                  <div
                    key={w.id}
                    className='text-foreground/90 bg-background/80 line-clamp-1 rounded px-0.5'
                  >
                    {wlabel(w.type)}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='text-muted-foreground flex h-full min-h-0 w-full items-center p-1 text-center text-xs'>
      {t('schematicWidget.unknown', { id: template.id, default: '—' })}
    </div>
  );
}
