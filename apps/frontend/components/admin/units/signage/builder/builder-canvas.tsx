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
import type { GridPlacement } from '@/lib/screen-grid-editor';
import { BuilderGridCell } from './builder-grid-cell';
import { BuilderCanvasWidget } from './builder-canvas-widget';

const GRID_GAP_CLASS = 'gap-[3px]';
const GRID_GAP_PX = 3;
const DEVICE_FRAME_CHROME_PX = 20;

type BuilderCanvasProps = {
  canEdit?: boolean;
};

export type BuilderCanvasGridItem = {
  id: string;
  placement: GridPlacement;
};

type SafeArea = { top: number; right: number; bottom: number; left: number };
type DeviceSize = { width: number; height: number };

const DEVICE_FRAME_SCALE = 0.48;

/**
 * CSS percentage insets are resolved against the corresponding dimension of an
 * absolutely-positioned element. Keeping height-derived insets on top/bottom
 * avoids the historical padding-percent bug (vertical padding used width).
 */
export function safeAreaOverlayInsets(
  safeArea: SafeArea,
  deviceSize: DeviceSize
): CSSProperties {
  return {
    top: `${(safeArea.top / deviceSize.height) * 100}%`,
    right: `${(safeArea.right / deviceSize.width) * 100}%`,
    bottom: `${(safeArea.bottom / deviceSize.height) * 100}%`,
    left: `${(safeArea.left / deviceSize.width) * 100}%`
  };
}

export function resolvedDeviceFrameScale(
  deviceSize: DeviceSize,
  grid: { columns: number; rows: number },
  zoom: number,
  minimumInteractiveCellSize?: number
): number {
  const zoomScale = DEVICE_FRAME_SCALE * zoom;
  if (
    !minimumInteractiveCellSize ||
    !Number.isFinite(minimumInteractiveCellSize) ||
    minimumInteractiveCellSize <= 0
  ) {
    return zoomScale;
  }
  const widthForTargets =
    grid.columns * minimumInteractiveCellSize +
    Math.max(0, grid.columns - 1) * GRID_GAP_PX +
    DEVICE_FRAME_CHROME_PX;
  const heightForTargets =
    grid.rows * minimumInteractiveCellSize +
    Math.max(0, grid.rows - 1) * GRID_GAP_PX +
    DEVICE_FRAME_CHROME_PX;
  return Math.max(
    zoomScale,
    widthForTargets / deviceSize.width,
    heightForTargets / deviceSize.height
  );
}

function scaledDeviceFrameStyle(
  deviceSize: DeviceSize,
  scale: number
): CSSProperties {
  return {
    width: `${Math.round(deviceSize.width * scale)}px`,
    height: `${Math.round(deviceSize.height * scale)}px`,
    aspectRatio: `${deviceSize.width} / ${deviceSize.height}`
  };
}

export type BuilderCanvasGridProps<TItem extends BuilderCanvasGridItem> = {
  /** Human readable layout face (e.g. portrait/landscape) supplied by the caller. */
  face: string;
  grid: { columns: number; rows: number };
  /** The caller owns layouts; this adapter receives only the active face's items. */
  items: readonly TItem[];
  selectionId?: string;
  canEdit: boolean;
  zoom?: number;
  /** Enlarges the editable device only as much as needed for accessible cell targets. */
  minimumInteractiveCellSize?: number;
  safeArea?: SafeArea;
  deviceSize?: DeviceSize;
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
  minimumInteractiveCellSize,
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
  const deviceFrameScale = deviceSize
    ? resolvedDeviceFrameScale(
        deviceSize,
        grid,
        zoom,
        minimumInteractiveCellSize
      )
    : zoom;
  const aspectRatio = deviceSize
    ? `${deviceSize.width} / ${deviceSize.height}`
    : face === 'portrait'
      ? '9 / 16'
      : '16 / 9';
  const safeAreaStyle =
    safeArea && deviceSize
      ? safeAreaOverlayInsets(safeArea, deviceSize)
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
        'bg-muted/30 min-h-0 w-full min-w-0 overflow-auto',
        containerClassName ?? 'p-2'
      )}
      aria-label={ariaLabel}
      data-testid='builder-canvas-zoom-surface'
    >
      <div
        className='flex min-h-full min-w-full items-center justify-center p-5'
        style={
          deviceSize
            ? {
                minWidth: `${Math.round(
                  deviceSize.width * deviceFrameScale + 40
                )}px`,
                minHeight: `${Math.round(
                  deviceSize.height * deviceFrameScale + 40
                )}px`
              }
            : undefined
        }
      >
        <div
          data-testid='builder-canvas-device-frame'
          data-zoom={zoom}
          data-effective-scale={deviceFrameScale}
          className='min-w-0 origin-top-left will-change-transform'
          style={
            deviceSize
              ? scaledDeviceFrameStyle(deviceSize, deviceFrameScale)
              : {
                  transform: `scale(${zoom})`,
                  aspectRatio,
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: face === 'portrait' ? 'auto' : '100%',
                  height: face === 'portrait' ? '100%' : 'auto'
                }
          }
        >
          <div
            ref={droppableTarget === 'frame' ? setNodeRef : undefined}
            className={cn(
              'border-border h-full min-h-0 w-full border-2 p-1.5 shadow-inner',
              frameClassName ?? 'bg-background rounded-xl'
            )}
          >
            <div className='relative h-full w-full'>
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
                    onPlacementChange:
                      canEdit && onPlacementChange
                        ? (placement) => onPlacementChange(item.id, placement)
                        : undefined
                  })
                )}
              </div>
              {safeAreaStyle ? (
                <div
                  data-testid='builder-canvas-safe-area'
                  aria-hidden
                  className='pointer-events-none absolute rounded-lg border border-dashed border-amber-500/40'
                  style={safeAreaStyle}
                />
              ) : null}
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
  const [
    template,
    zoom,
    editOrientation,
    selection,
    setSelection,
    setWidgetPlacement
  ] = useScreenBuilderStore(
    useShallow((s) => [
      s.template,
      s.zoom,
      s.editOrientation,
      s.selection,
      s.setSelection,
      s.setWidgetPlacement
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
      onPlacementChange={(widgetId, placement) => {
        if (!canEdit) return;
        setWidgetPlacement(widgetId, placement, editOrientation);
      }}
      renderCell={({ col, row }) => <BuilderGridCell col={col} row={row} />}
      renderItem={({
        item: widget,
        selected,
        gridElRef,
        onSelect,
        onPlacementChange
      }) => (
        <BuilderCanvasWidget
          key={`${editOrientation}-${widget.id}`}
          widget={widget}
          selected={selected}
          canEdit={canEdit}
          gridElRef={gridElRef}
          columns={columns}
          rows={rows}
          onSelect={onSelect}
          onPlacementChange={onPlacementChange}
        />
      )}
    />
  );
}
