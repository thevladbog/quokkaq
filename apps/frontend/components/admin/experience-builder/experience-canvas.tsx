'use client';

import type {
  ExperienceLayoutVariant,
  ExperiencePage
} from '@quokkaq/shared-types';
import { useDroppable } from '@dnd-kit/core';
import { Lock, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  BuilderCanvasGrid,
  type BuilderCanvasGridItem
} from '@/components/admin/units/signage/builder/builder-canvas';
import {
  canPlacePlacement,
  type GridItem,
  type GridPlacement
} from '@/lib/screen-grid-editor';
import { cn } from '@/lib/utils';
import { experienceWidgetTitle } from './experience-widget-catalog';
import {
  editorLayerKey,
  type ExperienceEditorLayerState
} from './experience-layers-panel';

type CanvasItem = BuilderCanvasGridItem & {
  title: string;
  locked: boolean;
  hidden: boolean;
  stackIndex: number;
};

export const EXPERIENCE_TRAY_DRAG_PREFIX = 'experience-tray-widget:';
export const EXPERIENCE_CELL_DROP_PREFIX = 'experience-canvas-cell:';

export function experienceTrayDragId(widgetId: string): string {
  return `${EXPERIENCE_TRAY_DRAG_PREFIX}${widgetId}`;
}

export function experienceCellDropId(col: number, row: number): string {
  return `${EXPERIENCE_CELL_DROP_PREFIX}${col}:${row}`;
}

export function parseExperienceDropTarget(
  id: string
): { col: number; row: number } | null {
  if (!id.startsWith(EXPERIENCE_CELL_DROP_PREFIX)) return null;
  const [col, row, ...extra] = id
    .slice(EXPERIENCE_CELL_DROP_PREFIX.length)
    .split(':')
    .map(Number);
  return extra.length === 0 && Number.isInteger(col) && Number.isInteger(row)
    ? { col, row }
    : null;
}

function ExperienceCanvasCell({
  col,
  row,
  canPlace,
  ariaLabel,
  onPlace
}: {
  col: number;
  row: number;
  canPlace: boolean;
  ariaLabel: string;
  onPlace?: (col: number, row: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: experienceCellDropId(col, row),
    disabled: !canPlace,
    data: { kind: 'experience-canvas-cell', col, row }
  });
  return (
    <button
      ref={setNodeRef}
      type='button'
      tabIndex={canPlace ? 0 : -1}
      aria-label={ariaLabel}
      onClick={() => {
        if (canPlace) onPlace?.(col, row);
      }}
      className={cn(
        'border-border/70 bg-muted/30 z-0 block h-full min-h-0 w-full min-w-0 border outline-none',
        canPlace &&
          'focus-visible:ring-ring cursor-cell focus-visible:ring-2 focus-visible:ring-inset',
        isOver && 'bg-primary/20 ring-primary/60 ring-1'
      )}
      style={{ gridColumn: col, gridRow: row }}
    />
  );
}

export function validCanvasItems(
  page: ExperiencePage,
  variant: ExperienceLayoutVariant,
  editorState: ExperienceEditorLayerState,
  translate?: Parameters<typeof experienceWidgetTitle>[1],
  orderedWidgetIds?: readonly string[]
): CanvasItem[] {
  const layout = page.layouts[variant.id];
  if (!layout) return [];
  const placed: GridItem[] = [];
  const valid: CanvasItem[] = [];
  const knownIds = new Set(orderedWidgetIds ?? []);
  const widgets = [
    ...(orderedWidgetIds ?? [])
      .map((widgetId) => page.widgets.find((widget) => widget.id === widgetId))
      .filter((widget): widget is ExperiencePage['widgets'][number] =>
        Boolean(widget)
      ),
    ...page.widgets.filter((widget) => !knownIds.has(widget.id))
  ];
  for (const widget of widgets) {
    const placement = layout.placements[widget.id];
    if (
      !placement ||
      !canPlacePlacement(
        variant.grid.columns,
        variant.grid.rows,
        placed,
        placement
      )
    ) {
      continue;
    }
    placed.push({ id: widget.id, placement });
    const metadata = editorState[editorLayerKey(page.id, widget.id)] ?? {};
    valid.push({
      id: widget.id,
      placement,
      title: experienceWidgetTitle(widget, translate),
      locked: Boolean(metadata.locked),
      hidden: Boolean(metadata.hidden),
      stackIndex: 0
    });
  }
  return valid.map((item, index) => ({
    ...item,
    stackIndex: valid.length - index
  }));
}

export type ExperienceCanvasProps = {
  page: ExperiencePage;
  variant: ExperienceLayoutVariant;
  selectedWidgetId?: string;
  canEdit: boolean;
  zoom: number;
  editorState: ExperienceEditorLayerState;
  orderedWidgetIds?: readonly string[];
  pendingPlacement?: { id: string; title: string };
  onSelectWidget: (widgetId: string) => void;
  onPlacementChange: (widgetId: string, placement: GridPlacement) => void;
  onPlacePendingAt?: (widgetId: string, col: number, row: number) => void;
};

export function ExperienceCanvas({
  page,
  variant,
  selectedWidgetId,
  canEdit,
  zoom,
  editorState,
  orderedWidgetIds,
  pendingPlacement,
  onSelectWidget,
  onPlacementChange,
  onPlacePendingAt
}: ExperienceCanvasProps) {
  const t = useTranslations('experience.builder');
  const items = validCanvasItems(
    page,
    variant,
    editorState,
    (entry) => t(entry.labelKey, { default: entry.label }),
    orderedWidgetIds
  );
  const visibleItems = items.filter((item) => !item.hidden);
  const canPlacePending = Boolean(pendingPlacement) && canEdit;
  return (
    <BuilderCanvasGrid
      face={variant.id}
      grid={variant.grid}
      items={visibleItems}
      selectionId={selectedWidgetId}
      canEdit={canEdit}
      zoom={zoom}
      minimumInteractiveCellSize={canPlacePending ? 44 : undefined}
      safeArea={variant.profile.safeArea}
      deviceSize={{
        width: variant.profile.width,
        height: variant.profile.height
      }}
      ariaLabel={t('canvas.label', { default: 'Experience layout canvas' })}
      containerClassName='min-h-[430px] flex-1 rounded-xl border border-border/70 bg-muted/35 p-5'
      onSelect={onSelectWidget}
      onPlacementChange={canEdit ? onPlacementChange : undefined}
      renderCell={({ col, row }) => (
        <ExperienceCanvasCell
          col={col}
          row={row}
          canPlace={canPlacePending}
          ariaLabel={
            pendingPlacement
              ? t('canvas.placeInCell', {
                  title: pendingPlacement.title,
                  col,
                  row,
                  default: `Place ${pendingPlacement.title} in column ${col}, row ${row}`
                })
              : t('canvas.cell', {
                  col,
                  row,
                  default: `Column ${col}, row ${row}`
                })
          }
          onPlace={
            canPlacePending && pendingPlacement
              ? (targetCol, targetRow) =>
                  onPlacePendingAt?.(pendingPlacement.id, targetCol, targetRow)
              : undefined
          }
        />
      )}
      renderItem={({ item, selected, onSelect, onPlacementChange }) => (
        <button
          key={item.id}
          data-testid='experience-canvas-widget'
          data-widget-id={item.id}
          type='button'
          onClick={onSelect}
          onKeyDown={(event) => {
            if (!canEdit || item.locked || !selected || !onPlacementChange) {
              return;
            }
            const delta =
              event.key === 'ArrowLeft'
                ? { col: -1, row: 0 }
                : event.key === 'ArrowRight'
                  ? { col: 1, row: 0 }
                  : event.key === 'ArrowUp'
                    ? { col: 0, row: -1 }
                    : event.key === 'ArrowDown'
                      ? { col: 0, row: 1 }
                      : undefined;
            if (!delta) return;
            event.preventDefault();
            onPlacementChange({
              ...item.placement,
              col: item.placement.col + delta.col,
              row: item.placement.row + delta.row
            });
          }}
          className={cn(
            'bg-card relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-md border p-2 text-left shadow-sm outline-none',
            'focus-visible:ring-ring focus-visible:ring-2',
            selected
              ? 'border-primary ring-primary/40 ring-2'
              : 'border-border hover:border-primary/50',
            item.locked && 'cursor-not-allowed'
          )}
          style={{
            gridColumn: `${item.placement.col} / span ${item.placement.colSpan}`,
            gridRow: `${item.placement.row} / span ${item.placement.rowSpan}`,
            zIndex: item.stackIndex
          }}
          aria-pressed={selected}
          aria-label={item.title}
          aria-disabled={item.locked || !canEdit}
        >
          <span className='truncate text-[11px] font-semibold'>
            {item.title}
          </span>
          <span className='text-muted-foreground flex items-center gap-1 text-[10px]'>
            {item.locked ? (
              <Lock
                className='size-3'
                aria-label={t('layers.locked', { default: 'Locked' })}
              />
            ) : null}
            {item.hidden ? (
              <TriangleAlert
                className='size-3'
                aria-label={t('layers.hidden', { default: 'Hidden in editor' })}
              />
            ) : null}
            {item.placement.col} · {item.placement.row}
          </span>
        </button>
      )}
    />
  );
}
