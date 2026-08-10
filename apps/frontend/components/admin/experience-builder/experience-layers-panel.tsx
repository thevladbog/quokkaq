'use client';

import type { ExperiencePage } from '@quokkaq/shared-types';
import {
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockKeyholeOpen,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { experienceWidgetTitle } from './experience-widget-catalog';

export type ExperienceEditorLayerState = Record<
  string,
  { locked?: boolean; hidden?: boolean }
>;

export function editorLayerKey(pageId: string, widgetId: string): string {
  return `${pageId}:${widgetId}`;
}

export type ExperienceLayersPanelProps = {
  page: ExperiencePage;
  selectedWidgetId?: string;
  orderedWidgetIds?: readonly string[];
  editorState: ExperienceEditorLayerState;
  onSelect: (widgetId: string) => void;
  onMove: (widgetId: string, direction: -1 | 1) => void;
  onToggleLock: (widgetId: string) => void;
  onToggleHidden: (widgetId: string) => void;
};

export function ExperienceLayersPanel({
  page,
  selectedWidgetId,
  orderedWidgetIds,
  editorState,
  onSelect,
  onMove,
  onToggleLock,
  onToggleHidden
}: ExperienceLayersPanelProps) {
  const t = useTranslations('experience.builder');
  const order = new Map(
    (orderedWidgetIds ?? []).map((id, index) => [id, index])
  );
  const widgets = [...page.widgets].sort(
    (left, right) =>
      (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );
  return (
    <section
      className='flex min-h-0 flex-1 flex-col'
      aria-label={t('layers.label', { default: 'Layers' })}
    >
      <div className='min-h-0 space-y-1 overflow-y-auto p-3'>
        {widgets.length === 0 ? (
          <p className='text-muted-foreground rounded-md border border-dashed p-3 text-sm'>
            {t('layers.empty', { default: 'Add a widget to create a layer.' })}
          </p>
        ) : (
          widgets.map((widget, index) => {
            const title = experienceWidgetTitle(widget, (entry) =>
              t(entry.labelKey, { default: entry.label })
            );
            const metadata =
              editorState[editorLayerKey(page.id, widget.id)] ?? {};
            const selected = selectedWidgetId === widget.id;
            return (
              <div
                key={widget.id}
                data-testid='experience-layer'
                className={cn(
                  'group flex min-h-12 items-center gap-1 rounded-md border p-1.5',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/70 border-transparent',
                  metadata.hidden && 'opacity-60'
                )}
              >
                <GripVertical
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden
                />
                <Button
                  type='button'
                  variant='ghost'
                  className='h-auto min-h-9 min-w-0 flex-1 justify-start px-1.5 text-left'
                  onClick={() => onSelect(widget.id)}
                  aria-pressed={selected}
                  aria-label={`Select ${title}`}
                >
                  <span className='min-w-0 truncate'>{title}</span>
                </Button>
                <div className='flex shrink-0 items-center'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    className='min-h-11 min-w-11'
                    aria-label={t('layers.moveUp', {
                      title,
                      default: `Move ${title} up`
                    })}
                    disabled={index === 0}
                    onClick={() => onMove(widget.id, -1)}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    className='min-h-11 min-w-11'
                    aria-label={t('layers.moveDown', {
                      title,
                      default: `Move ${title} down`
                    })}
                    disabled={index === widgets.length - 1}
                    onClick={() => onMove(widget.id, 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type='button'
                    variant={metadata.locked ? 'secondary' : 'ghost'}
                    size='icon-sm'
                    className='min-h-11 min-w-11'
                    aria-label={
                      metadata.locked
                        ? t('layers.unlock', {
                            title,
                            default: `Unlock ${title}`
                          })
                        : t('layers.lock', { title, default: `Lock ${title}` })
                    }
                    aria-pressed={Boolean(metadata.locked)}
                    onClick={() => onToggleLock(widget.id)}
                  >
                    {metadata.locked ? <Lock /> : <LockKeyholeOpen />}
                  </Button>
                  <Button
                    type='button'
                    variant={metadata.hidden ? 'secondary' : 'ghost'}
                    size='icon-sm'
                    className='min-h-11 min-w-11'
                    aria-label={
                      metadata.hidden
                        ? t('layers.show', { title, default: `Show ${title}` })
                        : t('layers.hide', { title, default: `Hide ${title}` })
                    }
                    aria-pressed={Boolean(metadata.hidden)}
                    onClick={() => onToggleHidden(widget.id)}
                  >
                    {metadata.hidden ? <EyeOff /> : <Eye />}
                  </Button>
                  <span className='sr-only'>
                    {metadata.hidden
                      ? t('layers.hidden', { default: 'Hidden in editor' })
                      : ''}
                    {metadata.locked
                      ? t('layers.lockedForEditing', {
                          default: 'Locked for editing'
                        })
                      : ''}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className='text-muted-foreground border-t px-3 py-2 text-xs'>
        {t('layers.note', {
          default: 'Locks and hidden layers affect this editor only.'
        })}
      </p>
    </section>
  );
}
