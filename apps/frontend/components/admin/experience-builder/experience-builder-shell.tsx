'use client';

import {
  validateExperienceForPublish,
  type ExperienceTemplate,
  type ExperienceWidget
} from '@quokkaq/shared-types';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import { ArrowLeft, Layers3, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { BuilderCanvasExternalScrollBoundary } from '@/components/admin/units/signage/builder/builder-canvas';
import { isApiHttpError } from '@/lib/api-errors';
import type { ExperienceDefinitionParseResult } from '@/lib/experience/experience-api';
import { useExperienceBuilderStore } from '@/lib/stores/experience-builder-store';
import {
  ExperienceCanvas,
  EXPERIENCE_TRAY_DRAG_PREFIX,
  parseExperienceDropTarget
} from './experience-canvas';
import { ExperienceSidePanel } from './experience-side-panel';
import { ExperienceToolbar } from './experience-toolbar';
import {
  editorLayerKey,
  type ExperienceEditorLayerState
} from './experience-layers-panel';
import {
  UnplacedWidgetsTray,
  collectUnplacedWidgets
} from './unplaced-widgets-tray';
import { ExperienceInspector } from './experience-inspector';
import {
  definitionsEqual,
  ExperiencePreviewDialog,
  type ExperiencePreviewDialogProps
} from './experience-preview-dialog';
import {
  ExperienceOperationFeedback,
  PublishExperienceDialog,
  type ExperienceOperationError,
  type ExperienceOperationResult,
  type PublishExperienceDialogProps
} from './publish-experience-dialog';

type SaveDraftResult = void | ExperienceDefinitionParseResult;

export type ExperienceBuilderShellProps = {
  canEdit?: boolean;
  onBack?: () => void;
  onPreview?: (draft: ExperienceTemplate) => void;
  onSaveDraft?: (
    draft: ExperienceTemplate
  ) => SaveDraftResult | Promise<SaveDraftResult>;
  onPublish?: (
    draft: ExperienceTemplate
  ) => ExperienceOperationResult | Promise<ExperienceOperationResult>;
  onRestoreVersion?: PublishExperienceDialogProps['onRestoreVersion'];
  renderPreview?: ExperiencePreviewDialogProps['renderPreview'];
  publishedDefinition?: ExperienceTemplate | null;
  currentPublishedVersion?: number | null;
  unpublishedChanges?: boolean;
  devices?: PublishExperienceDialogProps['devices'];
  versions?: PublishExperienceDialogProps['versions'];
  publishError?: ExperienceOperationError | null;
  restoreError?: ExperienceOperationError | null;
  /** Unit-specific service settings route, supplied by the builder host. */
  serviceSettingsHref?: string;
};

function surfaceName(
  surface: ExperienceTemplate['surface'],
  translate: (
    key: string,
    values?: Record<string, string | number | Date>
  ) => string
): string {
  const values = {
    'ticket-station': {
      key: 'shell.surfaces.ticketStation',
      fallback: 'Ticket station'
    },
    'queue-display': {
      key: 'shell.surfaces.queueDisplay',
      fallback: 'Queue display'
    },
    'counter-display': {
      key: 'shell.surfaces.counterDisplay',
      fallback: 'Counter display'
    },
    'visitor-mobile': {
      key: 'shell.surfaces.visitorMobile',
      fallback: 'Visitor mobile'
    }
  } as const;
  const item = values[surface];
  return item ? translate(item.key, { default: item.fallback }) : surface;
}

function stableWidgetOrder(
  pageId: string,
  widgets: readonly ExperienceWidget[],
  order: Record<string, string[]>
): string[] {
  const current = order[pageId] ?? [];
  const known = current.filter((id) =>
    widgets.some((widget) => widget.id === id)
  );
  return [
    ...known,
    ...widgets.map((widget) => widget.id).filter((id) => !known.includes(id))
  ];
}

export function ExperienceBuilderShell({
  canEdit = true,
  onBack,
  onPreview,
  onSaveDraft,
  onPublish,
  onRestoreVersion,
  renderPreview,
  publishedDefinition = null,
  currentPublishedVersion,
  unpublishedChanges,
  devices,
  versions,
  publishError = null,
  restoreError = null,
  serviceSettingsHref
}: ExperienceBuilderShellProps) {
  const t = useTranslations('experience.builder');
  const draft = useExperienceBuilderStore((state) => state.draft);
  const activePageId = useExperienceBuilderStore((state) => state.activePageId);
  const activeVariantId = useExperienceBuilderStore(
    (state) => state.activeVariantId
  );
  const selection = useExperienceBuilderStore((state) => state.selection);
  const isDirty = useExperienceBuilderStore((state) => state.isDirty);
  const history = useExperienceBuilderStore((state) => state.history);
  const redoStack = useExperienceBuilderStore((state) => state.redoStack);
  const setActivePage = useExperienceBuilderStore(
    (state) => state.setActivePage
  );
  const setActiveVariant = useExperienceBuilderStore(
    (state) => state.setActiveVariant
  );
  const setSelection = useExperienceBuilderStore((state) => state.setSelection);
  const addPage = useExperienceBuilderStore((state) => state.addPage);
  const duplicatePage = useExperienceBuilderStore(
    (state) => state.duplicatePage
  );
  const renamePage = useExperienceBuilderStore((state) => state.renamePage);
  const deletePage = useExperienceBuilderStore((state) => state.deletePage);
  const reorderPage = useExperienceBuilderStore((state) => state.reorderPage);
  const addWidget = useExperienceBuilderStore((state) => state.addWidget);
  const setPlacement = useExperienceBuilderStore((state) => state.setPlacement);
  const setTypographyScale = useExperienceBuilderStore(
    (state) => state.setTypographyScale
  );
  const updateWidgetShared = useExperienceBuilderStore(
    (state) => state.updateWidgetShared
  );
  const copyLayout = useExperienceBuilderStore((state) => state.copyLayout);
  const undo = useExperienceBuilderStore((state) => state.undo);
  const redo = useExperienceBuilderStore((state) => state.redo);
  const markSaved = useExperienceBuilderStore((state) => state.markSaved);

  const [activeTab, setActiveTab] = useState<'pages' | 'add' | 'layers'>(
    'pages'
  );
  const [zoom, setZoom] = useState(0.78);
  const [editorState, setEditorState] = useState<ExperienceEditorLayerState>(
    {}
  );
  const [layerOrder, setLayerOrder] = useState<Record<string, string[]>>({});
  const [pendingPlacementWidgetId, setPendingPlacementWidgetId] = useState<
    string | undefined
  >();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<ExperienceOperationError | null>(
    null
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const page =
    draft.pages.find((candidate) => candidate.id === activePageId) ??
    draft.pages[0]!;
  const variant =
    draft.variants.find((candidate) => candidate.id === activeVariantId) ??
    draft.variants[0]!;
  const selectedWidgetId =
    selection.kind === 'widget' && selection.pageId === page.id
      ? selection.widgetId
      : undefined;
  const selectedWidget = selectedWidgetId
    ? page.widgets.find((widget) => widget.id === selectedWidgetId)
    : undefined;
  const selectedPlacement = selectedWidgetId
    ? page.layouts[variant.id]?.placements[selectedWidgetId]
    : undefined;
  const activeTypographyScale = page.layouts[variant.id]?.typographyScale;
  // Validation is calculated before the publish confirmation opens. The dialog
  // only presents that same report; it never starts an assignment mutation.
  const publishValidation = useMemo(
    () => validateExperienceForPublish(draft),
    [draft]
  );
  const currentLayerOrder = stableWidgetOrder(
    page.id,
    page.widgets,
    layerOrder
  );
  const unplaced = useMemo(
    () =>
      collectUnplacedWidgets(page, variant, (entry) =>
        t(entry.labelKey, { default: entry.label })
      ),
    [page, variant, t]
  );

  const selectPage = (pageId: string) => {
    if (setActivePage(pageId)) setSelection({ kind: 'page', pageId });
  };
  const selectWidget = (widgetId: string) =>
    setSelection({ kind: 'widget', pageId: page.id, widgetId });
  const toggleMetadata = (widgetId: string, field: 'locked' | 'hidden') => {
    if (!canEdit) return;
    const key = editorLayerKey(page.id, widgetId);
    setEditorState((current) => ({
      ...current,
      [key]: { ...current[key], [field]: !current[key]?.[field] }
    }));
  };
  const moveLayer = (widgetId: string, direction: -1 | 1) => {
    if (!canEdit) return;
    const order = stableWidgetOrder(page.id, page.widgets, layerOrder);
    const index = order.indexOf(widgetId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    setLayerOrder((current) => ({ ...current, [page.id]: next }));
  };
  const pendingWidget = pendingPlacementWidgetId
    ? unplaced.find((widget) => widget.id === pendingPlacementWidgetId)
    : undefined;
  const placeWidgetAt = (widgetId: string, col: number, row: number) => {
    if (!canEdit) return;
    if (
      setPlacement(page.id, widgetId, {
        col,
        row,
        colSpan: 1,
        rowSpan: 1
      })
    ) {
      setPendingPlacementWidgetId(undefined);
    }
  };
  const onDragEnd = (event: DragEndEvent) => {
    if (!canEdit) return;
    const activeId = String(event.active.id);
    const target = event.over
      ? parseExperienceDropTarget(String(event.over.id))
      : null;
    if (!activeId.startsWith(EXPERIENCE_TRAY_DRAG_PREFIX) || !target) return;
    const widgetId = activeId.slice(EXPERIENCE_TRAY_DRAG_PREFIX.length);
    placeWidgetAt(widgetId, target.col, target.row);
  };
  const requestRename = (pageId: string) => {
    if (!canEdit) return;
    const current = draft.pages.find((candidate) => candidate.id === pageId);
    if (!current || typeof window === 'undefined') return;
    const next = window.prompt(
      t('pages.renamePrompt', { default: 'Page name' }),
      current.name
    );
    if (next) renamePage(pageId, next);
  };
  const saveDraft = async () => {
    if (!canEdit || !onSaveDraft || savePending) return;
    const submittedDraft = structuredClone(draft);
    setSaveError(null);
    setSavePending(true);
    try {
      const result = await onSaveDraft(submittedDraft);
      if (result?.kind === 'invalid-definition') {
        setSaveError({ kind: 'invalid-definition', issues: result.issues });
        return;
      }
      if (
        definitionsEqual(
          useExperienceBuilderStore.getState().draft,
          submittedDraft
        )
      ) {
        markSaved();
      }
    } catch (error) {
      setSaveError(
        isApiHttpError(error)
          ? {
              kind: 'api-error',
              message: error.message,
              ...(error.code === undefined ? {} : { code: error.code })
            }
          : {
              kind: 'api-error',
              message: t('task11.save.failed', {
                default: 'The draft could not be saved. Try again.'
              })
            }
      );
    } finally {
      setSavePending(false);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <main
        className='bg-muted/20 flex h-[min(900px,calc(100dvh-6rem))] min-h-0 max-w-full min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm'
        aria-label={t('shell.label', { default: 'Experience builder' })}
      >
        <div className='bg-background flex min-h-14 items-center gap-3 border-b px-4'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='min-h-11 min-w-11'
            aria-label={t('shell.back', { default: 'Back' })}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <div className='min-w-0'>
            <div className='flex min-w-0 items-center gap-2'>
              <h1 className='truncate text-sm font-semibold'>{draft.id}</h1>
              <span className='bg-muted rounded px-2 py-0.5 text-xs'>
                {surfaceName(draft.surface, t)}
              </span>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('shell.surfaceLocked', {
                default: 'Surface is fixed for this experience.'
              })}
            </p>
          </div>
        </div>
        <ExperienceToolbar
          variants={draft.variants}
          activeVariantId={variant.id}
          zoom={zoom}
          isDirty={isDirty}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          canEdit={canEdit}
          saveDisabled={savePending || !onSaveDraft}
          publishDisabled={!onPublish}
          onVariantChange={setActiveVariant}
          onZoomChange={(nextZoom) => {
            if (canEdit) setZoom(nextZoom);
          }}
          onUndo={() => {
            if (canEdit) undo();
          }}
          onRedo={() => {
            if (canEdit) redo();
          }}
          onPreview={() => {
            onPreview?.(draft);
            setPreviewOpen(true);
          }}
          onSaveDraft={() => void saveDraft()}
          onPublish={() => {
            if (canEdit && onPublish) setPublishOpen(true);
          }}
        />
        {saveError ? (
          <div className='bg-background border-b px-4 py-3'>
            <ExperienceOperationFeedback error={saveError} />
          </div>
        ) : null}
        <div className='grid min-h-0 flex-1 grid-cols-[minmax(220px,248px)_minmax(360px,1fr)_minmax(220px,264px)]'>
          <ExperienceSidePanel
            template={draft}
            page={page}
            activePageId={page.id}
            selectedWidgetId={selectedWidgetId}
            layerOrder={currentLayerOrder}
            activeTab={activeTab}
            editorState={editorState}
            canEdit={canEdit}
            onTabChange={setActiveTab}
            onSelectPage={selectPage}
            onAddPage={() => {
              if (!canEdit) return;
              addPage();
              setActiveTab('pages');
            }}
            onDuplicatePage={(pageId) => {
              if (canEdit) duplicatePage(pageId);
            }}
            onRenamePage={requestRename}
            onDeletePage={(pageId) => {
              if (canEdit) deletePage(pageId);
            }}
            onMovePage={(pageId, direction) => {
              if (!canEdit) return;
              const index = draft.pages.findIndex(
                (candidate) => candidate.id === pageId
              );
              reorderPage(pageId, index + direction);
            }}
            onAddWidget={(type) => {
              if (canEdit) addWidget(page.id, type);
            }}
            onSelectWidget={selectWidget}
            onMoveLayer={moveLayer}
            onToggleLayerLock={(widgetId) => toggleMetadata(widgetId, 'locked')}
            onToggleLayerHidden={(widgetId) =>
              toggleMetadata(widgetId, 'hidden')
            }
          />
          <section
            className='bg-muted/20 min-w-0 overflow-y-auto p-4'
            aria-label={t('canvas.workspace', { default: 'Device workspace' })}
          >
            <div className='mx-auto flex min-h-full max-w-4xl flex-col'>
              <div className='mb-3 flex flex-wrap items-center gap-2 text-xs'>
                <span className='font-semibold'>{variant.profile.name}</span>
                <span className='text-muted-foreground'>
                  {variant.profile.width}×{variant.profile.height}
                </span>
                <span
                  className={
                    unplaced.length > 0
                      ? 'rounded bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                      : 'rounded bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                  }
                  aria-live='polite'
                >
                  {unplaced.length > 0
                    ? t('canvas.incomplete', {
                        count: unplaced.length,
                        default: `${unplaced.length} unplaced`
                      })
                    : t('canvas.ready', { default: 'Ready' })}
                </span>
                <span className='text-muted-foreground'>
                  {t('canvas.safeArea', {
                    value: variant.profile.safeArea.top,
                    default: `Safe area · ${variant.profile.safeArea.top}px`
                  })}
                </span>
              </div>
              <ExperienceCanvas
                page={page}
                variant={variant}
                selectedWidgetId={selectedWidgetId}
                canEdit={canEdit}
                zoom={zoom}
                editorState={editorState}
                orderedWidgetIds={currentLayerOrder}
                pendingPlacement={
                  pendingWidget
                    ? { id: pendingWidget.id, title: pendingWidget.title }
                    : undefined
                }
                onSelectWidget={selectWidget}
                onPlacementChange={(widgetId, placement) => {
                  if (canEdit) setPlacement(page.id, widgetId, placement);
                }}
                onPlacePendingAt={placeWidgetAt}
              />
              <UnplacedWidgetsTray
                page={page}
                variant={variant}
                variants={draft.variants}
                canEdit={canEdit}
                pendingWidgetId={pendingWidget?.id}
                onPreparePlacement={(widget) => {
                  if (canEdit) setPendingPlacementWidgetId(widget.id);
                }}
                onCopyLayout={(sourceVariantId) => {
                  if (canEdit) {
                    copyLayout(page.id, sourceVariantId, variant.id);
                  }
                }}
              />
            </div>
          </section>
          <aside
            className='bg-card min-h-0 overflow-y-auto border-l'
            aria-label={t('inspector.label', { default: 'Inspector' })}
          >
            <ExperienceInspector
              pageId={page.id}
              widget={selectedWidget}
              variant={variant}
              placement={selectedPlacement}
              typographyScale={activeTypographyScale}
              canEdit={canEdit}
              serviceSettingsHref={serviceSettingsHref}
              onSharedChange={(changes) => {
                if (canEdit && selectedWidget) {
                  updateWidgetShared(page.id, selectedWidget.id, changes);
                }
              }}
              onPlacementChange={(placement) => {
                if (canEdit && selectedWidget) {
                  setPlacement(page.id, selectedWidget.id, placement);
                }
              }}
              onTypographyScaleChange={(scale) => {
                if (canEdit) setTypographyScale(page.id, scale);
              }}
            />
            {unplaced.length > 0 ? (
              <p className='mx-4 mb-4 flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100'>
                <TriangleAlert className='size-4 shrink-0' aria-hidden />
                {t('inspector.unplaced', {
                  default:
                    'Place or copy the remaining widgets before publishing.'
                })}
              </p>
            ) : null}
            <div className='text-muted-foreground mx-4 mb-4 flex items-center gap-2 text-xs'>
              <Layers3 className='size-3.5' aria-hidden />
              {t('inspector.editorOnly', {
                default: 'Layer lock and hide are editor-only.'
              })}
            </div>
          </aside>
        </div>
      </main>
      <ExperiencePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        draft={draft}
        activeVariantId={variant.id}
        publishedDefinition={publishedDefinition}
        renderPreview={
          renderPreview ??
          (({ variant: previewVariant, scale, scaleFactor, showSafeArea }) => (
            <BuilderCanvasExternalScrollBoundary enabled={scale === '100'}>
              <ExperienceCanvas
                page={
                  draft.pages.find(
                    (candidate) => candidate.id === draft.startPageId
                  ) ?? draft.pages[0]!
                }
                variant={previewVariant}
                canEdit={false}
                zoom={scaleFactor / 0.48}
                showSafeArea={showSafeArea}
                editorState={{}}
                onSelectWidget={() => undefined}
                onPlacementChange={() => undefined}
              />
            </BuilderCanvasExternalScrollBoundary>
          ))
        }
      />
      <PublishExperienceDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        draft={draft}
        selectedVariantName={variant.profile.name}
        currentPublishedVersion={currentPublishedVersion}
        unpublishedChanges={unpublishedChanges ?? isDirty}
        validationReport={publishValidation}
        devices={devices}
        versions={versions}
        publishError={publishError}
        restoreError={restoreError}
        disabled={!canEdit}
        onPublish={onPublish}
        onRestoreVersion={onRestoreVersion}
      />
    </DndContext>
  );
}
