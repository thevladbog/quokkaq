'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Unit } from '@quokkaq/shared-types';
import {
  ScreenTemplateSchema,
  type ScreenTemplate
} from '@quokkaq/shared-types';
import * as orval from '@/lib/api/generated/units';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateUnit } from '@/lib/hooks';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

function cloneTemplate(t: ScreenTemplate): ScreenTemplate {
  return JSON.parse(JSON.stringify(t)) as ScreenTemplate;
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
  const { data: feeds } = orval.useListSignageFeeds(unitId);
  const feedList = (feeds as orval.ModelsExternalFeed[] | undefined) ?? [];

  const raw = (unit.config as { screenTemplate?: unknown } | null)
    ?.screenTemplate;
  const initial = useMemo(() => {
    if (raw) {
      const p = ScreenTemplateSchema.safeParse(raw);
      if (p.success) {
        return p.data.id;
      }
    }
    return Object.keys(SCREEN_TEMPLATE_PRESETS)[0] ?? 'info-heavy';
  }, [raw]);
  const [layoutId, setLayoutId] = useState(initial);

  const [feedRss, setFeedRss] = useState('');

  const onSaveLayout = () => {
    const preset = SCREEN_TEMPLATE_PRESETS[layoutId];
    if (!preset) {
      return;
    }
    const v0 = cloneTemplate(preset);
    for (const w of v0.widgets) {
      if (w.type === 'rss-feed' && feedRss) {
        w.config = { ...(w.config ?? {}), feedId: feedRss };
      }
    }
    const v = ScreenTemplateSchema.safeParse(v0);
    if (!v.success) {
      toast.error('Invalid');
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
          toast.success(t('saved', { default: 'Saved' }));
        }
      }
    );
  };

  const onClearLayout = () => {
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
  };

  return (
    <div className='space-y-3'>
      <Label>{t('presets', { default: 'Screen template' })}</Label>
      <select
        className='border-input w-full max-w-sm rounded-md border p-2'
        value={layoutId}
        onChange={(e) => setLayoutId(e.target.value)}
      >
        {Object.keys(SCREEN_TEMPLATE_PRESETS).map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      {layoutId === 'split-3' && (
        <div className='grid gap-2 sm:max-w-md'>
          <div>
            <Label>{t('rssWidgetFeed', { default: 'RSS row — feed' })}</Label>
            <select
              className='border-input w-full rounded-md border p-2'
              value={feedRss}
              onChange={(e) => setFeedRss(e.target.value)}
            >
              <option value=''>{t('noFeed', { default: '—' })}</option>
              {feedList
                .filter((f) => f.type === 'rss')
                .map((f) => (
                  <option key={f.id} value={f.id!}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}
      {layoutId === 'info-heavy' && (
        <p className='text-muted-foreground text-sm'>
          {t('layoutInfoHeavy', {
            default:
              'Info-heavy does not use RSS. Use split-3 to bind an RSS/weather feed.'
          })}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button onClick={onSaveLayout} disabled={updateUnit.isPending}>
          {t('applyLayout', { default: 'Apply' })}
        </Button>
        <Button type='button' variant='secondary' onClick={onClearLayout}>
          {t('classicLayout', { default: 'Use classic layout' })}
        </Button>
      </div>
    </div>
  );
}
