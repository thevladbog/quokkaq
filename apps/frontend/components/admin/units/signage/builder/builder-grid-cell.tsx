'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { canvasCellId } from './screen-dnd-ids';

type Props = {
  col: number;
  row: number;
};

export function BuilderGridCell({ col, row }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: canvasCellId(col, row),
    data: { kind: 'canvas-cell', col, row }
  });

  return (
    <div
      ref={setNodeRef}
      style={{ gridColumn: col, gridRow: row }}
      className={cn(
        'z-0 min-h-0 min-w-0 rounded-[1px] transition-colors',
        'border border-neutral-400/70 bg-neutral-100/90',
        'dark:border-neutral-500 dark:bg-neutral-950/40',
        isOver && 'bg-primary/20 ring-primary/60 ring-1'
      )}
    />
  );
}
