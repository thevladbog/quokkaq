'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Unit, ScreenWidgetType } from '@quokkaq/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateUnit } from '@/lib/hooks';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { toast } from 'sonner';
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { ensureTenantScreenTemplateId } from '@/lib/screen-template-tenant-id';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { screenBuilderDndModifiers } from './builder/screen-builder-snap';
import {
  parseLibraryId,
  parseCanvasCellId,
  parseCanvasWidgetId
} from './builder/screen-dnd-ids';
import { BuilderToolbar } from './builder/builder-toolbar';
import { BuilderWidgetLibraryPanel } from './builder/widget-library-panel';
import { BuilderCanvas } from './builder/builder-canvas';
import { BuilderPropertiesPanel } from './builder/builder-properties-panel';
import { BuilderScreenDraftPreview } from './builder/builder-screen-draft-preview';
import { BuilderCanvasPreviewSplit } from './builder/builder-canvas-preview-split';
import { useScreenBuilderKeyboard } from './builder/use-screen-builder-keyboard';
import { motion } from 'framer-motion';
import { BuilderWidgetPreview } from './builder/widget-preview';

type Props = {
  unit: Unit;
  unitId: string;
  canEdit: boolean;
  /**
   * When true (e.g. layout editor sheet), changes stay in the builder store only —
   * use the unit «Layout» tab to apply to the device, or save to the library from the sheet header.
   */
  draftOnly?: boolean;
};

export function ScreenVisualBuilder({
  unit,
  unitId,
  canEdit,
  draftOnly = false
}: Props) {
  const t = useTranslations('admin.signage');
  const st = useTranslations('admin.screenBuilder');
  const qc = useQueryClient();
  const updateUnit = useUpdateUnit();
  const [showPreview, setShowPreview] = useState(false);
  const [a11yDnd, setA11yDnd] = useState('');
  const [activeDrag, setActiveDrag] = useState<{
    from: 'library' | 'widget';
    type?: ScreenWidgetType;
    widgetId?: string;
  } | null>(null);
  useEffect(() => {
    if (!a11yDnd) {
      return;
    }
    const t = setTimeout(() => {
      setA11yDnd('');
    }, 2000);
    return () => {
      clearTimeout(t);
    };
  }, [a11yDnd]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const template = useScreenBuilderStore((s) => s.template);
  const editOrientation = useScreenBuilderStore((s) => s.editOrientation);
  const addWidget = useScreenBuilderStore((s) => s.addWidget);
  const setWidgetPlacement = useScreenBuilderStore((s) => s.setWidgetPlacement);
  const isDirty = useScreenBuilderStore((s) => s.isDirty);
  const markSaved = useScreenBuilderStore((s) => s.markSaved);
  const removeWidget = useScreenBuilderStore((s) => s.removeWidget);
  const duplicateWidget = useScreenBuilderStore((s) => s.duplicateWidget);
  const selection = useScreenBuilderStore((s) => s.selection);
  const setSelection = useScreenBuilderStore((s) => s.setSelection);
  const setZoom = useScreenBuilderStore((s) => s.setZoom);
  const selectedWidget = selection.kind === 'widget' ? selection.id : null;

  const onDragOver = useCallback(() => {}, []);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const announce = (msg: string) => {
      setA11yDnd(msg);
    };
    const { active, over } = e;
    if (!over) {
      announce(st('a11y.noTarget', { default: 'No drop target' }));
      return;
    }
    const aId = String(active.id);
    const oId = String(over.id);
    if (aId === oId) {
      return;
    }

    const fromLib = parseLibraryId(aId);
    const fromCanvas = parseCanvasWidgetId(aId);
    const dropCell = parseCanvasCellId(oId);

    if (fromLib) {
      if (dropCell) {
        addWidget(fromLib.type, {
          col: dropCell.col,
          row: dropCell.row
        });
        announce(st('a11y.dropped', { default: 'Widget placed' }));
        return;
      }
      if (oId === 'builder-canvas-drop') {
        addWidget(fromLib.type);
        announce(st('a11y.dropped', { default: 'Widget placed' }));
        return;
      }
      announce(st('a11y.noTarget', { default: 'No drop target' }));
      return;
    }

    if (fromCanvas && dropCell) {
      const face = useScreenBuilderStore.getState().editOrientation;
      const f = useScreenBuilderStore.getState().template[face];
      const w = f.widgets.find((x) => x.id === fromCanvas.widgetId);
      if (w) {
        const { colSpan, rowSpan } = w.placement;
        const col = Math.max(
          1,
          Math.min(dropCell.col, f.columns - colSpan + 1)
        );
        const row = Math.max(1, Math.min(dropCell.row, f.rows - rowSpan + 1));
        if (w.placement.col === col && w.placement.row === row) {
          return;
        }
        setWidgetPlacement(
          fromCanvas.widgetId,
          { col, row, colSpan, rowSpan },
          face
        );
        announce(st('a11y.widgetMoved', { default: 'Widget moved' }));
      } else {
        announce(st('a11y.noTarget', { default: 'No drop target' }));
      }
      return;
    }

    if (fromCanvas) {
      announce(
        st('a11y.dragWidgetCanvasNoCell', {
          default: 'Drop the block on an empty grid cell'
        })
      );
      return;
    }

    announce(
      st('a11y.dragWidgetPending', {
        default: 'Use properties to adjust grid placement'
      })
    );
  };
  const onSave = useCallback(() => {
    if (!canEdit || draftOnly) {
      return;
    }
    const tpl = ensureTenantScreenTemplateId(
      useScreenBuilderStore.getState().template
    );
    const v = safeParseSignageWithToast(
      'Screen template',
      signageZod.screenTemplate,
      tpl
    );
    if (!v.success) {
      return;
    }
    const current = (
      unit.config && typeof unit.config === 'object'
        ? (unit.config as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;
    updateUnit.mutate(
      {
        id: unitId,
        config: {
          ...current,
          screenTemplate: v.data
        }
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({
            queryKey: getGetUnitByIDQueryKey(unitId)
          });
          markSaved(v.data);
          toast.success(t('saved', { default: 'Saved' }));
          setA11yDnd(st('a11y.saved', { default: 'Layout saved' }));
        }
      }
    );
  }, [
    canEdit,
    draftOnly,
    markSaved,
    qc,
    setA11yDnd,
    st,
    t,
    unit,
    unitId,
    updateUnit
  ]);
  useScreenBuilderKeyboard({
    enabled: canEdit,
    onSave,
    onDeleteWidget: (id) => {
      if (id) {
        void removeWidget(id);
      } else {
        if (selectedWidget) {
          void removeWidget(selectedWidget);
        }
      }
    },
    onDuplicate: () => {
      if (selectedWidget) {
        void duplicateWidget(selectedWidget);
      }
    },
    onNudge: (dx, dy) => {
      if (selectedWidget) {
        const n = useScreenBuilderStore.getState().nudgePosition;
        n(selectedWidget, dx, dy);
      }
    },
    onZoomIn: () => {
      setZoom(useScreenBuilderStore.getState().zoom * 1.1);
    },
    onZoomOut: () => {
      setZoom(useScreenBuilderStore.getState().zoom * 0.9);
    },
    onSelectNone: () => {
      setSelection({ kind: 'none' });
    }
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={screenBuilderDndModifiers}
      onDragStart={({ active }) => {
        setA11yDnd(st('a11y.dragging', { default: 'Dragging layout item' }));
        const p = parseLibraryId(String(active.id));
        if (p) {
          setActiveDrag({ from: 'library', type: p.type });
        } else {
          setActiveDrag({ from: 'widget', widgetId: String(active.id) });
        }
      }}
      onDragCancel={() => {
        setActiveDrag(null);
        setA11yDnd(st('a11y.cancelled', { default: 'Drag cancelled' }));
      }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className='min-w-0 space-y-3'>
        <div className='sr-only' role='status' aria-live='polite'>
          {a11yDnd}
        </div>
        <BuilderToolbar
          canSave={canEdit}
          isSaving={draftOnly ? false : updateUnit.isPending}
          onSave={onSave}
          showApplyToUnit={!draftOnly}
          showPreview={showPreview}
          onTogglePreview={() => {
            setShowPreview((p) => !p);
          }}
          showPresetPicker={false}
          sourcePresetId={null}
          onLoadPreset={() => {}}
        />
        <div className='grid w-full min-w-0 grid-cols-1 gap-3 min-[1000px]:[grid-template-columns:minmax(10.5rem,12.5rem)_minmax(0,1fr)] min-[1000px]:[grid-template-rows:1fr] min-[1000px]:[align-items:stretch] min-[1200px]:[grid-template-columns:minmax(10.5rem,12.5rem)_minmax(0,1fr)_minmax(15rem,17rem)] sm:min-h-[28rem]'>
          <div className='[grid-row:2] w-full min-w-0 min-[1000px]:[grid-row:1]'>
            <BuilderWidgetLibraryPanel />
          </div>
          <div
            className='w-full min-w-0 min-[1000px]:[grid-row:1] min-[1000px]:[grid-col:2] min-[1200px]:col-start-2'
            role='presentation'
          >
            <BuilderCanvasPreviewSplit
              showPreview={showPreview}
              canvas={<BuilderCanvas canEdit={canEdit} />}
              belowCanvas={
                isDirty ? (
                  <div className='mt-2 flex items-center gap-2'>
                    <span
                      className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                      aria-live='polite'
                    >
                      {draftOnly
                        ? st('draftSheetHint', {
                            default:
                              'Unsaved draft — save to the library from the header, or use «Apply layout» on the unit Layout tab.'
                          })
                        : st('draft', { default: 'Unsaved changes' })}
                    </span>
                  </div>
                ) : null
              }
              preview={
                <motion.div
                  className='w-full min-w-0'
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <BuilderScreenDraftPreview unitId={unitId} />
                </motion.div>
              }
            />
          </div>
          <div
            className='[grid-row:3] min-h-[6rem] w-full min-w-0 min-[1200px]:col-start-3 min-[1200px]:row-start-1 min-[1200px]:min-h-0'
            role='complementary'
            aria-label={st('props.title', { default: 'Properties' })}
          >
            <BuilderPropertiesPanel unitId={unitId} canEdit={canEdit} />
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeDrag?.from === 'library' && activeDrag.type ? (
          <div className='border-primary/20 bg-background/95 max-w-56 rounded border p-1 shadow-2xl ring-1'>
            <BuilderWidgetPreview
              widget={{
                id: '…',
                type: activeDrag.type!
              }}
            />
          </div>
        ) : activeDrag?.from === 'widget' && activeDrag.widgetId ? (
          <div className='w-64 rounded border-2 border-dashed p-0.5 opacity-90 ring-1'>
            {(() => {
              const w = template[editOrientation].widgets.find(
                (q) => q.id === activeDrag.widgetId!
              );
              return w ? <BuilderWidgetPreview widget={w} /> : null;
            })()}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
