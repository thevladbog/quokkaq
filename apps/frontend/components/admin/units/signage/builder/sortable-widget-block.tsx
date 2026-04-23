'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ScreenTemplate } from '@quokkaq/shared-types';
import { Button } from '@/components/ui/button';
import { BuilderWidgetPreview } from './widget-preview';
import { Copy, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';

type W = ScreenTemplate['widgets'][number];

export function SortableWidgetBlock({ widget }: { widget: W }) {
  const t = useTranslations('admin.screenBuilder');
  const selection = useScreenBuilderStore((s) => s.selection);
  const setSelection = useScreenBuilderStore((s) => s.setSelection);
  const selectedId = selection.kind === 'widget' ? selection.id : null;
  const setSelected = (kind: 'none' | 'region' | 'widget', id?: string) => {
    if (kind === 'none' || !id) setSelection({ kind: 'none' });
    else if (kind === 'region') setSelection({ kind: 'region', id });
    else setSelection({ kind: 'widget', id });
  };
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id: widget.id, data: { type: 'widget' as const, widget } });
  const remove = useScreenBuilderStore((s) => s.removeWidget);
  const duplicate = useScreenBuilderStore((s) => s.duplicateWidget);
  const isSel = selectedId === widget.id;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition as string
  } as const;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative w-full max-w-full min-w-0 shrink-0 pl-0',
        (isDragging || isOver) && 'z-20'
      )}
    >
      <div
        className={cn(
          'relative flex w-full max-w-full min-w-0 gap-1.5 rounded-lg border-2 p-0.5 transition-[box-shadow,background] duration-200',
          isSel
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'hover:bg-muted/30 border-transparent',
          isDragging && 'ring-primary/30 bg-muted/20 ring-2'
        )}
      >
        <button
          type='button'
          className='text-muted-foreground flex max-h-10 min-h-10 w-6 shrink-0 items-center justify-center self-start rounded border border-dashed p-0'
          aria-label={t('widget.dragHandle', { default: 'Drag to reorder' })}
          title={t('widget.dragHandle', { default: 'Drag to reorder' })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className='h-4 w-4' />
        </button>
        <button
          type='button'
          className='min-w-0 flex-1 cursor-pointer text-left'
          onClick={() => {
            setSelected('widget', widget.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSelected('widget', widget.id);
            }
          }}
        >
          <BuilderWidgetPreview widget={widget} />
        </button>
        <div className='flex flex-col justify-start gap-0.5 pr-0.5 opacity-0 group-hover:opacity-100 has-[:focus]:opacity-100 has-[:focus-visible]:opacity-100 has-[:hover]:opacity-100'>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='h-7 w-7'
            onClick={() => {
              void duplicate(widget.id);
            }}
            title={t('widget.duplicate', { default: 'Duplicate' })}
            aria-label={t('widget.duplicate', { default: 'Duplicate' })}
          >
            <Copy className='h-3.5 w-3.5' />
          </Button>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='h-7 w-7'
            onClick={() => {
              void remove(widget.id);
            }}
            title={t('widget.delete', { default: 'Delete' })}
            aria-label={t('widget.delete', { default: 'Delete' })}
          >
            <Trash2 className='h-3.5 w-3.5' />
          </Button>
        </div>
        <AnimatePresence>
          {isSel ? (
            <motion.span
              className='bg-primary absolute right-0 bottom-0 left-0 h-0.5 rounded-b-md'
              initial={{ scaleX: 0.6, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
