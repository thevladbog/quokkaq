'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScreenTemplate, Unit } from '@quokkaq/shared-types';
import { ScreenTemplateSchema } from '@quokkaq/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateUnit } from '@/lib/hooks';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import {
  type HandlersCompanyMeResponse,
  useGetCompaniesMe,
  useGetCompaniesMeScreenLayoutTemplates,
  usePostCompaniesMeScreenLayoutTemplates,
  usePutCompaniesMeScreenLayoutTemplatesTemplateId,
  useDeleteCompaniesMeScreenLayoutTemplatesTemplateId,
  getGetCompaniesMeScreenLayoutTemplatesQueryKey
} from '@/lib/api/generated/auth';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';
import {
  getInitialScreenTemplateFromUnit,
  getTabPresetKeyFromUnit,
  normalizeBuilderPresetId,
  SCREEN_TEMPLATE_PRESET_KEYS
} from '@/lib/screen-template-from-unit';
import { ensureTenantScreenTemplateId } from '@/lib/screen-template-tenant-id';
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { ScreenVisualBuilder } from './screen-visual-builder';

const PRESET_KEYS = SCREEN_TEMPLATE_PRESET_KEYS;

function cloneTemplate<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type LibraryRowLite = { id?: string; name?: string; definition?: unknown };

const EMPTY_LIBRARY_ROWS: LibraryRowLite[] = [];

/** True if this unit template came from / matches the given library row (row PK or definition.id). */
function unitTemplateLinkedToLibraryRow(
  tpl: ScreenTemplate,
  row: LibraryRowLite
): boolean {
  const rid = row.id;
  if (!rid) return false;
  if (tpl.id === rid) return true;
  const d = row.definition
    ? ScreenTemplateSchema.safeParse(row.definition)
    : null;
  return Boolean(d?.success && d.data.id === tpl.id);
}

/** Single picker value: built-in `p:<presetKey>` or library `l:<rowId>` (row primary key). */
function deriveLayoutPick(unit: Unit, libraryRows: LibraryRowLite[]): string {
  const raw = (unit.config as { screenTemplate?: unknown } | null)
    ?.screenTemplate;
  const parsed = raw ? ScreenTemplateSchema.safeParse(raw) : null;
  if (parsed?.success) {
    const tid = parsed.data.id;
    for (const row of libraryRows) {
      const rid = row.id;
      if (!rid) continue;
      if (rid === tid) return `l:${rid}`;
      const d = row.definition
        ? ScreenTemplateSchema.safeParse(row.definition)
        : null;
      if (d && d.success && d.data && d.data.id === tid) return `l:${rid}`;
    }
    if ((PRESET_KEYS as readonly string[]).includes(tid)) {
      return `p:${tid}`;
    }
  }
  return `p:${getTabPresetKeyFromUnit(unit)}`;
}

/**
 * Visual editor init: prefer the picked layout from the selector.
 * - If a preset (`p:…`) is selected → use preset
 * - If a library template (`l:…`) is selected:
 *   • If the unit already runs that same template (by id) → use unit config (latest after Apply)
 *   • Else → use library definition (user wants to preview a different template)
 * - Fallback → use unit config if valid, else default preset
 */
function resolveEditorInit(
  unit: Unit,
  layoutPick: string,
  libraryRows: LibraryRowLite[]
): {
  template: ScreenTemplate;
  sourcePresetId: ReturnType<typeof normalizeBuilderPresetId>;
} {
  const rawUnit = (unit.config as { screenTemplate?: unknown } | null)
    ?.screenTemplate;
  const unitParsed = rawUnit ? ScreenTemplateSchema.safeParse(rawUnit) : null;

  if (layoutPick.startsWith('p:')) {
    const key = layoutPick.slice(2) as keyof typeof SCREEN_TEMPLATE_PRESETS;
    const preset = SCREEN_TEMPLATE_PRESETS[key];
    if (preset) {
      return {
        template: cloneTemplate(preset),
        sourcePresetId: normalizeBuilderPresetId(key)
      };
    }
  }

  if (layoutPick.startsWith('l:')) {
    const rowId = layoutPick.slice(2);
    const row = libraryRows.find((r) => r.id === rowId);
    const parsed = row?.definition
      ? ScreenTemplateSchema.safeParse(row.definition)
      : null;

    if (parsed?.success) {
      const unitRunsThisLibraryTemplate =
        unitParsed?.success && unitParsed.data.id === rowId;

      if (unitRunsThisLibraryTemplate) {
        const { template, sourcePresetId } =
          getInitialScreenTemplateFromUnit(unit);
        return {
          template,
          sourcePresetId: normalizeBuilderPresetId(sourcePresetId)
        };
      }
      const anchored = { ...parsed.data, id: rowId } as ScreenTemplate;
      const tpl = ensureTenantScreenTemplateId(anchored);
      return { template: tpl, sourcePresetId: null };
    }
  }

  const { template, sourcePresetId } = getInitialScreenTemplateFromUnit(unit);
  return {
    template,
    sourcePresetId: normalizeBuilderPresetId(sourcePresetId)
  };
}

export function ScreenTemplateBuilder({
  unit,
  unitId
}: {
  unit: Unit;
  unitId: string;
}) {
  const t = useTranslations('admin.signage');
  const qc = useQueryClient();
  const updateUnit = useUpdateUnit();
  const [editorOpen, setEditorOpen] = useState(false);
  const [layoutPick, setLayoutPick] = useState('p:info-heavy');
  const [saveLibraryOpen, setSaveLibraryOpen] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [deleteLibraryId, setDeleteLibraryId] = useState<string | null>(null);
  const [librarySaveSource, setLibrarySaveSource] = useState<'unit' | 'editor'>(
    'unit'
  );
  const [librarySaveMode, setLibrarySaveMode] = useState<'create' | 'update'>(
    'create'
  );
  const [updateLibraryTemplateId, setUpdateLibraryTemplateId] = useState<
    string | null
  >(null);
  const [editorTitleDraft, setEditorTitleDraft] = useState('');

  const meQ = useGetCompaniesMe();
  const meResolved = meQ.isSuccess && meQ.data?.status === 200;
  const companyMePayload: HandlersCompanyMeResponse | undefined = meResolved
    ? (meQ.data.data as HandlersCompanyMeResponse)
    : undefined;
  const customLayouts =
    companyMePayload?.planCapabilities?.customScreenLayouts === true;
  const libraryActionsEnabled = meResolved && customLayouts;
  const meLoading = meQ.isPending || (meQ.isFetching && !meResolved);

  const listQ = useGetCompaniesMeScreenLayoutTemplates({
    query: { enabled: libraryActionsEnabled }
  });
  const libraryRows = useMemo((): LibraryRowLite[] => {
    if (listQ.isSuccess && listQ.data?.status === 200 && listQ.data.data) {
      return listQ.data.data as LibraryRowLite[];
    }
    return EMPTY_LIBRARY_ROWS;
  }, [listQ.isSuccess, listQ.data]);

  const libraryIdSet = useMemo(
    () => new Set(libraryRows.map((r) => r.id).filter(Boolean) as string[]),
    [libraryRows]
  );

  const defaultLayoutPick = useMemo(
    () => deriveLayoutPick(unit, libraryRows),
    [unit, libraryRows]
  );

  const [prevDefaultLayoutPick, setPrevDefaultLayoutPick] =
    useState(defaultLayoutPick);

  if (prevDefaultLayoutPick !== defaultLayoutPick) {
    setPrevDefaultLayoutPick(defaultLayoutPick);

    setLayoutPick((prev) => {
      if (prev.startsWith('l:')) {
        const id = prev.slice(2);
        if (libraryRows.some((r) => r.id === id)) {
          return prev;
        }
      }
      return defaultLayoutPick;
    });
  }

  const editorSheetTitleBaseline = useMemo(() => {
    if (layoutPick.startsWith('l:')) {
      const id = layoutPick.slice(2);
      const row = libraryRows.find((r) => r.id === id);
      return (row?.name ?? '').trim() || id;
    }
    if (layoutPick.startsWith('p:')) {
      const k = layoutPick.slice(2);
      if (k === 'info-heavy') {
        return t('presetNameInfoHeavy', { default: 'Info + side' });
      }
      if (k === 'media-focus') {
        return t('presetNameMediaFocus', { default: 'Media' });
      }
      return t('presetNameSplit3', { default: '3-way split' });
    }
    return t('layoutEditorTitle', { default: 'Visual screen template' });
  }, [layoutPick, libraryRows, t]);

  const [prevEditorOpen, setPrevEditorOpen] = useState(editorOpen);

  if (prevEditorOpen !== editorOpen) {
    if (editorOpen && !prevEditorOpen) {
      setEditorTitleDraft(editorSheetTitleBaseline);
    }
    setPrevEditorOpen(editorOpen);
  }

  const postLibrary = usePostCompaniesMeScreenLayoutTemplates(
    {
      mutation: {
        onSuccess: async () => {
          await qc.invalidateQueries({
            queryKey: getGetCompaniesMeScreenLayoutTemplatesQueryKey()
          });
        }
      }
    },
    qc
  );

  const putLibrary = usePutCompaniesMeScreenLayoutTemplatesTemplateId(
    {
      mutation: {
        onSuccess: async () => {
          await qc.invalidateQueries({
            queryKey: getGetCompaniesMeScreenLayoutTemplatesQueryKey()
          });
        }
      }
    },
    qc
  );

  const deleteLibrary = useDeleteCompaniesMeScreenLayoutTemplatesTemplateId(
    {
      mutation: {
        onSuccess: async () => {
          await qc.invalidateQueries({
            queryKey: getGetCompaniesMeScreenLayoutTemplatesQueryKey()
          });
        }
      }
    },
    qc
  );

  /** Re-sync draft when the sheet is open and unit / layout selection / library list changes. */
  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const { template, sourcePresetId } = resolveEditorInit(
      unit,
      layoutPick,
      libraryRows
    );
    useScreenBuilderStore.getState().initFrom(template, sourcePresetId);
  }, [editorOpen, unit, layoutPick, libraryRows]);

  const activePresetKey = useMemo((): (typeof PRESET_KEYS)[number] => {
    if (layoutPick.startsWith('p:')) {
      const k = layoutPick.slice(2);
      return (
        k in SCREEN_TEMPLATE_PRESETS ? k : 'info-heavy'
      ) as (typeof PRESET_KEYS)[number];
    }
    return getTabPresetKeyFromUnit(unit);
  }, [layoutPick, unit]);

  const templateForLibrarySave = useMemo(() => {
    const raw = (unit.config as { screenTemplate?: unknown } | null)
      ?.screenTemplate;
    const fromUnit = raw ? ScreenTemplateSchema.safeParse(raw) : null;
    if (fromUnit?.success) {
      return fromUnit.data;
    }
    const preset = SCREEN_TEMPLATE_PRESETS[activePresetKey];
    return preset ? cloneTemplate(preset) : null;
  }, [unit.config, activePresetKey]);

  const unitHasScreenTemplate = useMemo(() => {
    const raw = (unit.config as { screenTemplate?: unknown } | null)
      ?.screenTemplate;
    return Boolean(raw && ScreenTemplateSchema.safeParse(raw).success);
  }, [unit.config]);

  /** Unit’s saved template matches this library row (by row PK or legacy definition.id). */
  const canSaveLibraryUpdateFromUnit = useMemo(() => {
    if (
      !libraryActionsEnabled ||
      !layoutPick.startsWith('l:') ||
      !unitHasScreenTemplate
    ) {
      return false;
    }
    const libId = layoutPick.slice(2);
    if (!libraryIdSet.has(libId)) {
      return false;
    }
    const tpl = templateForLibrarySave;
    const row = libraryRows.find((r) => r.id === libId);
    return Boolean(tpl && row && unitTemplateLinkedToLibraryRow(tpl, row));
  }, [
    libraryActionsEnabled,
    layoutPick,
    libraryIdSet,
    libraryRows,
    templateForLibrarySave,
    unitHasScreenTemplate
  ]);

  const draftTemplate = useScreenBuilderStore((s) => s.template);

  /** Editor draft matches the library row selected in the layout list. */
  const canSaveLibraryUpdateFromEditor = useMemo(() => {
    if (!editorOpen || !libraryActionsEnabled || !layoutPick.startsWith('l:')) {
      return false;
    }
    const libId = layoutPick.slice(2);
    if (!libraryIdSet.has(libId)) {
      return false;
    }
    const row = libraryRows.find((r) => r.id === libId);
    return Boolean(row && unitTemplateLinkedToLibraryRow(draftTemplate, row));
  }, [
    draftTemplate,
    editorOpen,
    libraryActionsEnabled,
    layoutPick,
    libraryIdSet,
    libraryRows
  ]);

  const commitLibraryTemplateName = useCallback(
    async (nameFromField: string) => {
      if (!libraryActionsEnabled || !layoutPick.startsWith('l:')) {
        return;
      }
      const templateId = layoutPick.slice(2);
      const row = libraryRows.find((r) => r.id === templateId);
      if (!row?.definition) {
        return;
      }
      const next = nameFromField.trim();
      const prev = (row.name ?? '').trim();
      if (!next || next === prev) {
        return;
      }
      const defParsed = ScreenTemplateSchema.safeParse(row.definition);
      if (!defParsed.success) {
        toast.error(
          t('libraryInvalid', { default: 'This library entry is not valid.' })
        );
        return;
      }
      try {
        const res = await putLibrary.mutateAsync({
          templateId,
          data: {
            name: next,
            definition: defParsed.data as Record<string, unknown>
          }
        });
        if (res.status !== 200) {
          toast.error(String(res.data));
          return;
        }
        toast.success(
          t('libraryRenamed', { default: 'Template name updated.' })
        );
      } catch (e) {
        toast.error(String(e));
      }
    },
    [libraryActionsEnabled, layoutPick, libraryRows, putLibrary, t]
  );

  const openSaveLibraryDialog = useCallback(
    (source: 'unit' | 'editor') => {
      const libId = layoutPick.startsWith('l:') ? layoutPick.slice(2) : null;
      const canUpdate =
        source === 'editor'
          ? canSaveLibraryUpdateFromEditor
          : canSaveLibraryUpdateFromUnit;
      const draft = editorTitleDraft.trim();
      if (canUpdate && libId && libraryIdSet.has(libId)) {
        setLibrarySaveMode('update');
        setUpdateLibraryTemplateId(libId);
        const row = libraryRows.find((r) => r.id === libId);
        setNewLibraryName(draft || (row?.name ?? '').trim());
      } else {
        setLibrarySaveMode('create');
        setUpdateLibraryTemplateId(null);
        setNewLibraryName(draft);
      }
      setLibrarySaveSource(source);
      setSaveLibraryOpen(true);
    },
    [
      canSaveLibraryUpdateFromEditor,
      canSaveLibraryUpdateFromUnit,
      editorTitleDraft,
      layoutPick,
      libraryIdSet,
      libraryRows
    ]
  );

  const onApplySelectedLayout = useCallback(() => {
    if (layoutPick.startsWith('p:')) {
      const key = layoutPick.slice(2) as (typeof PRESET_KEYS)[number];
      const preset = SCREEN_TEMPLATE_PRESETS[key];
      if (!preset) {
        return;
      }
      const tpl = ensureTenantScreenTemplateId(cloneTemplate(preset));
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
            useScreenBuilderStore
              .getState()
              .initFrom(v.data, normalizeBuilderPresetId(key));
            toast.success(t('saved', { default: 'Saved' }));
          }
        }
      );
      return;
    }
    if (layoutPick.startsWith('l:')) {
      const id = layoutPick.slice(2);
      const row = libraryRows.find((r) => r.id === id);
      if (!row?.definition) {
        toast.error(
          t('libraryPickFirst', { default: 'Select a library template first.' })
        );
        return;
      }
      const parsed = ScreenTemplateSchema.safeParse(row.definition);
      if (!parsed.success) {
        toast.error(
          t('libraryInvalid', { default: 'This library entry is not valid.' })
        );
        return;
      }
      /** Keep `screenTemplate.id` equal to the library row id so updates and the layout picker stay in sync. */
      const anchored = { ...parsed.data, id } as ScreenTemplate;
      const toApply = ensureTenantScreenTemplateId(anchored);
      const v = safeParseSignageWithToast(
        'Screen template',
        signageZod.screenTemplate,
        toApply
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
            useScreenBuilderStore.getState().initFrom(v.data, null);
            toast.success(t('saved', { default: 'Saved' }));
          }
        }
      );
    }
  }, [layoutPick, libraryRows, qc, t, unit, unitId, updateUnit]);

  const openEditor = useCallback(() => {
    const { template, sourcePresetId } = resolveEditorInit(
      unit,
      layoutPick,
      libraryRows
    );
    useScreenBuilderStore.getState().initFrom(template, sourcePresetId);
    setEditorOpen(true);
  }, [unit, layoutPick, libraryRows]);

  const onConfirmSaveToLibrary = useCallback(async () => {
    const name = newLibraryName.trim();
    if (!name) {
      toast.error(
        t('libraryNameRequired', { default: 'Enter a template name.' })
      );
      return;
    }
    const raw: ScreenTemplate | null =
      librarySaveSource === 'editor'
        ? useScreenBuilderStore.getState().template
        : templateForLibrarySave;
    if (!raw) {
      toast.error(
        t('libraryNothingToSave', {
          default: 'Nothing to save. Apply a layout or open the editor first.'
        })
      );
      return;
    }
    const toValidate =
      librarySaveMode === 'update' && updateLibraryTemplateId
        ? ({ ...raw, id: updateLibraryTemplateId } as ScreenTemplate)
        : ensureTenantScreenTemplateId(raw);
    const v = ScreenTemplateSchema.safeParse(toValidate);
    if (!v.success) {
      toast.error(
        t('libraryInvalid', { default: 'This layout is not valid to save.' })
      );
      return;
    }
    const definition = v.data as Record<string, unknown>;

    const rawUnit = (unit.config as { screenTemplate?: unknown } | null)
      ?.screenTemplate;
    const unitParsed = rawUnit ? ScreenTemplateSchema.safeParse(rawUnit) : null;
    const unitRunsThisTemplate =
      librarySaveMode === 'update' &&
      updateLibraryTemplateId &&
      unitParsed?.success &&
      unitParsed.data.id === updateLibraryTemplateId;

    try {
      if (librarySaveMode === 'update' && updateLibraryTemplateId) {
        const res = await putLibrary.mutateAsync({
          templateId: updateLibraryTemplateId,
          data: { name, definition }
        });
        if (res.status !== 200) {
          toast.error(String(res.data));
          return;
        }

        if (unitRunsThisTemplate) {
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
                useScreenBuilderStore.getState().markSaved(v.data);
                toast.success(
                  t('librarySavedAndApplied', {
                    default: 'Template updated and applied to display.'
                  })
                );
              },
              onError: () => {
                toast.warning(
                  t('libraryUpdatedUnitFailed', {
                    default:
                      'Template saved to library, but could not apply to display.'
                  })
                );
              }
            }
          );
        } else {
          toast.success(
            t('libraryUpdated', { default: 'Library template updated.' })
          );
        }
      } else {
        const res = await postLibrary.mutateAsync({
          data: { name, definition }
        });
        if (res.status !== 201) {
          toast.error(String(res.data));
          return;
        }
        const createdId =
          res.data &&
          typeof res.data === 'object' &&
          'id' in res.data &&
          typeof (res.data as { id: unknown }).id === 'string'
            ? (res.data as { id: string }).id
            : null;
        if (createdId) {
          await qc.invalidateQueries({
            queryKey: getGetCompaniesMeScreenLayoutTemplatesQueryKey()
          });
          setLayoutPick(`l:${createdId}`);
        }
        toast.success(
          t('librarySaved', { default: 'Template saved to library.' })
        );
      }
      setSaveLibraryOpen(false);
      setNewLibraryName('');
      setLibrarySaveSource('unit');
      setLibrarySaveMode('create');
      setUpdateLibraryTemplateId(null);
    } catch (e) {
      toast.error(String(e));
    }
  }, [
    librarySaveMode,
    librarySaveSource,
    newLibraryName,
    postLibrary,
    putLibrary,
    qc,
    t,
    templateForLibrarySave,
    unit,
    unitId,
    updateUnit,
    updateLibraryTemplateId
  ]);

  const onConfirmDeleteLibrary = useCallback(async () => {
    if (!deleteLibraryId) {
      return;
    }
    try {
      const res = await deleteLibrary.mutateAsync({
        templateId: deleteLibraryId
      });
      if (res.status !== 204) {
        toast.error(String(res.data));
        return;
      }
      toast.success(t('libraryDeleted', { default: 'Removed from library.' }));
      setDeleteLibraryId(null);
      setLayoutPick('p:info-heavy');
    } catch (e) {
      toast.error(String(e));
    }
  }, [deleteLibrary, deleteLibraryId, t]);

  const onClearLayout = useCallback(() => {
    const current = (
      unit.config && typeof unit.config === 'object'
        ? (unit.config as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { screenTemplate: _drop, ...rest } = current;
    updateUnit.mutate(
      { id: unitId, config: { ...rest } as (typeof unit)['config'] },
      {
        onSuccess: () => {
          void qc.invalidateQueries({
            queryKey: getGetUnitByIDQueryKey(unitId)
          });
          toast.success(t('cleared', { default: 'OK' }));
        }
      }
    );
  }, [qc, t, unit, unitId, updateUnit]);

  return (
    <div className='space-y-4'>
      <div className='bg-card/40 space-y-4 rounded-lg border p-4 sm:p-5'>
        <div className='space-y-1'>
          <h3 className='text-foreground text-sm font-semibold'>
            {t('layoutTabSummaryTitle', {
              default: 'Screen layout'
            })}
          </h3>
          <p className='text-muted-foreground text-xs'>
            {t('layoutUnifiedHint', {
              default:
                'Choose a built-in grid or a template from your organization library, then Apply. Open the visual editor to fine-tune. Library templates are shared across all units; Apply copies into this unit.'
            })}
          </p>
        </div>
        {meLoading ? (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <Loader2 className='h-4 w-4 shrink-0 animate-spin' aria-hidden />
            {t('libraryLoading', { default: 'Loading organization…' })}
          </div>
        ) : null}
        {!meLoading && !meResolved ? (
          <p className='text-destructive text-sm'>
            {t('libraryLoadError', {
              default:
                'Could not load organization settings. Refresh the page and try again.'
            })}
          </p>
        ) : null}
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label className='text-foreground/90' htmlFor='layout-unified-pick'>
              {t('layoutTemplatePick', {
                default: 'Screen template'
              })}
            </Label>
            <Select value={layoutPick} onValueChange={setLayoutPick}>
              <SelectTrigger
                id='layout-unified-pick'
                className='h-auto min-h-9 w-full min-w-0 py-2 whitespace-normal'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>
                    {t('layoutBuiltinGroup', { default: 'Built-in' })}
                  </SelectLabel>
                  {PRESET_KEYS.map((k) => (
                    <SelectItem key={`p:${k}`} value={`p:${k}`}>
                      {k === 'info-heavy'
                        ? t('presetNameInfoHeavy', { default: 'Info + side' })
                        : k === 'media-focus'
                          ? t('presetNameMediaFocus', { default: 'Media' })
                          : t('presetNameSplit3', { default: '3-way split' })}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {libraryActionsEnabled && libraryRows.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>
                      {t('layoutLibraryGroup', {
                        default: 'Organization library'
                      })}
                    </SelectLabel>
                    {libraryRows.map((row) => (
                      <SelectItem key={`l:${row.id}`} value={`l:${row.id!}`}>
                        {row.name ?? row.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          {meResolved && !customLayouts ? (
            <p className='text-muted-foreground bg-muted/30 rounded-md border p-3 text-sm'>
              {t('libraryPlanDisabled', {
                default:
                  'Saving reusable screen layouts to a shared library requires a plan that includes custom screen layouts.'
              })}
            </p>
          ) : null}
          {libraryActionsEnabled && libraryRows.length === 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('libraryEmptyShort', {
                default:
                  'No saved organization templates yet — use «Create library template» to add the first.'
              })}
            </p>
          ) : null}
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              onClick={onApplySelectedLayout}
              disabled={updateUnit.isPending}
              className='gap-1.5'
            >
              <Save className='h-3.5 w-3.5' />
              {t('applyLayout', { default: 'Apply layout' })}
            </Button>
            <Button type='button' variant='outline' onClick={openEditor}>
              {t('openVisualEditor', { default: 'Open visual editor' })}
            </Button>
            {libraryActionsEnabled ? (
              <>
                <Button
                  type='button'
                  variant='default'
                  className='gap-1.5'
                  disabled={
                    (!templateForLibrarySave &&
                      !canSaveLibraryUpdateFromUnit) ||
                    postLibrary.isPending ||
                    putLibrary.isPending
                  }
                  onClick={() => {
                    openSaveLibraryDialog('unit');
                  }}
                >
                  {canSaveLibraryUpdateFromUnit ? (
                    <Save className='h-3.5 w-3.5' />
                  ) : (
                    <Plus className='h-3.5 w-3.5' />
                  )}
                  {canSaveLibraryUpdateFromUnit
                    ? t('librarySaveExistingButton', {
                        default: 'Save template to library'
                      })
                    : t('libraryCreateButton', {
                        default: 'Create library template'
                      })}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  disabled={
                    !layoutPick.startsWith('l:') || deleteLibrary.isPending
                  }
                  className='text-destructive hover:text-destructive gap-1.5'
                  onClick={() => {
                    if (layoutPick.startsWith('l:')) {
                      setDeleteLibraryId(layoutPick.slice(2));
                    }
                  }}
                >
                  <Trash2 className='h-3.5 w-3.5' />
                  {t('deleteFromLibrary', { default: 'Delete from library' })}
                </Button>
              </>
            ) : null}
          </div>
          {libraryActionsEnabled ? (
            <p className='text-muted-foreground text-xs'>
              {t('layoutUnifiedFooterHint', {
                default:
                  '«Create library template» saves the layout on this unit after Apply, or the built-in option highlighted in the list if the unit still uses the classic screen.'
              })}
            </p>
          ) : null}
        </div>
      </div>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side='right'
          className='flex h-dvh max-h-dvh w-[calc(100vw-12px)] max-w-none flex-col gap-0 overflow-hidden border-l p-0 sm:max-w-none md:max-w-[min(100vw-12px,1600px)]'
        >
          <SheetHeader className='flex shrink-0 flex-col gap-2 px-4 py-2.5 pr-12 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
            <div className='flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[12rem] sm:pr-2'>
              <SheetTitle className='sr-only'>
                {t('layoutEditorTitle', { default: 'Visual screen template' })}
              </SheetTitle>
              <Label
                htmlFor='visual-editor-layout-title'
                className='text-muted-foreground sr-only'
              >
                {t('editorLayoutNameLabel', {
                  default: 'Template name'
                })}
              </Label>
              <Input
                id='visual-editor-layout-title'
                value={editorTitleDraft}
                onChange={(e) => {
                  setEditorTitleDraft(e.target.value);
                }}
                onBlur={(e) => {
                  void commitLibraryTemplateName(e.currentTarget.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                disabled={putLibrary.isPending}
                className='h-9 w-full min-w-0 text-base font-semibold'
                placeholder={t('editorLayoutNamePlaceholder', {
                  default: 'Template name'
                })}
              />
            </div>
            {libraryActionsEnabled ? (
              <Button
                type='button'
                size='sm'
                variant='default'
                className='shrink-0 gap-1.5 self-start sm:self-center'
                disabled={postLibrary.isPending || putLibrary.isPending}
                onClick={() => {
                  openSaveLibraryDialog('editor');
                }}
              >
                {canSaveLibraryUpdateFromEditor ? (
                  <Save className='h-3.5 w-3.5' />
                ) : (
                  <Plus className='h-3.5 w-3.5' />
                )}
                {canSaveLibraryUpdateFromEditor
                  ? t('librarySaveButton', {
                      default: 'Save'
                    })
                  : t('libraryCreateButton', {
                      default: 'Create library template'
                    })}
              </Button>
            ) : null}
          </SheetHeader>
          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6'>
            {editorOpen ? (
              <ScreenVisualBuilder
                key={unitId}
                unit={unit}
                unitId={unitId}
                canEdit
                draftOnly
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-3'>
        <p className='text-muted-foreground text-xs sm:max-w-sm'>
          {t('builderClassicHint', {
            default:
              '“Classic layout” removes the saved screen template. The public screen will use the default built-in layout until you apply again.'
          })}
        </p>
        <Button
          type='button'
          variant='secondary'
          onClick={onClearLayout}
          disabled={updateUnit.isPending}
        >
          {t('classicLayout', { default: 'Use classic layout' })}
        </Button>
      </div>

      <Dialog
        open={saveLibraryOpen}
        onOpenChange={(open) => {
          setSaveLibraryOpen(open);
          if (!open) {
            setLibrarySaveSource('unit');
            setLibrarySaveMode('create');
            setUpdateLibraryTemplateId(null);
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {librarySaveMode === 'update'
                ? t('saveLibraryDialogUpdateTitle', {
                    default: 'Update library template'
                  })
                : t('saveLibraryDialogTitle', {
                    default: 'Save layout to library'
                  })}
            </DialogTitle>
            <DialogDescription>
              {librarySaveMode === 'update'
                ? t('saveLibraryDialogUpdateHint', {
                    default:
                      'The shared template in the organization library will be replaced. If this display uses this template, changes will be applied automatically.'
                  })
                : librarySaveSource === 'editor'
                  ? t('saveLibraryDialogEditorHint', {
                      default:
                        'The current draft in the visual editor (including unsaved changes) will be saved to the shared library.'
                    })
                  : t('saveLibraryDialogUnitHint', {
                      default:
                        'Uses the layout for this unit after «Apply», or the preset selected above if there is no saved template on the unit yet.'
                    })}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2 py-1'>
            <Label htmlFor='lib-name' className='text-xs'>
              {t('libraryNameLabel', { default: 'Name' })}
            </Label>
            <Input
              id='lib-name'
              value={newLibraryName}
              onChange={(e) => {
                setNewLibraryName(e.target.value);
              }}
              placeholder={t('libraryNamePlaceholder', {
                default: 'e.g. Lobby portrait'
              })}
            />
          </div>
          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setSaveLibraryOpen(false);
              }}
            >
              {t('libraryCancel', { default: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={postLibrary.isPending || putLibrary.isPending}
              onClick={() => {
                void onConfirmSaveToLibrary();
              }}
            >
              {t('librarySave', { default: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteLibraryId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteLibraryId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deleteLibraryConfirmTitle', {
                default: 'Delete this template?'
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteLibraryConfirmDescription', {
                default:
                  'Units that already applied a copy keep their layout. This only removes the shared library entry.'
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('libraryCancel', { default: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={() => {
                void onConfirmDeleteLibrary();
              }}
            >
              {t('libraryDelete', { default: 'Delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
