'use client';

import type {
  ExperienceLayoutVariant,
  ExperiencePage
} from '@quokkaq/shared-types';
import { useDraggable } from '@dnd-kit/core';
import { AlertTriangle, Copy, GripVertical, MousePointer2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { experienceWidgetTitle } from './experience-widget-catalog';
import { classifyExperienceLayout } from './experience-layout-classification';
import { experienceTrayDragId } from './experience-canvas';

export type UnplacedWidget = {
  id: string;
  title: string;
  reason: 'unplaced' | 'overflowing';
};

export function collectUnplacedWidgets(
  page: ExperiencePage,
  variant: ExperienceLayoutVariant,
  translate?: Parameters<typeof experienceWidgetTitle>[1]
): UnplacedWidget[] {
  return classifyExperienceLayout(page, variant).flatMap((item) => {
    if (item.status === 'valid') return [];
    return [
      {
        id: item.widget.id,
        title: experienceWidgetTitle(item.widget, translate),
        reason: item.status
      }
    ];
  });
}

export type UnplacedWidgetsTrayProps = {
  page: ExperiencePage;
  variant: ExperienceLayoutVariant;
  variants: readonly ExperienceLayoutVariant[];
  canEdit: boolean;
  pendingWidgetId?: string;
  onPreparePlacement: (widget: UnplacedWidget) => void;
  onCopyLayout: (sourceVariantId: string) => void;
};

function UnplacedWidgetControl({
  widget,
  canEdit,
  pending,
  placeLabel,
  reasonLabel,
  onPreparePlacement
}: {
  widget: UnplacedWidget;
  canEdit: boolean;
  pending: boolean;
  placeLabel: string;
  reasonLabel: string;
  onPreparePlacement: (widget: UnplacedWidget) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: experienceTrayDragId(widget.id),
    disabled: !canEdit,
    data: { kind: 'experience-tray-widget', widgetId: widget.id }
  });

  return (
    <Button
      ref={setNodeRef}
      type='button'
      variant={pending ? 'secondary' : 'outline'}
      size='sm'
      className='bg-background min-h-11 border-amber-500/55 hover:bg-amber-100 dark:hover:bg-amber-950'
      disabled={!canEdit}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (canEdit) onPreparePlacement(widget);
      }}
      onKeyDown={(event) => {
        if (!canEdit) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          onPreparePlacement(widget);
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
      aria-label={placeLabel}
    >
      <GripVertical className='size-3.5' aria-hidden />
      <MousePointer2 className='size-3.5' aria-hidden />
      {widget.title}
      <span className='text-muted-foreground text-xs'>{reasonLabel}</span>
    </Button>
  );
}

export function UnplacedWidgetsTray({
  page,
  variant,
  variants,
  canEdit,
  pendingWidgetId,
  onPreparePlacement,
  onCopyLayout
}: UnplacedWidgetsTrayProps) {
  const t = useTranslations('experience.builder');
  const unplaced = collectUnplacedWidgets(page, variant, (entry) =>
    t(entry.labelKey, { default: entry.label })
  );
  const sourceVariants = variants.filter(
    (candidate) => candidate.id !== variant.id
  );
  return (
    <section
      aria-label={t('unplaced.label', { default: 'Unplaced widgets' })}
      className='mt-3 rounded-xl border border-amber-500/55 bg-amber-50/75 px-3 py-2.5 dark:bg-amber-950/20'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <AlertTriangle
            className='size-4 shrink-0 text-amber-700 dark:text-amber-300'
            aria-hidden
          />
          <div>
            <p className='text-sm font-semibold'>
              {unplaced.length === 0
                ? t('unplaced.ready', { default: 'All widgets are placed' })
                : t('unplaced.count', {
                    default: `${unplaced.length} widgets need placement`,
                    count: unplaced.length
                  })}
            </p>
            <p className='text-muted-foreground text-xs'>
              {variant.profile.width}×{variant.profile.height} ·{' '}
              {variant.profile.name}
            </p>
          </div>
        </div>
        {sourceVariants.length > 0 ? (
          <label className='flex min-h-10 items-center gap-2 text-xs font-medium'>
            <span className='sr-only'>
              {t('unplaced.copyLabel', { default: 'Copy layout from' })}
            </span>
            <select
              aria-label={t('unplaced.copyLabel', {
                default: 'Copy layout from'
              })}
              className='border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-2 text-xs outline-none focus-visible:ring-2'
              defaultValue=''
              onChange={(event) => {
                if (canEdit && event.target.value !== '') {
                  onCopyLayout(event.target.value);
                }
                event.currentTarget.value = '';
              }}
              disabled={!canEdit}
            >
              <option value=''>
                {t('unplaced.copyLabel', { default: 'Copy layout from…' })}
              </option>
              {sourceVariants.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.profile.name}
                </option>
              ))}
            </select>
            <Copy
              className='size-3.5 text-amber-800 dark:text-amber-200'
              aria-hidden
            />
          </label>
        ) : null}
      </div>
      {unplaced.length > 0 ? (
        <>
          {pendingWidgetId ? (
            <p className='mt-2 text-xs font-medium text-amber-900 dark:text-amber-100'>
              {t('unplaced.instructions', {
                default:
                  'Choose a cell on the device frame, or drag the widget to it.'
              })}
            </p>
          ) : null}
          <ul className='mt-2 flex flex-wrap gap-2' aria-live='polite'>
            {unplaced.map((widget) => (
              <li key={widget.id}>
                <UnplacedWidgetControl
                  widget={{
                    ...widget,
                    title: widget.title
                  }}
                  canEdit={canEdit}
                  pending={pendingWidgetId === widget.id}
                  placeLabel={t('unplaced.place', {
                    title: widget.title,
                    default: `Place ${widget.title}`
                  })}
                  reasonLabel={
                    widget.reason === 'overflowing'
                      ? t('unplaced.overflowing', { default: 'overflowing' })
                      : t('unplaced.unplaced', { default: 'unplaced' })
                  }
                  onPreparePlacement={onPreparePlacement}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
