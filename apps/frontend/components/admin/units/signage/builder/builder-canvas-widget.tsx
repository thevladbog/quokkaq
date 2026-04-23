'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScreenCellGridWidget } from '@quokkaq/shared-types';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { cn } from '@/lib/utils';
import { canvasWidgetId } from './screen-dnd-ids';
import { clientPointToGridCell } from './builder-canvas-grid-utils';
import { widgetBuilderKey } from '@/lib/widget-display-name';

const GRID_GAP_PX = 3;

type Props = {
  widget: ScreenCellGridWidget;
  selected: boolean;
  canEdit: boolean;
  editOrientation: 'portrait' | 'landscape';
  gridElRef: React.RefObject<HTMLDivElement | null>;
  columns: number;
  rows: number;
  onSelect: () => void;
};

export function BuilderCanvasWidget({
  widget,
  selected,
  canEdit,
  editOrientation,
  gridElRef,
  columns,
  rows,
  onSelect
}: Props) {
  const t = useTranslations('admin.screenBuilder');
  const setWidgetPlacement = useScreenBuilderStore((s) => s.setWidgetPlacement);

  const placementKey = `${widget.placement.col}-${widget.placement.row}-${widget.placement.colSpan}-${widget.placement.rowSpan}`;
  const [lastPlacementKey, setLastPlacementKey] = useState(placementKey);
  const [resizeSpan, setResizeSpan] = useState<{
    colSpan: number;
    rowSpan: number;
  } | null>(null);
  const resizeSpanRef = useRef<{
    colSpan: number;
    rowSpan: number;
  } | null>(null);
  const resizingActiveRef = useRef(false);

  useEffect(() => {
    resizeSpanRef.current = resizeSpan;
  }, [resizeSpan]);

  if (placementKey !== lastPlacementKey) {
    setLastPlacementKey(placementKey);
    setResizeSpan(null);
  }

  const itemStyle = useMemo(() => {
    const effectivePlacement = resizeSpan
      ? { ...widget.placement, ...resizeSpan }
      : widget.placement;
    const { col, row, colSpan, rowSpan } = effectivePlacement;
    return {
      gridColumn: `${col} / span ${colSpan}`,
      gridRow: `${row} / span ${rowSpan}`,
      minWidth: 0,
      minHeight: 0
    } as const;
  }, [resizeSpan, widget.placement]);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: canvasWidgetId(widget.id),
      disabled: !canEdit,
      data: { from: 'canvas' as const, widgetId: widget.id }
    });

  const dragStyle = useMemo(
    () => ({
      ...itemStyle,
      transform: CSS.Translate.toString(transform),
      opacity: isDragging ? 0 : 1
    }),
    [itemStyle, transform, isDragging]
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canEdit || !selected) return;
      e.preventDefault();
      e.stopPropagation();
      resizingActiveRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [canEdit, selected]
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizingActiveRef.current) return;
      const grid = gridElRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const { col, row } = widget.placement;
      const endCell = clientPointToGridCell(
        e.clientX,
        e.clientY,
        rect,
        columns,
        rows,
        GRID_GAP_PX
      );
      const maxColSpan = columns - col + 1;
      const maxRowSpan = rows - row + 1;
      const nextColSpan = Math.max(
        1,
        Math.min(maxColSpan, endCell.col - col + 1)
      );
      const nextRowSpan = Math.max(
        1,
        Math.min(maxRowSpan, endCell.row - row + 1)
      );
      const cur = resizeSpanRef.current;
      if (cur?.colSpan === nextColSpan && cur?.rowSpan === nextRowSpan) {
        return;
      }
      if (
        !cur &&
        nextColSpan === widget.placement.colSpan &&
        nextRowSpan === widget.placement.rowSpan
      ) {
        return;
      }
      setResizeSpan({ colSpan: nextColSpan, rowSpan: nextRowSpan });
    },
    [columns, gridElRef, rows, widget.placement]
  );

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      resizingActiveRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const span = resizeSpanRef.current;
      setResizeSpan(null);
      if (
        span &&
        (span.colSpan !== widget.placement.colSpan ||
          span.rowSpan !== widget.placement.rowSpan)
      ) {
        setWidgetPlacement(
          widget.id,
          {
            ...widget.placement,
            colSpan: span.colSpan,
            rowSpan: span.rowSpan
          },
          editOrientation
        );
      }
    },
    [editOrientation, setWidgetPlacement, widget.id, widget.placement]
  );

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      {...listeners}
      role='button'
      tabIndex={0}
      className={cn(
        'bg-card relative z-10 flex min-h-[1.25rem] min-w-0 flex-col justify-center overflow-hidden rounded-sm border-2 border-neutral-500 px-1 py-0.5 text-left text-[10px] leading-tight shadow-sm transition-colors outline-none sm:text-xs',
        'hover:border-primary/50 hover:bg-accent/25',
        'dark:border-neutral-400',
        canEdit && 'cursor-grab touch-manipulation active:cursor-grabbing',
        selected && 'ring-primary border-primary ring-2'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      aria-label={`${t(`widget.${widgetBuilderKey(widget.type)}`)} (${widget.id})`}
    >
      <span className='text-muted-foreground truncate font-medium'>
        {t(`widget.${widgetBuilderKey(widget.type)}`)}
      </span>
      <span className='text-muted-foreground/80 truncate text-[10px]'>
        {widget.id}
      </span>
      {canEdit && selected ? (
        <span
          role='presentation'
          className={cn(
            'absolute right-0 bottom-0 z-20 h-3.5 w-3.5 touch-none',
            'border-primary bg-primary/90 cursor-nwse-resize rounded-tl border',
            'hover:bg-primary shadow-sm'
          )}
          aria-hidden
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      ) : null}
    </div>
  );
}
