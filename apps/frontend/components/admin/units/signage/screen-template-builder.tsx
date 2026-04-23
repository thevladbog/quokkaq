'use client';

import { useState, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ScreenLayoutPreview } from './screen-layout-preview';

function cloneTemplate(t: ScreenTemplate): ScreenTemplate {
  return JSON.parse(JSON.stringify(t)) as ScreenTemplate;
}

type WidgetOverlay = { feedId?: string; html?: string };

function overlaysFromTemplate(
  tpl: ScreenTemplate
): Record<string, WidgetOverlay> {
  const o: Record<string, WidgetOverlay> = {};
  for (const w of tpl.widgets) {
    if (w.type === 'rss-feed' || w.type === 'weather') {
      o[w.id] = {
        feedId: String(
          (w.config as { feedId?: string } | undefined)?.feedId ?? ''
        )
      };
    } else if (w.type === 'custom-html') {
      o[w.id] = {
        html: String((w.config as { html?: string } | undefined)?.html ?? '')
      };
    }
  }
  return o;
}

function WidgetOverlaysForm({
  initialOverlays,
  configurableWidgets,
  feedList,
  t,
  isPending,
  onApply
}: {
  initialOverlays: Record<string, WidgetOverlay>;
  configurableWidgets: ScreenTemplate['widgets'];
  feedList: orval.ModelsExternalFeed[];
  t: (key: string, values?: { default: string }) => string;
  isPending: boolean;
  onApply: (overlays: Record<string, WidgetOverlay>) => void;
}) {
  const [overlays, setOverlays] = useState(initialOverlays);
  return (
    <>
      {configurableWidgets.length > 0 ? (
        <div className='space-y-3'>
          {configurableWidgets.map((w) => (
            <div
              key={w.id}
              className='bg-muted/30 space-y-2 rounded-lg border p-3'
            >
              <p className='text-muted-foreground text-xs font-medium tracking-wide'>
                {w.type} <span className='font-mono'>({w.id})</span>
              </p>
              {w.type === 'rss-feed' && (
                <div className='space-y-1.5'>
                  <Label htmlFor={`feed-${w.id}`}>
                    {t('rssWidgetFeed', { default: 'RSS — feed' })}
                  </Label>
                  <Select
                    value={overlays[w.id]?.feedId || '_none'}
                    onValueChange={(v) =>
                      setOverlays((prev) => ({
                        ...prev,
                        [w.id]: {
                          ...prev[w.id],
                          feedId: v === '_none' ? '' : v
                        }
                      }))
                    }
                  >
                    <SelectTrigger
                      id={`feed-${w.id}`}
                      className='w-full max-w-md'
                    >
                      <SelectValue
                        placeholder={t('noFeed', { default: '—' })}
                      />
                    </SelectTrigger>
                    <SelectContent align='start' className='max-w-md'>
                      <SelectItem value='_none'>
                        {t('noFeed', { default: '—' })}
                      </SelectItem>
                      {feedList
                        .filter((f) => f.type === 'rss' && f.id)
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id!}>
                            {f.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {w.type === 'weather' && (
                <div className='space-y-1.5'>
                  <Label htmlFor={`w-${w.id}`}>
                    {t('weatherWidgetFeed', { default: 'Weather — feed' })}
                  </Label>
                  <Select
                    value={overlays[w.id]?.feedId || '_none'}
                    onValueChange={(v) =>
                      setOverlays((prev) => ({
                        ...prev,
                        [w.id]: {
                          ...prev[w.id],
                          feedId: v === '_none' ? '' : v
                        }
                      }))
                    }
                  >
                    <SelectTrigger id={`w-${w.id}`} className='w-full max-w-md'>
                      <SelectValue
                        placeholder={t('noFeed', { default: '—' })}
                      />
                    </SelectTrigger>
                    <SelectContent align='start' className='max-w-md'>
                      <SelectItem value='_none'>
                        {t('noFeed', { default: '—' })}
                      </SelectItem>
                      {feedList
                        .filter((f) => f.type === 'weather' && f.id)
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id!}>
                            {f.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {w.type === 'custom-html' && (
                <div>
                  <Label htmlFor={`html-${w.id}`}>
                    {t('customHtml', { default: 'Custom HTML' })}
                  </Label>
                  <Textarea
                    id={`html-${w.id}`}
                    className='mt-1 font-mono text-sm'
                    rows={4}
                    value={overlays[w.id]?.html ?? ''}
                    onChange={(e) =>
                      setOverlays((prev) => ({
                        ...prev,
                        [w.id]: { ...prev[w.id], html: e.target.value }
                      }))
                    }
                    placeholder='HTML'
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t('noWidgetConfig', {
            default: 'This preset has no feed/HTML widgets to configure.'
          })}
        </p>
      )}

      <div className='pt-1'>
        <Button
          type='button'
          onClick={() => {
            onApply(overlays);
          }}
          disabled={isPending}
        >
          {t('applyLayout', { default: 'Apply' })}
        </Button>
      </div>
    </>
  );
}

export function ScreenTemplateBuilder({
  unit,
  unitId
}: {
  unit: Unit;
  unitId: string;
}) {
  const t = useTranslations('admin.signage');
  const locale = useLocale();
  const qc = useQueryClient();
  const updateUnit = useUpdateUnit();
  const { data: feedsRes } = orval.useListSignageFeeds(unitId);
  const feedList: orval.ModelsExternalFeed[] = feedsRes?.data ?? [];

  const raw = (unit.config as { screenTemplate?: unknown } | null)
    ?.screenTemplate;
  const initialLayoutId = useMemo(() => {
    if (raw) {
      const p = ScreenTemplateSchema.safeParse(raw);
      if (p.success) {
        return p.data.id;
      }
    }
    return Object.keys(SCREEN_TEMPLATE_PRESETS)[0] ?? 'info-heavy';
  }, [raw]);
  const [layoutId, setLayoutId] = useState(initialLayoutId);

  const rawParsed = useMemo(
    () => (raw ? ScreenTemplateSchema.safeParse(raw) : null),
    [raw]
  );

  const serverOverlays = useMemo(() => {
    if (rawParsed?.success && rawParsed.data.id === layoutId) {
      return overlaysFromTemplate(rawParsed.data);
    }
    return {};
  }, [rawParsed, layoutId]);

  const preset = SCREEN_TEMPLATE_PRESETS[layoutId];
  const configurableWidgets = useMemo(
    () =>
      preset
        ? preset.widgets.filter(
            (w) =>
              w.type === 'rss-feed' ||
              w.type === 'weather' ||
              w.type === 'custom-html'
          )
        : [],
    [preset]
  );

  const formKey = `${layoutId}|${(unit as { updatedAt?: string }).updatedAt ?? unit.id}`;

  const applyLayout = (overlays: Record<string, WidgetOverlay>) => {
    if (!preset) {
      return;
    }
    const v0 = cloneTemplate(preset);
    for (const w of v0.widgets) {
      const o = overlays[w.id];
      if (!o) {
        continue;
      }
      if (w.type === 'rss-feed' || w.type === 'weather') {
        if (o.feedId) {
          w.config = { ...(w.config ?? {}), feedId: o.feedId };
        }
      } else if (w.type === 'custom-html' && o.html != null) {
        w.config = { ...(w.config ?? {}), html: o.html };
      }
    }
    const v = safeParseSignageWithToast(
      'Screen template',
      signageZod.screenTemplate,
      v0
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

  if (!preset) {
    return null;
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <Label htmlFor='signage-screen-template-preset'>
          {t('presets', { default: 'Screen template' })}
        </Label>
        <Select value={layoutId} onValueChange={setLayoutId}>
          <SelectTrigger
            id='signage-screen-template-preset'
            className='w-full max-w-sm'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(SCREEN_TEMPLATE_PRESETS).map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <WidgetOverlaysForm
        key={formKey}
        initialOverlays={serverOverlays}
        configurableWidgets={configurableWidgets}
        feedList={feedList}
        t={t as (key: string, values?: { default: string }) => string}
        isPending={updateUnit.isPending}
        onApply={applyLayout}
      />

      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='secondary'
          onClick={onClearLayout}
          disabled={updateUnit.isPending}
        >
          {t('classicLayout', { default: 'Use classic layout' })}
        </Button>
      </div>

      <ScreenLayoutPreview
        unitId={unitId}
        locale={locale}
        onRefreshKey={`${
          (unit as { updatedAt?: string }).updatedAt ?? unit.id
        }-${layoutId}`}
      />
    </div>
  );
}
