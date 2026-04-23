'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import type { ScreenLayoutRegion, ScreenTemplate } from '@quokkaq/shared-types';
import { regionDropId } from './screen-dnd-ids';
import { SortableWidgetBlock } from './sortable-widget-block';
import { useTranslations } from 'next-intl';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';

type W = ScreenTemplate['widgets'][number];

export function RegionDropColumn({
  region,
  className
}: {
  region: ScreenLayoutRegion;
  className?: string;
}) {
  const t = useTranslations('admin.screenBuilder');
  const rid = region.id;
  const widgets = useScreenBuilderStore(
    useShallow((s) => s.template.widgets.filter((w) => w.regionId === rid))
  );
  const { setNodeRef, isOver } = useDroppable({
    id: regionDropId(rid),
    data: {
      type: 'region' as const,
      regionId: rid,
      widgetCount: widgets.length
    }
  });
  const selection = useScreenBuilderStore((s) => s.selection);
  const setSelection = useScreenBuilderStore((s) => s.setSelection);
  const isRegionSel = selection.kind === 'region' && selection.id === rid;
  const ids = widgets.map((w) => w.id);

  return (
    <div
      className={cn('flex h-full min-h-0 w-full min-w-0 flex-col', className)}
    >
      <button
        type='button'
        className={cn(
          'text-muted-foreground/90 text-left text-[10px] font-semibold tracking-wider uppercase',
          isRegionSel && 'text-foreground'
        )}
        onClick={() => {
          setSelection({ kind: 'region', id: rid });
        }}
        aria-pressed={isRegionSel}
      >
        {t('region.label', { id: rid, default: `Region: ${region.area}` })}
      </button>
      <div
        ref={setNodeRef}
        onClickCapture={(e) => {
          if (e.target === e.currentTarget) {
            setSelection({ kind: 'region', id: rid });
          }
        }}
        className={cn(
          'bg-background/30 mt-0.5 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border-2 p-1.5 transition-[border,background,box-shadow]',
          isOver && 'ring-primary/40 border-primary/40 bg-primary/5 ring-1',
          isRegionSel && 'ring-primary/25 border-primary/30 ring-1'
        )}
        role='region'
        title={t('region.drop', {
          id: region.area,
          default: `Add widgets: ${region.area}`
        })}
        aria-label={t('region.dropA11y', {
          id: region.area,
          default: `Widget region ${region.area}`
        })}
      >
        {widgets.length === 0 ? (
          <div className='text-muted-foreground flex h-24 w-full min-w-0 items-center justify-center text-center text-xs select-none sm:h-32'>
            {t('region.empty', {
              default: 'Drop widgets from the list on the left'
            })}
          </div>
        ) : null}
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {widgets.map((w) => (
            <SortableWidgetBlock key={w.id} widget={w} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export function widgetsInRegionList(widgets: W[], regionId: string): W[] {
  return widgets.filter((w) => w.regionId === regionId);
}
