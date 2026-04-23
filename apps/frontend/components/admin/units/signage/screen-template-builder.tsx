'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Unit } from '@quokkaq/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateUnit } from '@/lib/hooks';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';
import {
  getInitialScreenTemplateFromUnit,
  getTabPresetKeyFromUnit,
  normalizeBuilderPresetId,
  SCREEN_TEMPLATE_PRESET_KEYS
} from '@/lib/screen-template-from-unit';
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { ScreenVisualBuilder } from './screen-visual-builder';

const PRESET_KEYS = SCREEN_TEMPLATE_PRESET_KEYS;

function cloneTemplate<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
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

  const savedPresetKey = useMemo(() => getTabPresetKeyFromUnit(unit), [unit]);

  const [pendingPreset, setPendingPreset] =
    useState<(typeof PRESET_KEYS)[number]>('info-heavy');

  useEffect(() => {
    setPendingPreset(savedPresetKey);
  }, [savedPresetKey]);

  /** Re-sync draft when the sheet is open and server unit config changed. */
  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const { template, sourcePresetId } = getInitialScreenTemplateFromUnit(unit);
    useScreenBuilderStore
      .getState()
      .initFrom(template, normalizeBuilderPresetId(sourcePresetId));
  }, [editorOpen, unit]);

  const applyPresetFromTab = useCallback(() => {
    const preset = SCREEN_TEMPLATE_PRESETS[pendingPreset];
    if (!preset) {
      return;
    }
    const tpl = cloneTemplate(preset);
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
            .initFrom(v.data, normalizeBuilderPresetId(pendingPreset));
          toast.success(t('saved', { default: 'Saved' }));
        }
      }
    );
  }, [pendingPreset, qc, t, unit, unitId, updateUnit]);

  const openEditor = useCallback(() => {
    const { template, sourcePresetId } = getInitialScreenTemplateFromUnit(unit);
    useScreenBuilderStore
      .getState()
      .initFrom(template, normalizeBuilderPresetId(sourcePresetId));
    setEditorOpen(true);
  }, [unit]);

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
      <div className='bg-card/40 space-y-3 rounded-lg border p-4'>
        <div className='space-y-1'>
          <h3 className='text-foreground text-sm font-semibold'>
            {t('layoutTabSummaryTitle', {
              default: 'Screen layout'
            })}
          </h3>
          <p className='text-muted-foreground text-xs'>
            {t('layoutTabSummaryHint', {
              default:
                'Pick a ready-made layout and apply. Open the visual editor only if you need to customize widgets or regions.'
            })}
          </p>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end'>
          <div className='min-w-0 flex-1 space-y-1.5 sm:max-w-md'>
            <Label className='text-foreground/90' htmlFor='tab-screen-preset'>
              {t('presets')}
            </Label>
            <Select
              value={pendingPreset}
              onValueChange={(v) => {
                setPendingPreset(
                  (v in SCREEN_TEMPLATE_PRESETS
                    ? v
                    : 'info-heavy') as (typeof PRESET_KEYS)[number]
                );
              }}
            >
              <SelectTrigger id='tab-screen-preset' className='w-full min-w-0'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k === 'info-heavy'
                      ? t('presetNameInfoHeavy', { default: 'Info + side' })
                      : k === 'media-focus'
                        ? t('presetNameMediaFocus', { default: 'Media' })
                        : t('presetNameSplit3', { default: '3-way split' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              onClick={applyPresetFromTab}
              disabled={updateUnit.isPending}
              className='gap-1.5'
            >
              <Save className='h-3.5 w-3.5' />
              {t('applyLayout', { default: 'Apply layout' })}
            </Button>
            <Button type='button' variant='outline' onClick={openEditor}>
              {t('openVisualEditor', { default: 'Open visual editor' })}
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side='right'
          className='flex h-dvh max-h-dvh w-[calc(100vw-12px)] max-w-none flex-col gap-0 overflow-hidden border-l p-0 sm:max-w-none md:max-w-[min(100vw-12px,1600px)]'
        >
          <SheetHeader className='border-border shrink-0 border-b px-4 py-2.5 pr-12'>
            <SheetTitle className='text-base'>
              {t('layoutEditorTitle', { default: 'Visual screen template' })}
            </SheetTitle>
          </SheetHeader>
          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6'>
            {editorOpen ? (
              <ScreenVisualBuilder
                key={unitId}
                unit={unit}
                unitId={unitId}
                canEdit
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
    </div>
  );
}
