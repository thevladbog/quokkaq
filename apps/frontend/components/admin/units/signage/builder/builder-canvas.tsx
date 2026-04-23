'use client';

import { useDroppable } from '@dnd-kit/core';
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { useShallow } from 'zustand/react/shallow';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { ScreenCellGridWidget } from '@quokkaq/shared-types';
import { BuilderGridCell } from './builder-grid-cell';
import { BuilderCanvasWidget } from './builder-canvas-widget';

const GRID_GAP_CLASS = 'gap-[3px]';

type BuilderCanvasProps = {
  canEdit?: boolean;
};

/**
 * Cell-grid preview: active orientation from toolbar; zoom scales the design surface.
 */
export function BuilderCanvas({ canEdit = true }: BuilderCanvasProps) {
  const t = useTranslations('admin.screenBuilder');
  const { setNodeRef } = useDroppable({ id: 'builder-canvas-drop' });
  const gridRef = useRef<HTMLDivElement>(null);
  const [template, zoom, editOrientation, selection, setSelection] =
    useScreenBuilderStore(
      useShallow((s) => [
        s.template,
        s.zoom,
        s.editOrientation,
        s.selection,
        s.setSelection
      ])
    );

  const face = useMemo(
    () => template[editOrientation],
    [template, editOrientation]
  );

  const { columns, rows, widgets } = face;

  const containerHeightClass = useMemo(() => {
    if (editOrientation === 'portrait') {
      return 'h-[min(720px,80vh)] min-h-0 sm:min-h-[42rem]';
    }
    return 'h-[min(520px,56vh)] min-h-0 sm:min-h-[26rem]';
  }, [editOrientation]);

  const aspectRatioStyle = useMemo((): CSSProperties => {
    if (editOrientation === 'portrait') {
      return {
        aspectRatio: '9 / 16',
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'auto',
        height: '100%',
        margin: '0 auto'
      };
    }
    return {
      aspectRatio: '16 / 9',
      maxWidth: '100%',
      maxHeight: '100%',
      width: '100%',
      height: 'auto',
      margin: 'auto 0'
    };
  }, [editOrientation]);

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    height: '100%',
    width: '100%'
  };

  const gridCells = useMemo(() => {
    const nodes: ReactNode[] = [];
    for (let row = 1; row <= rows; row += 1) {
      for (let col = 1; col <= columns; col += 1) {
        nodes.push(
          <BuilderGridCell
            key={`cell-${editOrientation}-${col}-${row}`}
            col={col}
            row={row}
          />
        );
      }
    }
    return nodes;
  }, [columns, rows, editOrientation]);

  return (
    <div
      className={cn(
        'bg-muted/30 flex w-full min-w-0 items-center justify-center overflow-hidden p-1 sm:p-2',
        containerHeightClass
      )}
      aria-label={t('canvas.label', { default: 'Layout canvas' })}
    >
      <div
        className='min-w-0 origin-top-left will-change-transform'
        style={{
          transform: `scale(${zoom})`,
          ...aspectRatioStyle
        }}
      >
        <div
          ref={setNodeRef}
          className='bg-muted/40 border-border h-full min-h-0 w-full rounded-md border-2 p-1.5 shadow-inner'
        >
          <div
            ref={gridRef}
            className={cn('h-full w-full', GRID_GAP_CLASS)}
            style={gridStyle}
          >
            {gridCells}
            {widgets.map((w: ScreenCellGridWidget) => {
              const selected =
                selection.kind === 'widget' && selection.id === w.id;
              return (
                <BuilderCanvasWidget
                  key={`${editOrientation}-${w.id}`}
                  widget={w}
                  selected={selected}
                  canEdit={canEdit}
                  editOrientation={editOrientation}
                  gridElRef={gridRef}
                  columns={columns}
                  rows={rows}
                  onSelect={() => setSelection({ kind: 'widget', id: w.id })}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
