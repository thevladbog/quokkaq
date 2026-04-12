'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Service, Unit, unitsApi, isRequestAbortError } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { FolderIcon } from '@/src/components/ui/icons/akar-icons-folder';
import { XSmallIcon } from '@/src/components/ui/icons/akar-icons-x-small';
import { useUpdateService } from '@/lib/hooks';
import { toast } from 'sonner';
import {
  SERVICE_GRID_COLS,
  SERVICE_GRID_ROWS,
  SERVICE_GRID_CELL_COUNT,
  SERVICE_GRID_EDITOR_GAP_PX,
  SERVICE_GRID_EDITOR_PREVIEW_ASPECT_RATIO,
  clampGridOrigin,
  indexToPosition,
  pixelSpanToColSpan,
  pixelSpanToRowSpan,
  positionToIndex,
  serviceMatchesGridZoneScope
} from '@/lib/service-grid';

type ServiceWithPosition = Service & {
  gridRow: number | null;
  gridCol: number | null;
  gridRowSpan: number | null;
  gridColSpan: number | null;
  t?: (key: string) => string;
};

const GRID_DND_PALETTE = 'grid-service-palette';

function serviceZoneDisplayName(
  service: { restrictedServiceZoneId?: string | null },
  zoneNameById: ReadonlyMap<string, string> | undefined
): string | undefined {
  const zid = service.restrictedServiceZoneId?.trim();
  if (!zid || !zoneNameById?.size) return undefined;
  return zoneNameById.get(zid);
}
const GRID_DND_PLACED = 'grid-service-placed';

type GridPaletteDragItem = { type: typeof GRID_DND_PALETTE; serviceId: string };
type GridPlacedDragItem = { type: typeof GRID_DND_PLACED; serviceId: string };
type GridDragItem = GridPaletteDragItem | GridPlacedDragItem;

// Start cell input
const StartCellInput: React.FC<{
  service: ServiceWithPosition;
  max: number;
  onPositionChange: (id: string, row: number, col: number) => void;
}> = ({ service, max, onPositionChange }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const canonical =
    service.gridRow !== null && service.gridCol !== null
      ? positionToIndex(service.gridRow, service.gridCol).toString()
      : '0';

  const value = isFocused ? draft : canonical;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const index = parseInt(draft);
    if (!isNaN(index)) {
      const safeIndex = Math.max(0, Math.min(max, index));
      const { row, col } = indexToPosition(safeIndex);

      onPositionChange(service.id, row, col);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setDraft(canonical);
  };

  return (
    <Input
      id={`startCell-${service.id}`}
      type='number'
      min='0'
      max={max}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className='w-full text-right'
    />
  );
};

// Sidebar palette item — drag + click (first free cell)
const ServiceItem: React.FC<{
  service: ServiceWithPosition;
  onAdd: (service: ServiceWithPosition) => void;
  dragLabel: string;
  zoneNameById?: ReadonlyMap<string, string>;
}> = ({ service, onAdd, dragLabel, zoneNameById }) => {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: GRID_DND_PALETTE,
      item: { type: GRID_DND_PALETTE, serviceId: service.id },
      collect: (monitor) => ({ isDragging: monitor.isDragging() })
    }),
    [service.id]
  );

  if (service.gridRow !== null && service.gridCol !== null) return null;

  const isParentService = service.isLeaf === false;
  const zoneLabel = serviceZoneDisplayName(service, zoneNameById);

  return (
    <div
      ref={drag as unknown as React.Ref<HTMLDivElement>}
      role='button'
      tabIndex={0}
      title={dragLabel}
      className={`bg-background hover:bg-accent mb-2 flex cursor-grab items-center rounded border p-3 active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => onAdd(service)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd(service);
        }
      }}
    >
      <span className='flex min-w-0 flex-grow flex-col items-start gap-0.5'>
        <span className='w-full truncate font-medium'>{service.name}</span>
        {zoneLabel ? (
          <span className='text-muted-foreground w-full truncate text-xs font-normal'>
            {zoneLabel}
          </span>
        ) : null}
      </span>
      {isParentService && (
        <FolderIcon size={16} className='ml-2 flex-shrink-0' />
      )}
    </div>
  );
};

const GridCell: React.FC<{
  row: number;
  col: number;
  allServices: ServiceWithPosition[];
  onCellDrop: (
    serviceId: string,
    dropRow: number,
    dropCol: number,
    fromPalette: boolean
  ) => void;
}> = ({ row, col, allServices, onCellDrop }) => {
  const cellIndex = positionToIndex(row, col);
  const isOccupied = allServices.some((s) => {
    if (s.gridRow === null || s.gridCol === null) return false;
    const serviceRowSpan = s.gridRowSpan || 1;
    const serviceColSpan = s.gridColSpan || 1;
    return (
      row >= s.gridRow &&
      row < s.gridRow + serviceRowSpan &&
      col >= s.gridCol &&
      col < s.gridCol + serviceColSpan
    );
  });

  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: [GRID_DND_PALETTE, GRID_DND_PLACED],
      drop: (item: GridDragItem) => {
        const fromPalette = item.type === GRID_DND_PALETTE;
        onCellDrop(item.serviceId, row, col, fromPalette);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop()
      })
    }),
    [row, col, onCellDrop]
  );

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      className={`h-full min-h-0 w-full rounded border ${isOccupied ? 'bg-muted border-border' : 'bg-secondary border-border'} ${isOver && canDrop ? 'ring-primary ring-2 ring-offset-1' : ''} border-dashed`}
    >
      <div className='flex h-full items-center justify-center text-xs text-gray-500'>
        {cellIndex}
      </div>
    </div>
  );
};

const GridServiceOverlay: React.FC<{
  service: ServiceWithPosition;
  onChange: (id: string, field: string, value: number | null) => void;
  /** Single commit for corner resize so col+row spans apply atomically (avoids stale closure on two onChange calls). */
  onGridSpanCommit: (
    id: string,
    gridColSpan: number,
    gridRowSpan: number
  ) => void;
  allServices: ServiceWithPosition[];
  cellWidth: number;
  cellHeight: number;
  dragLabel: string;
  resizeLabel: string;
  zoneNameById?: ReadonlyMap<string, string>;
}> = ({
  service,
  onChange,
  onGridSpanCommit,
  allServices,
  cellWidth,
  cellHeight,
  dragLabel,
  resizeLabel,
  zoneNameById
}) => {
  const overlayOuterRef = useRef<HTMLDivElement>(null);
  const resizeGestureCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      resizeGestureCleanupRef.current?.();
      resizeGestureCleanupRef.current = null;
    };
  }, []);

  const [resizePreview, setResizePreview] = useState<{
    colSpan: number;
    rowSpan: number;
  } | null>(null);

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: GRID_DND_PLACED,
      item: { type: GRID_DND_PLACED, serviceId: service.id },
      canDrag: resizePreview === null,
      collect: (monitor) => ({ isDragging: monitor.isDragging() })
    }),
    [service.id, resizePreview]
  );

  if (service.gridRow === null || service.gridCol === null) return null;
  if (
    service.gridRow >= SERVICE_GRID_ROWS ||
    service.gridCol >= SERVICE_GRID_COLS
  )
    return null;

  const gapSize = SERVICE_GRID_EDITOR_GAP_PX;
  const colSpan = resizePreview?.colSpan ?? (service.gridColSpan || 1);
  const rowSpan = resizePreview?.rowSpan ?? (service.gridRowSpan || 1);

  const top = service.gridRow * (cellHeight + gapSize);
  const left = service.gridCol * (cellWidth + gapSize);
  const width = colSpan * cellWidth + (colSpan - 1) * gapSize;
  const height = rowSpan * cellHeight + (rowSpan - 1) * gapSize;

  const hasConflict = () => {
    let conflict = false;
    allServices.forEach((s) => {
      if (s.id === service.id || s.gridRow === null || s.gridCol === null)
        return;
      if (s.gridRow >= SERVICE_GRID_ROWS || s.gridCol >= SERVICE_GRID_COLS)
        return;

      const sRow = s.gridRow;
      const sCol = s.gridCol;
      const sRowSpan = s.gridRowSpan || 1;
      const sColSpan = s.gridColSpan || 1;

      const ourRow = service.gridRow!;
      const ourCol = service.gridCol!;
      const ourRowSpan = rowSpan;
      const ourColSpan = colSpan;

      if (
        ourRow < sRow + sRowSpan &&
        ourRow + ourRowSpan > sRow &&
        ourCol < sCol + sColSpan &&
        ourCol + ourColSpan > sCol
      ) {
        conflict = true;
      }
    });
    return conflict;
  };

  const conflict = hasConflict();
  const isParentService = service.isLeaf === false;
  const zoneLabel = serviceZoneDisplayName(service, zoneNameById);

  const handleRemoveService = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(service.id, 'gridPositionClear', null);
  };

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    resizeGestureCleanupRef.current?.();
    resizeGestureCleanupRef.current = null;

    const sid = service.id;
    const baseCol = service.gridCol!;
    const baseRow = service.gridRow!;
    const startCs = service.gridColSpan || 1;
    const startRs = service.gridRowSpan || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;

    const outer = overlayOuterRef.current;
    const rect0 = outer?.getBoundingClientRect();
    const startW =
      rect0 && rect0.width > 0
        ? rect0.width
        : startCs * cellWidth + (startCs - 1) * gapSize;
    const startH =
      rect0 && rect0.height > 0
        ? rect0.height
        : startRs * cellHeight + (startRs - 1) * gapSize;

    const target = e.currentTarget;
    if (target instanceof HTMLElement && 'setPointerCapture' in target) {
      target.setPointerCapture(pointerId);
    }

    setResizePreview({ colSpan: startCs, rowSpan: startRs });

    const spansFromClient = (clientX: number, clientY: number) => {
      const newW = Math.max(cellWidth, startW + clientX - startX);
      const newH = Math.max(cellHeight, startH + clientY - startY);
      let newCs = pixelSpanToColSpan(newW, cellWidth, gapSize);
      let newRs = pixelSpanToRowSpan(newH, cellHeight, gapSize);
      newCs = Math.max(1, Math.min(newCs, SERVICE_GRID_COLS - baseCol));
      newRs = Math.max(1, Math.min(newRs, SERVICE_GRID_ROWS - baseRow));
      return { newCs, newRs };
    };

    const onMove = (ev: PointerEvent) => {
      const { newCs, newRs } = spansFromClient(ev.clientX, ev.clientY);
      setResizePreview({ colSpan: newCs, rowSpan: newRs });
    };

    const releaseCapture = () => {
      if (target instanceof HTMLElement) {
        try {
          if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
          }
        } catch {
          /* ignore */
        }
      }
    };

    let gestureEnded = false;
    const endResize = (ev: PointerEvent | null, commit: boolean) => {
      if (gestureEnded) return;
      gestureEnded = true;
      resizeGestureCleanupRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      setResizePreview(null);
      releaseCapture();
      if (commit && ev) {
        const { newCs, newRs } = spansFromClient(ev.clientX, ev.clientY);
        if (newCs !== startCs || newRs !== startRs) {
          onGridSpanCommit(sid, newCs, newRs);
        }
      }
    };

    const onEnd = (ev: PointerEvent) => {
      endResize(ev, ev.type === 'pointerup');
    };

    resizeGestureCleanupRef.current = () => endResize(null, false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
    window.addEventListener('pointercancel', onEnd, { once: true });
  };

  return (
    <div
      ref={overlayOuterRef}
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: service.backgroundColor || '#dbeafe',
        color: service.textColor || '#1e293b',
        border: conflict ? '2px solid #ef4444' : '1px solid #9ca3af',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        pointerEvents: 'auto',
        opacity: isDragging ? 0.85 : 1
      }}
    >
      <div className='relative flex h-full w-full items-center justify-center p-1 text-center text-xs break-words'>
        <div
          ref={drag as unknown as React.Ref<HTMLDivElement>}
          className='flex h-full min-h-0 w-full flex-col items-center justify-center gap-0.5'
          title={dragLabel}
        >
          <span className='line-clamp-3'>{service.name}</span>
          {zoneLabel ? (
            <span className='line-clamp-2 text-[10px] leading-tight opacity-80'>
              {zoneLabel}
            </span>
          ) : null}
        </div>
        {isParentService && (
          <div className='pointer-events-none absolute right-1 bottom-6 z-10'>
            <FolderIcon size={16} color={service.textColor || '#1e293b'} />
          </div>
        )}
        <div
          className='absolute top-0 right-0 z-[50] m-1 flex h-6 w-6 cursor-pointer items-center justify-center hover:opacity-80'
          style={{ pointerEvents: 'auto' }}
          onClick={handleRemoveService}
          onPointerDown={(e) => e.stopPropagation()}
          title={
            service.t?.('grid_configuration.remove_from_grid') ||
            'Remove from grid'
          }
        >
          <XSmallIcon size={14} color={service.textColor || '#1e293b'} />
        </div>
        <div
          role='button'
          tabIndex={0}
          title={resizeLabel}
          className='absolute right-0 bottom-0 z-[60] h-3 w-3 cursor-nwse-resize rounded-sm border border-current bg-white/80'
          style={{ pointerEvents: 'auto' }}
          onPointerDown={handleResizePointerDown}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
            }
          }}
        />
      </div>
    </div>
  );
};

const MainGridWithOverlays: React.FC<{
  services: ServiceWithPosition[];
  cellWidth: number;
  cellHeight: number;
  onChange: (id: string, field: string, value: number | null) => void;
  onGridSpanCommit: (
    id: string,
    gridColSpan: number,
    gridRowSpan: number
  ) => void;
  onCellDrop: (
    serviceId: string,
    row: number,
    col: number,
    fromPalette: boolean
  ) => void;
  dragPlacedLabel: string;
  resizeLabel: string;
  zoneNameById?: ReadonlyMap<string, string>;
}> = ({
  services: gridServices,
  cellWidth,
  cellHeight,
  onChange,
  onGridSpanCommit,
  onCellDrop,
  dragPlacedLabel,
  resizeLabel,
  zoneNameById
}) => {
  const gridContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={gridContainerRef}
      className='w-full'
      style={{
        position: 'relative',
        aspectRatio: SERVICE_GRID_EDITOR_PREVIEW_ASPECT_RATIO
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${SERVICE_GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${SERVICE_GRID_ROWS}, 1fr)`,
          gap: `${SERVICE_GRID_EDITOR_GAP_PX}px`
        }}
      >
        {Array.from({ length: SERVICE_GRID_ROWS }).map((_, rowIndex) =>
          Array.from({ length: SERVICE_GRID_COLS }).map((_, colIndex) => (
            <GridCell
              key={`cell-${rowIndex}-${colIndex}`}
              row={rowIndex}
              col={colIndex}
              allServices={gridServices}
              onCellDrop={onCellDrop}
            />
          ))
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          pointerEvents: 'none'
        }}
      >
        {gridServices.map((service) => (
          <GridServiceOverlay
            key={`overlay-${service.id}`}
            service={service}
            onChange={onChange}
            onGridSpanCommit={onGridSpanCommit}
            allServices={gridServices}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            dragLabel={dragPlacedLabel}
            resizeLabel={resizeLabel}
            zoneNameById={zoneNameById}
          />
        ))}
      </div>
    </div>
  );
};

const ChildGridWithOverlays: React.FC<{
  services: ServiceWithPosition[];
  cellWidth: number;
  cellHeight: number;
  onChange: (id: string, field: string, value: number | null) => void;
  onGridSpanCommit: (
    id: string,
    gridColSpan: number,
    gridRowSpan: number
  ) => void;
  onCellDrop: (
    serviceId: string,
    row: number,
    col: number,
    fromPalette: boolean
  ) => void;
  dragPlacedLabel: string;
  resizeLabel: string;
  zoneNameById?: ReadonlyMap<string, string>;
}> = ({
  services: gridServices,
  cellWidth,
  cellHeight,
  onChange,
  onGridSpanCommit,
  onCellDrop,
  dragPlacedLabel,
  resizeLabel,
  zoneNameById
}) => {
  const childGridRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={childGridRef}
      className='w-full'
      style={{
        position: 'relative',
        aspectRatio: SERVICE_GRID_EDITOR_PREVIEW_ASPECT_RATIO
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${SERVICE_GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${SERVICE_GRID_ROWS}, 1fr)`,
          gap: `${SERVICE_GRID_EDITOR_GAP_PX}px`
        }}
      >
        {Array.from({ length: SERVICE_GRID_ROWS }).map((_, rowIndex) =>
          Array.from({ length: SERVICE_GRID_COLS }).map((_, colIndex) => (
            <GridCell
              key={`child-cell-${rowIndex}-${colIndex}`}
              row={rowIndex}
              col={colIndex}
              allServices={gridServices}
              onCellDrop={onCellDrop}
            />
          ))
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          pointerEvents: 'none'
        }}
      >
        {gridServices.map((service) => (
          <GridServiceOverlay
            key={`child-overlay-${service.id}`}
            service={service}
            onChange={onChange}
            onGridSpanCommit={onGridSpanCommit}
            allServices={gridServices}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            dragLabel={dragPlacedLabel}
            resizeLabel={resizeLabel}
            zoneNameById={zoneNameById}
          />
        ))}
      </div>
    </div>
  );
};

const ServiceEditor: React.FC<{
  service: ServiceWithPosition;
  onChange: (id: string, field: string, value: number | null) => void;
  onPositionChange: (id: string, row: number, col: number) => void;
  allServices: ServiceWithPosition[];
}> = ({ service, onChange, onPositionChange, allServices }) => {
  if (service.gridRow === null || service.gridCol === null) return null;

  const maxColSpan = SERVICE_GRID_COLS - service.gridCol;
  const maxRowSpan = SERVICE_GRID_ROWS - service.gridRow;

  const hasConflict = () => {
    let conflict = false;
    allServices.forEach((s) => {
      if (s.id === service.id || s.gridRow === null || s.gridCol === null)
        return;
      if (s.gridRow >= SERVICE_GRID_ROWS || s.gridCol >= SERVICE_GRID_COLS)
        return;

      const sRow = s.gridRow;
      const sCol = s.gridCol;
      const sRowSpan = s.gridRowSpan || 1;
      const sColSpan = s.gridColSpan || 1;

      const ourRow = service.gridRow!;
      const ourCol = service.gridCol!;
      const ourRowSpan = service.gridRowSpan || 1;
      const ourColSpan = service.gridColSpan || 1;

      if (
        ourRow < sRow + sRowSpan &&
        ourRow + ourRowSpan > sRow &&
        ourCol < sCol + sColSpan &&
        ourCol + ourColSpan > sCol
      ) {
        conflict = true;
      }
    });
    return conflict;
  };

  const conflict = hasConflict();

  return (
    <Card className='mb-2'>
      <CardContent className='pt-4'>
        <div className='space-y-3'>
          <div className='flex w-full flex-col gap-2'>
            <div className='w-full'>
              <Label
                htmlFor={`startCell-${service.id}`}
                className='text-sm font-medium'
              >
                {service.t?.('grid_configuration.start_cell')}
              </Label>
              <span className='text-muted-foreground mt-0.5 block w-full text-xs'>
                (0-{SERVICE_GRID_CELL_COUNT - 1})
              </span>
            </div>
            <StartCellInput
              service={service}
              max={SERVICE_GRID_CELL_COUNT - 1}
              onPositionChange={onPositionChange}
            />
          </div>

          <div className='flex items-center justify-between'>
            <div className='mr-2 grid flex-1 grid-rows-2'>
              <Label
                htmlFor={`width-${service.id}`}
                className='text-sm font-medium'
              >
                {service.t?.('grid_configuration.width')}
              </Label>
              <span className='text-muted-foreground text-xs'>
                (1-{maxColSpan})
              </span>
            </div>
            <div className='border-border mx-2 flex-1 border-t border-dashed'></div>
            <Input
              id={`width-${service.id}`}
              type='number'
              min='1'
              max={maxColSpan}
              value={service.gridColSpan || 1}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 1;
                const safeValue = Math.max(1, Math.min(maxColSpan, value));
                onChange(service.id, 'gridColSpan', safeValue);
              }}
              className='w-20 text-right'
            />
          </div>

          <div className='flex items-center justify-between'>
            <div className='mr-2 grid flex-1 grid-rows-2'>
              <Label
                htmlFor={`height-${service.id}`}
                className='text-sm font-medium'
              >
                {service.t?.('grid_configuration.height')}
              </Label>
              <span className='text-muted-foreground text-xs'>
                (1-{maxRowSpan})
              </span>
            </div>
            <div className='border-border mx-2 flex-1 border-t border-dashed'></div>
            <Input
              id={`height-${service.id}`}
              type='number'
              min='1'
              max={maxRowSpan}
              value={service.gridRowSpan || 1}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 1;
                const safeValue = Math.max(1, Math.min(maxRowSpan, value));
                onChange(service.id, 'gridRowSpan', safeValue);
              }}
              className='w-20 text-right'
            />
          </div>

          {conflict && (
            <div className='text-destructive text-sm'>
              {service.t?.('grid_configuration.overlap_warning')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ResponsiveGridWrapper: React.FC<{
  rows: number;
  cols: number;
  onCellDimensionsChange: (width: number, height: number) => void;
  children: React.ReactNode;
}> = ({ rows, cols, onCellDimensionsChange, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const gap = SERVICE_GRID_EDITOR_GAP_PX;
    const calculateDimensions = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        const totalGapWidth = gap * (cols - 1);
        const totalGapHeight = gap * (rows - 1);
        const cellWidth = Math.max(1, (width - totalGapWidth) / cols);
        const cellHeight = Math.max(1, (height - totalGapHeight) / rows);
        onCellDimensionsChange(cellWidth, cellHeight);
      }
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        calculateDimensions(entry.contentRect.width, entry.contentRect.height);
      }
    });

    observer.observe(ref.current);

    const rect = ref.current.getBoundingClientRect();
    calculateDimensions(rect.width, rect.height);

    return () => observer.disconnect();
  }, [rows, cols, onCellDimensionsChange]);

  return (
    <div ref={ref} className='h-full w-full'>
      {children}
    </div>
  );
};

const ServiceGridWithTabs: React.FC<{
  services: ServiceWithPosition[];
  onPropertyChange: (id: string, field: string, value: number | null) => void;
  onGridSpanCommit: (
    id: string,
    gridColSpan: number,
    gridRowSpan: number
  ) => void;
  onCellDrop: (
    serviceId: string,
    row: number,
    col: number,
    fromPalette: boolean
  ) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dragPlacedLabel: string;
  resizeLabel: string;
  zoneNameById?: ReadonlyMap<string, string>;
}> = ({
  services,
  onPropertyChange,
  onGridSpanCommit,
  onCellDrop,
  activeTab,
  setActiveTab,
  dragPlacedLabel,
  resizeLabel,
  zoneNameById
}) => {
  const parentServices = services.filter((service) => service.isLeaf === false);

  const mainGridServices = services.filter(
    (service) =>
      service.gridRow !== null &&
      service.gridCol !== null &&
      !(
        service.parentId &&
        parentServices.some((parent) => parent.id === service.parentId)
      )
  );

  const getParentChildServices = (parentId: string) => {
    return services.filter(
      (service) =>
        service.parentId === parentId &&
        service.gridRow !== null &&
        service.gridCol !== null
    );
  };

  const [mainGridDimensions, setMainGridDimensions] = useState({
    width: 60,
    height: 60
  });
  const [childGridDimensions, setChildGridDimensions] = useState<{
    [key: string]: { width: number; height: number };
  }>({});

  const handleMainGridResize = useCallback((width: number, height: number) => {
    setMainGridDimensions((prev) => {
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  const handleChildGridResize = useCallback(
    (parentId: string, width: number, height: number) => {
      setChildGridDimensions((prev) => {
        if (
          prev[parentId]?.width === width &&
          prev[parentId]?.height === height
        )
          return prev;
        return { ...prev, [parentId]: { width, height } };
      });
    },
    []
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
      <TabsList className='flex w-full overflow-x-auto'>
        <TabsTrigger value='main-grid' className='flex-1'>
          {services[0]?.t?.('grid_configuration.main_grid') || 'Main Grid'}
        </TabsTrigger>
        {parentServices.map((parent) => (
          <TabsTrigger key={`tab-${parent.id}`} value={`grid-${parent.id}`}>
            {parent.name}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value='main-grid' className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>
              {/* @ts-expect-error - t is injected */}
              {mainGridServices[0]?.t('grid_configuration.main_grid') ||
                'Main Grid'}{' '}
              ({SERVICE_GRID_COLS}x{SERVICE_GRID_ROWS})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveGridWrapper
              rows={SERVICE_GRID_ROWS}
              cols={SERVICE_GRID_COLS}
              onCellDimensionsChange={handleMainGridResize}
            >
              <MainGridWithOverlays
                services={mainGridServices}
                cellWidth={mainGridDimensions.width}
                cellHeight={mainGridDimensions.height}
                onChange={onPropertyChange}
                onGridSpanCommit={onGridSpanCommit}
                onCellDrop={onCellDrop}
                dragPlacedLabel={dragPlacedLabel}
                resizeLabel={resizeLabel}
                zoneNameById={zoneNameById}
              />
            </ResponsiveGridWrapper>
          </CardContent>
        </Card>
      </TabsContent>

      {parentServices.map((parent) => {
        const childServices = getParentChildServices(parent.id);
        const gridDimensions = childGridDimensions[parent.id] || {
          width: 60,
          height: 60
        };

        return (
          <TabsContent
            key={`content-${parent.id}`}
            value={`grid-${parent.id}`}
            className='space-y-6'
          >
            <Card>
              <CardHeader>
                <CardTitle>
                  {parent.name} {/* @ts-expect-error - t is injected */}
                  {parentServices[0]?.t('grid_configuration.sub_grid')} (
                  {SERVICE_GRID_COLS}x{SERVICE_GRID_ROWS})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveGridWrapper
                  rows={SERVICE_GRID_ROWS}
                  cols={SERVICE_GRID_COLS}
                  onCellDimensionsChange={(w, h) =>
                    handleChildGridResize(parent.id, w, h)
                  }
                >
                  <ChildGridWithOverlays
                    services={childServices}
                    cellWidth={gridDimensions.width}
                    cellHeight={gridDimensions.height}
                    onChange={onPropertyChange}
                    onGridSpanCommit={onGridSpanCommit}
                    onCellDrop={onCellDrop}
                    dragPlacedLabel={dragPlacedLabel}
                    resizeLabel={resizeLabel}
                    zoneNameById={zoneNameById}
                  />
                </ResponsiveGridWrapper>
              </CardContent>
            </Card>
          </TabsContent>
        );
      })}
    </Tabs>
  );
};

const SimpleGrid: React.FC<{
  services: ServiceWithPosition[];
  onAddService: (service: ServiceWithPosition) => void;
  onPropertyChange: (id: string, field: string, value: number | null) => void;
  onGridSpanCommit: (
    id: string,
    gridColSpan: number,
    gridRowSpan: number
  ) => void;
  onPositionChange: (id: string, row: number, col: number) => void;
  dragPaletteLabel: string;
  dragPlacedLabel: string;
  resizeLabel: string;
  zoneNameById?: ReadonlyMap<string, string>;
}> = ({
  services,
  onAddService,
  onPropertyChange,
  onGridSpanCommit,
  onPositionChange,
  dragPaletteLabel,
  dragPlacedLabel,
  resizeLabel,
  zoneNameById
}) => {
  const [activeTab, setActiveTab] = useState<string>('main-grid');

  const findFirstAvailableSlot = (
    rowSpan: number,
    colSpan: number,
    gridScopeTab: string
  ): [number, number] | null => {
    if (rowSpan < 1 || colSpan < 1) {
      return null;
    }

    const parentFolderServices = services.filter(
      (service) => service.isLeaf === false
    );

    const serviceOnActiveGrid = (s: ServiceWithPosition): boolean => {
      if (s.gridRow === null || s.gridCol === null) {
        return false;
      }
      if (gridScopeTab === 'main-grid') {
        return !(
          s.parentId &&
          parentFolderServices.some((parent) => parent.id === s.parentId)
        );
      }
      const parentId = gridScopeTab.replace('grid-', '');
      return s.parentId === parentId;
    };

    for (let row = 0; row < SERVICE_GRID_ROWS; row++) {
      for (let col = 0; col < SERVICE_GRID_COLS; col++) {
        if (
          row + rowSpan > SERVICE_GRID_ROWS ||
          col + colSpan > SERVICE_GRID_COLS
        ) {
          continue;
        }
        let fits = true;
        for (let dr = 0; dr < rowSpan && fits; dr++) {
          for (let dc = 0; dc < colSpan && fits; dc++) {
            const r = row + dr;
            const c = col + dc;
            const occupied = services.some((service) => {
              if (!serviceOnActiveGrid(service)) {
                return false;
              }
              const gr = service.gridRow;
              const gc = service.gridCol;
              if (gr === null || gc === null) {
                return false;
              }
              const serviceRowSpan = service.gridRowSpan || 1;
              const serviceColSpan = service.gridColSpan || 1;
              return (
                r >= gr &&
                r < gr + serviceRowSpan &&
                c >= gc &&
                c < gc + serviceColSpan
              );
            });
            if (occupied) {
              fits = false;
            }
          }
        }
        if (fits) {
          return [row, col];
        }
      }
    }
    return null;
  };

  const handleAddService = (service: ServiceWithPosition) => {
    const rs = service.gridRowSpan || 1;
    const cs = service.gridColSpan || 1;
    const pos = findFirstAvailableSlot(rs, cs, activeTab);
    if (pos) {
      const [row, col] = pos;
      onAddService({ ...service, gridRow: row, gridCol: col });
    }
  };

  const handleCellDrop = useCallback(
    (
      serviceId: string,
      dropRow: number,
      dropCol: number,
      fromPalette: boolean
    ) => {
      const svc = services.find((s) => s.id === serviceId);
      if (!svc) return;
      const rs = svc.gridRowSpan || 1;
      const cs = svc.gridColSpan || 1;
      const { row, col } = clampGridOrigin(dropRow, dropCol, rs, cs);
      if (fromPalette) {
        onAddService({ ...svc, gridRow: row, gridCol: col });
      } else {
        onPositionChange(serviceId, row, col);
      }
    },
    [services, onAddService, onPositionChange]
  );

  const parentServices = services.filter((service) => service.isLeaf === false);

  const getAvailableServices = () => {
    if (activeTab === 'main-grid') {
      return services.filter(
        (service) =>
          (service.gridRow === null || service.gridCol === null) &&
          (service.parentId === null || service.parentId === undefined)
      );
    } else {
      const parentId = activeTab.replace('grid-', '');
      return services.filter(
        (service) =>
          (service.gridRow === null || service.gridCol === null) &&
          service.parentId === parentId
      );
    }
  };

  const getPlacedServicesForActiveTab = () => {
    if (activeTab === 'main-grid') {
      return services.filter(
        (service) =>
          service.gridRow !== null &&
          service.gridCol !== null &&
          !(
            service.parentId &&
            parentServices.some((parent) => parent.id === service.parentId)
          )
      );
    } else {
      const parentId = activeTab.replace('grid-', '');
      return services.filter(
        (service) =>
          service.parentId === parentId &&
          service.gridRow !== null &&
          service.gridCol !== null
      );
    }
  };

  const availableServices = getAvailableServices();
  const placedServicesForTab = getPlacedServicesForActiveTab();

  return (
    <DndProvider backend={HTML5Backend}>
      <div className='space-y-6'>
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-4'>
          {(availableServices.length > 0 ||
            placedServicesForTab.length > 0) && (
            <div className='space-y-6 lg:col-span-1'>
              {availableServices.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {services[0]?.t?.(
                        'grid_configuration.available_services'
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='max-h-96 space-y-2 overflow-y-auto'>
                    {availableServices.map((service) => (
                      <ServiceItem
                        key={`service-${service.id}`}
                        service={service}
                        onAdd={handleAddService}
                        dragLabel={dragPaletteLabel}
                        zoneNameById={zoneNameById}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {placedServicesForTab.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {services[0]?.t?.('grid_configuration.service_settings')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type='multiple' className='w-full'>
                      {placedServicesForTab.map((service) => {
                        const zoneLine = serviceZoneDisplayName(
                          service,
                          zoneNameById
                        );
                        return (
                          <AccordionItem
                            key={`editor-${service.id}`}
                            value={`editor-${service.id}`}
                          >
                            <AccordionTrigger className='hover:bg-accent rounded p-2 text-sm'>
                              <div className='flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left'>
                                <div className='flex w-full min-w-0 items-center'>
                                  {service.isLeaf === false && (
                                    <FolderIcon
                                      size={16}
                                      className='mr-2 shrink-0'
                                    />
                                  )}
                                  <span className='truncate font-medium'>
                                    {service.name}
                                  </span>
                                </div>
                                {zoneLine ? (
                                  <span
                                    className={`text-muted-foreground w-full truncate text-xs font-normal ${service.isLeaf === false ? 'pl-6' : ''}`}
                                  >
                                    {zoneLine}
                                  </span>
                                ) : null}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <ServiceEditor
                                service={service}
                                onChange={onPropertyChange}
                                onPositionChange={onPositionChange}
                                allServices={placedServicesForTab}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div
            className={
              availableServices.length > 0 || placedServicesForTab.length > 0
                ? 'lg:col-span-3'
                : 'lg:col-span-4'
            }
          >
            <ServiceGridWithTabs
              services={services}
              onPropertyChange={onPropertyChange}
              onGridSpanCommit={onGridSpanCommit}
              onCellDrop={handleCellDrop}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              dragPlacedLabel={dragPlacedLabel}
              resizeLabel={resizeLabel}
              zoneNameById={zoneNameById}
            />
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

const UnitList: React.FC<{
  units: Unit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  t: (key: string) => string;
}> = ({ units, selectedUnitId, onSelect, t }) => {
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>{t('grid_configuration.units')}</CardTitle>
      </CardHeader>
      <CardContent className='max-h-[calc(100vh-200px)] space-y-2 overflow-y-auto'>
        {units.map((unit) => (
          <div
            key={unit.id}
            className={`hover:bg-accent cursor-pointer rounded border p-3 ${
              selectedUnitId === unit.id
                ? 'bg-accent border-primary'
                : 'bg-background'
            }`}
            onClick={() => onSelect(unit.id)}
          >
            <div className='flex items-center'>
              <span className='flex-grow'>{unit.name}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const NoUnitSelected: React.FC<{ t: (key: string) => string }> = ({ t }) => {
  return (
    <Card className='flex h-full items-center justify-center'>
      <CardContent className='p-8 text-center'>
        <h3 className='mb-2 text-xl font-semibold'>
          {t('grid_configuration.no_unit_selected')}
        </h3>
        <p className='text-muted-foreground'>
          {t('grid_configuration.select_unit_desc')}
        </p>
      </CardContent>
    </Card>
  );
};

interface ServiceGridEditorProps {
  unitId?: string;
  /** Load the services tree from this subdivision when `unitId` is a service zone. */
  servicesTreeUnitId?: string;
  /** Lock editor to one zone column (no subdivision-wide / other-zone tabs). */
  lockedServiceZoneId?: string;
}

type AdminTranslate = (key: string) => string;

const ServiceGridWorkArea: React.FC<{
  services: ServiceWithPosition[];
  /** When set, palette/grid is limited to this service zone pool (zone settings or global picker). */
  lockedZoneScope?: string;
  /** Show subdivision-wide help text (not shown on a single-zone grid). */
  showBranchGridHint?: boolean;
  /** Resolve `restrictedServiceZoneId` → zone unit name for labels (subdivision + zone editors). */
  zoneNameById?: ReadonlyMap<string, string>;
  t: AdminTranslate;
  onAddService: (service: ServiceWithPosition) => void;
  onPropertyChange: (id: string, field: string, value: number | null) => void;
  onGridSpanCommit: (
    id: string,
    gridColSpan: number,
    gridRowSpan: number
  ) => void;
  onPositionChange: (id: string, row: number, col: number) => void;
}> = ({
  services,
  lockedZoneScope,
  showBranchGridHint,
  zoneNameById,
  t,
  onAddService,
  onPropertyChange,
  onGridSpanCommit,
  onPositionChange
}) => {
  const servicesForGridEditor = useMemo(() => {
    if (lockedZoneScope) {
      return services.filter((s) =>
        serviceMatchesGridZoneScope(s, lockedZoneScope)
      );
    }
    return services;
  }, [services, lockedZoneScope]);

  return (
    <>
      {showBranchGridHint ? (
        <p className='text-muted-foreground mb-4 text-sm'>
          {t('grid_configuration.zone_scope_hint')}
        </p>
      ) : null}
      <SimpleGrid
        key={lockedZoneScope ? `zone-lock-${lockedZoneScope}` : 'zone-all'}
        services={servicesForGridEditor}
        onAddService={onAddService}
        onPropertyChange={onPropertyChange}
        onGridSpanCommit={onGridSpanCommit}
        onPositionChange={onPositionChange}
        dragPaletteLabel={t('grid_configuration.drag_from_palette_hint')}
        dragPlacedLabel={t('grid_configuration.drag_placed_hint')}
        resizeLabel={t('grid_configuration.resize_corner_hint')}
        zoneNameById={zoneNameById}
      />
    </>
  );
};

const ServiceGridEditor: React.FC<ServiceGridEditorProps> = ({
  unitId,
  servicesTreeUnitId,
  lockedServiceZoneId
}) => {
  const t = useTranslations('admin');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    unitId || null
  );
  const [services, setServices] = useState<ServiceWithPosition[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [, setIsLoading] = useState(!!(unitId || selectedUnitId));

  const updateServiceMutation = useUpdateService();

  const activeUnitId = unitId ?? selectedUnitId;

  const { data: gridContextUnit } = useQuery({
    queryKey: ['unit', activeUnitId],
    queryFn: () => unitsApi.getById(activeUnitId!),
    enabled: !!activeUnitId
  });

  const resolvedTreeFetchId = useMemo(() => {
    if (servicesTreeUnitId) return servicesTreeUnitId;
    if (!activeUnitId || !gridContextUnit) return null;
    if (gridContextUnit.kind === 'service_zone' && gridContextUnit.parentId) {
      return gridContextUnit.parentId;
    }
    return activeUnitId;
  }, [servicesTreeUnitId, activeUnitId, gridContextUnit]);

  const effectiveLockedZoneId =
    lockedServiceZoneId ??
    (gridContextUnit?.kind === 'service_zone' ? gridContextUnit.id : undefined);

  const zoneLabelsParentId = useMemo(() => {
    if (gridContextUnit?.kind === 'subdivision') return gridContextUnit.id;
    if (gridContextUnit?.kind === 'service_zone' && gridContextUnit.parentId) {
      return gridContextUnit.parentId;
    }
    return null;
  }, [gridContextUnit]);

  const { data: zoneLabelChildUnits = [] } = useQuery({
    queryKey: ['units', zoneLabelsParentId, 'child-units'],
    queryFn: () => unitsApi.getChildUnits(zoneLabelsParentId!),
    enabled: !!zoneLabelsParentId
  });

  const zoneNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of zoneLabelChildUnits) {
      if (u.kind === 'service_zone') {
        m.set(u.id, u.name);
      }
    }
    return m;
  }, [zoneLabelChildUnits]);

  const servicesTreeFetchSeqRef = useRef(0);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!unitId) {
      const fetchUnits = async () => {
        try {
          const unitsData = await unitsApi.getAll();
          setUnits(unitsData);
        } catch (error) {
          console.error('Error fetching units:', error);
        }
      };
      fetchUnits();
    }
  }, [unitId]);

  useEffect(() => {
    let effectAlive = true;
    const controller = new AbortController();
    const id = resolvedTreeFetchId;
    if (!id) {
      startTransition(() => setIsLoading(false));
      return () => {
        effectAlive = false;
        controller.abort();
      };
    }

    const seq = ++servicesTreeFetchSeqRef.current;
    startTransition(() => setIsLoading(true));

    unitsApi
      .getServicesTree(id, { signal: controller.signal })
      .then((servicesTree) => {
        if (!effectAlive || seq !== servicesTreeFetchSeqRef.current) {
          return;
        }
        const flattenedServices: ServiceWithPosition[] = [];
        const flattenTree = (services: Service[], level = 0) => {
          services.forEach((service) => {
            flattenedServices.push({
              ...service,
              gridRow:
                service.gridRow !== undefined && service.gridRow !== null
                  ? Number(service.gridRow)
                  : null,
              gridCol:
                service.gridCol !== undefined && service.gridCol !== null
                  ? Number(service.gridCol)
                  : null,
              gridRowSpan:
                service.gridRowSpan !== undefined &&
                service.gridRowSpan !== null
                  ? Number(service.gridRowSpan)
                  : 1,
              gridColSpan:
                service.gridColSpan !== undefined &&
                service.gridColSpan !== null
                  ? Number(service.gridColSpan)
                  : 1,
              children: service.children || [],
              t: tRef.current
            });
            if (service.children && service.children.length > 0) {
              flattenTree(service.children, level + 1);
            }
          });
        };
        flattenTree(servicesTree);
        setServices(flattenedServices);
      })
      .catch((error: unknown) => {
        if (!effectAlive || seq !== servicesTreeFetchSeqRef.current) {
          return;
        }
        if (isRequestAbortError(error)) {
          return;
        }
        logger.error('Error loading services:', error);
      })
      .finally(() => {
        if (!effectAlive || seq !== servicesTreeFetchSeqRef.current) {
          return;
        }
        startTransition(() => setIsLoading(false));
      });

    return () => {
      effectAlive = false;
      controller.abort();
    };
  }, [resolvedTreeFetchId]);

  const handleUnitSelect = (id: string) => {
    setSelectedUnitId(id);
    setIsLoading(true);
  };

  const handleAddService = (service: ServiceWithPosition) => {
    const updatedServices = services.map((s) =>
      s.id === service.id
        ? { ...s, gridRow: service.gridRow, gridCol: service.gridCol }
        : s
    );

    setServices(updatedServices);

    if (service.gridRow !== null && service.gridCol !== null && activeUnitId) {
      updateServiceMutation.mutate({
        id: service.id,
        gridRow: service.gridRow,
        gridCol: service.gridCol,
        gridRowSpan: service.gridRowSpan || 1,
        gridColSpan: service.gridColSpan || 1
      });
    }
  };

  const handlePropertyChange = (
    id: string,
    field: string,
    value: number | null
  ) => {
    const updatedServices = services.map((service) => {
      if (service.id === id) {
        switch (field) {
          case 'gridPositionClear':
            return {
              ...service,
              gridRow: null,
              gridCol: null,
              gridRowSpan: 1,
              gridColSpan: 1
            };
          case 'gridRow':
            return { ...service, gridRow: value };
          case 'gridCol':
            return { ...service, gridCol: value };
          case 'gridRowSpan':
            return value !== null
              ? { ...service, gridRowSpan: value }
              : service;
          case 'gridColSpan':
            return value !== null
              ? { ...service, gridColSpan: value }
              : service;
          default:
            return service;
        }
      }
      return service;
    });

    const updatedService = updatedServices.find((s) => s.id === id);

    if (!updatedService || !activeUnitId) {
      setServices(updatedServices);
      return;
    }

    const isRemovalOperation =
      updatedService.gridRow === null || updatedService.gridCol === null;

    if (!isRemovalOperation) {
      setServices(updatedServices);
      updateServiceMutation.mutate({
        id: updatedService.id,
        gridRow: updatedService.gridRow,
        gridCol: updatedService.gridCol,
        gridRowSpan: updatedService.gridRowSpan || 1,
        gridColSpan: updatedService.gridColSpan || 1
      });
      return;
    }

    const previousServices = services;
    const optimistic = updatedServices.map((s) =>
      s.id === id
        ? { ...s, gridRow: null, gridCol: null, gridRowSpan: 1, gridColSpan: 1 }
        : s
    );
    setServices(optimistic);

    void (async () => {
      try {
        await updateServiceMutation.mutateAsync({
          id: updatedService.id,
          gridRow: null,
          gridCol: null,
          gridRowSpan: 1,
          gridColSpan: 1
        });
      } catch (err) {
        console.error('remove service from grid:', err);
        setServices((prev) =>
          prev.map((s) => {
            if (s.id !== id) return s;
            const orig = previousServices.find((p) => p.id === id);
            return orig ? { ...s, ...orig } : s;
          })
        );
        toast.error(
          t('grid_configuration.remove_from_grid_error', {
            defaultValue:
              'Could not remove the service from the grid. Changes were reverted.'
          })
        );
      }
    })();
  };

  const handleGridSpanCommit = (
    id: string,
    gridColSpan: number,
    gridRowSpan: number
  ) => {
    const updatedServices = services.map((service) =>
      service.id === id ? { ...service, gridColSpan, gridRowSpan } : service
    );
    const updatedService = updatedServices.find((s) => s.id === id);
    setServices(updatedServices);

    if (
      updatedService &&
      activeUnitId &&
      updatedService.gridRow !== null &&
      updatedService.gridCol !== null
    ) {
      updateServiceMutation.mutate({
        id: updatedService.id,
        gridRow: updatedService.gridRow,
        gridCol: updatedService.gridCol,
        gridRowSpan,
        gridColSpan
      });
    }
  };

  const handlePositionChange = (id: string, row: number, col: number) => {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;
    const rs = svc.gridRowSpan || 1;
    const cs = svc.gridColSpan || 1;
    const { row: r, col: c } = clampGridOrigin(row, col, rs, cs);

    const updatedServices = services.map((service) => {
      if (service.id === id) {
        return { ...service, gridRow: r, gridCol: c };
      }
      return service;
    });

    setServices(updatedServices);

    const updatedService = updatedServices.find((s) => s.id === id);
    if (updatedService && activeUnitId) {
      updateServiceMutation.mutate({
        id: updatedService.id,
        gridRow: updatedService.gridRow,
        gridCol: updatedService.gridCol,
        gridRowSpan: updatedService.gridRowSpan || 1,
        gridColSpan: updatedService.gridColSpan || 1
      });
    }
  };

  return (
    <div className='grid grid-cols-12 gap-6'>
      {!unitId && (
        <div className='col-span-3'>
          <UnitList
            units={units}
            selectedUnitId={selectedUnitId}
            onSelect={handleUnitSelect}
            t={t}
          />
        </div>
      )}

      <div className={unitId ? 'col-span-12' : 'col-span-9'}>
        <Card>
          <CardContent className='p-6'>
            {activeUnitId ? (
              <ServiceGridWorkArea
                key={`${resolvedTreeFetchId ?? 'pending'}-${effectiveLockedZoneId ?? 'open'}`}
                services={services}
                lockedZoneScope={effectiveLockedZoneId}
                showBranchGridHint={
                  gridContextUnit?.kind === 'subdivision' &&
                  !effectiveLockedZoneId
                }
                zoneNameById={zoneNameById}
                t={t}
                onAddService={handleAddService}
                onPropertyChange={handlePropertyChange}
                onGridSpanCommit={handleGridSpanCommit}
                onPositionChange={handlePositionChange}
              />
            ) : (
              <NoUnitSelected t={t} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ServiceGridEditor;
