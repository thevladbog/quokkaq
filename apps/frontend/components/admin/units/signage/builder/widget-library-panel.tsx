'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import type { ScreenWidgetType } from '@quokkaq/shared-types';
import { libraryId } from './screen-dnd-ids';
import {
  BuilderWidgetSchematicChips,
  widgetShortLabel
} from './widget-preview';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

const QUEUE: ScreenWidgetType[] = [
  'called-tickets',
  'queue-stats',
  'eta-display',
  'queue-ticker'
];
const INFO: ScreenWidgetType[] = [
  'screen-header',
  'screen-footer-qr',
  'join-queue-qr',
  'clock',
  'weather',
  'announcements',
  'rss-feed'
];
const MEDIA: ScreenWidgetType[] = ['content-player', 'custom-html'];

function DraggableWidgetCard({ type }: { type: ScreenWidgetType }) {
  const t = useTranslations('admin.screenBuilder');
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: libraryId(type),
      data: { from: 'library' as const, type }
    });
  const style = { transform: CSS.Translate.toString(transform) };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className='touch-manipulation'
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Card
              className={cn(
                'cursor-grab border-dashed p-2 transition-shadow select-none',
                isDragging ? 'ring-primary ring-2' : 'hover:bg-muted/40'
              )}
              role='listitem'
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                }
              }}
              aria-label={t('library.drag', {
                name: widgetShortLabel(t, type)
              })}
              {...listeners}
            >
              <BuilderWidgetSchematicChips type={type} />
            </Card>
          </div>
        </TooltipTrigger>
        <TooltipContent side='right' className='max-w-md'>
          <p className='font-medium'>{widgetShortLabel(t, type)}</p>
          <p className='text-muted-foreground text-xs'>
            {t('library.dragToRegion', {
              default: 'Drag into a screen region'
            })}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function Section({
  title,
  types
}: {
  title: string;
  types: ScreenWidgetType[];
}) {
  return (
    <div className='min-w-0 space-y-2' role='group' aria-label={title}>
      <h3 className='text-foreground/90 text-xs font-semibold tracking-wider uppercase'>
        {title}
      </h3>
      <div className='space-y-1.5' role='list'>
        {types.map((q) => (
          <DraggableWidgetCard key={q} type={q} />
        ))}
      </div>
    </div>
  );
}

export function BuilderWidgetLibraryPanel() {
  const t = useTranslations('admin.screenBuilder');
  return (
    <TooltipProvider>
      <aside
        className='bg-muted/20 flex min-h-0 w-full max-w-full min-w-0 flex-col gap-4 overflow-y-auto rounded-lg border p-2 sm:p-3'
        aria-label={t('widgetLibrary', { default: 'Widgets' })}
      >
        <h2 className='text-foreground/90 text-sm font-semibold'>
          {t('widgetLibrary', { default: 'Widgets' })}
        </h2>
        <Section
          title={t('category.queue', { default: 'Queue' })}
          types={QUEUE}
        />
        <Section
          title={t('category.info', { default: 'Information' })}
          types={INFO}
        />
        <Section
          title={t('category.media', { default: 'Media' })}
          types={MEDIA}
        />
      </aside>
    </TooltipProvider>
  );
}
