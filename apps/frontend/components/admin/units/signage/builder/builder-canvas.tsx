'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  Fragment,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { useShallow } from 'zustand/react/shallow';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { ScreenCellGridWidget } from '@quokkaq/shared-types';
import type { GridPlacement } from '@/lib/screen-grid-editor';
import { BuilderGridCell } from './builder-grid-cell';
import { BuilderCanvasWidget } from './builder-canvas-widget';

const GRID_GAP_CLASS = 'gap-[3px]';

type BuilderCanvasProps = {
  canEdit?: boolean;
};

export type BuilderCanvasGridItem = {
  id: string;
  placement: GridPlacement;
};

export type BuilderCanvasGridProps<TItem extends BuilderCanvasGridItem> = {
  /** Human readable layout face (e.g. portrait/landscape) supplied by the caller. */
  face: string;
  grid: { columns: number; rows: number };
  /** The caller owns layouts; this adapter receives only the active face's items. */
  items: readonly TItem[];
  selectionId?: string;
  canEdit: boolean;
  zoom?: number;
  safeArea?: { top: number; right: number; bottom: number; left: number };
  deviceSize?: { width: number; height: number };
  droppableId?: string;
  droppableTarget?: 'frame' | 'grid';
  ariaLabel: string;
  containerClassName?: string;
  frameClassName?: string;
  onSelect?: (itemId: string) => void;
  onPlacementChange?: (itemId: string, placement: GridPlacement) => void;
  renderCell?: (cell: { col: number; row: number }) => ReactNode;
  renderItem: (context: {
    item: TItem;
    selected: boolean;
    canEdit: boolean;
    gridElRef: React.RefObject<HTMLDivElement | null>;
    onSelect: () => void;
    onPlacementChange?: (placement: GridPlacement) => void;
  }) => ReactNode;
};

/**
 * Prop-driven grid adapter shared by legacy signage and the composable experience
 * builder. It deliberately receives the selected face/layout from its caller;
 * it never infers orientation or mutates a store itself.
 */
export function BuilderCanvasGrid<TItem extends BuilderCanvasGridItem>({
  face,
  grid,
  items,
  selectionId,
  canEdit,
  zoom = 1,
  safeArea,
  deviceSize,
  droppableId,
  droppableTarget = 'grid',
  ariaLabel,
  containerClassName,
  frameClassName,
  onSelect,
  onPlacementChange,
  renderCell,
  renderItem
}: BuilderCanvasGridProps<TItem>) {
  const { setNodeRef } = useDroppable({
    id: droppableId ?? `builder-grid-${face}`,
    disabled: !droppableId
  });
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const gridElRef = useMemo<React.RefObject<HTMLDivElement | null>>(
    () => ({ current: gridElement }),
    [gridElement]
  );
  const setGridRef = useCallback(
    (node: HTMLDivElement | null) => {
      setGridElement(node);
      if (droppableTarget === 'grid') {
        setNodeRef(node);
      }
    },
    [droppableTarget, setNodeRef]
  );
  const { columns, rows } = grid;
  const aspectRatio = deviceSize
    ? `${deviceSize.width} / ${deviceSize.height}`
    : face === 'portrait'
      ? '9 / 16'
      : '16 / 9';
  const safeAreaStyle: CSSProperties | undefined =
    safeArea && deviceSize
      ? {
          paddingTop: `${(safeArea.top / deviceSize.height) * 100}%`,
          paddingRight: `${(safeArea.right / deviceSize.width) * 100}%`,
          paddingBottom: `${(safeArea.bottom / deviceSize.height) * 100}%`,
          paddingLeft: `${(safeArea.left / deviceSize.width) * 100}%`
        }
      : undefined;
  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    height: '100%',
    width: '100%'
  };

  const cells = useMemo(() => {
    const nodes: ReactNode[] = [];
    for (let row = 1; row <= rows; row += 1) {
      for (let col = 1; col <= columns; col += 1) {
        nodes.push(
          <Fragment key={`${face}-${col}-${row}`}>
            {renderCell?.({ col, row }) ?? (
              <span
                className='border-border/70 bg-muted/30 block h-full w-full border'
                style={{ gridColumn: col, gridRow: row }}
              />
            )}
          </Fragment>
        );
      }
    }
    return nodes;
  }, [face, renderCell, rows, columns]);

  return (
    <div
      className={cn(
        'bg-muted/30 flex w-full min-w-0 items-center justify-center overflow-hidden',
        containerClassName ?? 'p-2'
      )}
      aria-label={ariaLabel}
    >
      <div
        className='min-w-0 origin-top-left will-change-transform'
        style={{
          transform: `scale(${zoom})`,
          aspectRatio,
          maxWidth: '100%',
          maxHeight: '100%',
          width:
            deviceSize && deviceSize.width < deviceSize.height
              ? 'auto'
              : '100%',
          height:
            deviceSize && deviceSize.width < deviceSize.height ? '100%' : 'auto'
        }}
      >
        <div
          ref={droppableTarget === 'frame' ? setNodeRef : undefined}
          className={cn(
            'border-border h-full min-h-0 w-full border-2 p-1.5 shadow-inner',
            frameClassName ?? 'bg-background rounded-xl'
          )}
        >
          <div
            className={cn(
              'h-full w-full',
              safeArea &&
                deviceSize &&
                'rounded-lg border border-dashed border-amber-500/40 p-1'
            )}
            style={safeAreaStyle}
          >
            <div
              ref={setGridRef}
              className={cn('h-full w-full gap-[3px]', GRID_GAP_CLASS)}
              style={gridStyle}
            >
              {cells}
              {items.map((item) =>
                renderItem({
                  item,
                  selected: selectionId === item.id,
                  canEdit,
                  gridElRef,
                  onSelect: () => onSelect?.(item.id),
                  onPlacementChange: onPlacementChange
                    ? (placement) => onPlacementChange(item.id, placement)
                    : undefined
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Cell-grid preview: active orientation from toolbar; zoom scales the design surface.
 */
export function BuilderCanvas({ canEdit = true }: BuilderCanvasProps) {
  const t = useTranslations('admin.screenBuilder');
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

  return (
    <BuilderCanvasGrid
      face={editOrientation}
      grid={{ columns, rows }}
      items={widgets}
      selectionId={selection.kind === 'widget' ? selection.id : undefined}
      canEdit={canEdit}
      zoom={zoom}
      droppableId='builder-canvas-drop'
      droppableTarget='frame'
      ariaLabel={t('canvas.label', { default: 'Layout canvas' })}
      containerClassName={cn('p-1 sm:p-2', containerHeightClass)}
      frameClassName='bg-muted/40 rounded-md'
      onSelect={(id) => setSelection({ kind: 'widget', id })}
      renderCell={({ col, row }) => <BuilderGridCell col={col} row={row} />}
      renderItem={({ item: widget, selected, gridElRef, onSelect }) => (
        <BuilderCanvasWidget
          key={`${editOrientation}-${widget.id}`}
          widget={widget as ScreenCellGridWidget}
          selected={selected}
          canEdit={canEdit}
          editOrientation={editOrientation}
          gridElRef={gridElRef}
          columns={columns}
          rows={rows}
          onSelect={onSelect}
        />
      )}
    />
  );
}
