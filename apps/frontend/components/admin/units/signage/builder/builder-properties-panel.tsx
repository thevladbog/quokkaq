'use client';

import { useCallback, useId, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import * as orval from '@/lib/api/generated/units';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { ScreenCellGridWidget } from '@quokkaq/shared-types';
import { Button } from '@/components/ui/button';
import { Copy, Trash2 } from 'lucide-react';
import { widgetShortLabel } from './widget-preview';
import { CssColorField } from './css-color-field';
import {
  parseClockDisplayMode,
  type ClockTimeFormatMode
} from '@/lib/screen-clock-config';
import { parseJoinQueueQrAlign } from '@/components/screen/widgets/screen-join-queue-qr-widget';
import {
  parseQueueTickerDirection,
  parseQueueTickerDurationSeconds
} from '@/lib/queue-ticker-config';
import {
  getQueueStatsCards,
  type QueueStatsWidgetConfig
} from '@/lib/queue-stats-config';
import { QueueStatsCardsDialog } from './queue-stats-cards-dialog';

const PROP_LABEL = 'text-xs';
const FIELD_WRAPPER = 'flex flex-col gap-1.5';
const SECTION_GAP = 'space-y-3';

type GridWidget = ScreenCellGridWidget;

/** Portrait + landscape must share ids/config; merge so UI reads non-empty config from either face. */
function mergeWidgetAcrossOrientations(
  template: {
    portrait: { widgets: GridWidget[] };
    landscape: { widgets: GridWidget[] };
  },
  widgetId: string
): GridWidget | null {
  const wp = template.portrait.widgets.find((x) => x.id === widgetId);
  const wl = template.landscape.widgets.find((x) => x.id === widgetId);
  if (!wp && !wl) return null;
  if (!wp) return wl!;
  if (!wl) return wp;
  return {
    ...wp,
    config: { ...(wl.config ?? {}), ...(wp.config ?? {}) },
    style: { ...(wl.style ?? {}), ...(wp.style ?? {}) }
  };
}

export function BuilderPropertiesPanel({
  unitId,
  canEdit
}: {
  unitId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('admin.screenBuilder');
  const { data: feedsRes } = orval.useListSignageFeeds(unitId);

  const template = useScreenBuilderStore((s) => s.template);
  const editOrientation = useScreenBuilderStore((s) => s.editOrientation);
  const setEditOrientation = useScreenBuilderStore((s) => s.setEditOrientation);
  const setGridDimensions = useScreenBuilderStore((s) => s.setGridDimensions);
  const setWidgetPlacement = useScreenBuilderStore((s) => s.setWidgetPlacement);
  const selection = useScreenBuilderStore((s) => s.selection);
  const updateWidget = useScreenBuilderStore((s) => s.updateWidget);
  const removeWidget = useScreenBuilderStore((s) => s.removeWidget);
  const setSelection = useScreenBuilderStore((s) => s.setSelection);

  const wSel: GridWidget | null = useMemo(() => {
    if (selection.kind !== 'widget') return null;
    return mergeWidgetAcrossOrientations(template, selection.id);
  }, [selection, template]);

  const feedsForWidget = useMemo(() => {
    const feedList: orval.ModelsExternalFeed[] = feedsRes?.data ?? [];
    if (!wSel || (wSel.type !== 'weather' && wSel.type !== 'rss-feed')) {
      return [];
    }
    return feedList.filter((f) => {
      if (wSel.type === 'weather') {
        return f.type === 'weather' && f.id;
      }
      return f.type === 'rss' && f.id;
    });
  }, [feedsRes?.data, wSel]);

  const { savedFeedId, feedSelectValue, orphanSavedFeed } = useMemo(() => {
    const feedId =
      wSel && (wSel.type === 'weather' || wSel.type === 'rss-feed')
        ? String(
            (wSel.config as { feedId?: string } | undefined)?.feedId ?? ''
          ).trim()
        : '';
    const selectValue = feedId || '_none';
    const orphan =
      Boolean(feedId) && !feedsForWidget.some((f) => f.id === feedId);
    return {
      savedFeedId: feedId,
      feedSelectValue: selectValue,
      orphanSavedFeed: orphan
    };
  }, [wSel, feedsForWidget]);

  const tab = wSel ? 'widget' : 'layout';
  const propsHeadingId = useId();

  const copyLayoutId = useCallback(async () => {
    const id = template.id;
    try {
      await navigator.clipboard.writeText(id);
      toast.success(
        t('props.layoutIdCopied', { default: 'Layout id copied to clipboard.' })
      );
    } catch {
      toast.error(
        t('props.layoutIdCopyFailed', {
          default: 'Could not copy — try selecting the id manually.'
        })
      );
    }
  }, [t, template.id]);

  return (
    <aside
      className='bg-muted/20 flex min-h-0 w-full max-w-full min-w-0 flex-col gap-4 overflow-y-auto rounded-lg border p-2 text-sm sm:p-3'
      aria-labelledby={propsHeadingId}
    >
      <h2
        id={propsHeadingId}
        className='text-foreground/90 text-sm font-semibold'
      >
        {t('props.title', { default: 'Properties' })}
      </h2>
      <div className='min-w-0 space-y-1.5'>
        <Tabs
          value={tab}
          onValueChange={() => {
            /* visual only; selection sets tab */
          }}
        >
          <TabsList className='grid w-full min-w-0 [grid-template-columns:repeat(2,minmax(0,1fr))] flex-wrap'>
            <TabsTrigger
              className='min-w-0 px-1 text-xs'
              value='layout'
              onClick={() => {
                setSelection({ kind: 'none' });
              }}
            >
              {t('props.layoutTab', { default: 'Layout' })}
            </TabsTrigger>
            <TabsTrigger
              className='min-w-0 px-1 text-xs'
              value='widget'
              disabled={!wSel}
            >
              {t('props.widgetTab', { default: 'Widget' })}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {wSel && (
          <div className='min-w-0 space-y-1.5 pt-0.5' role='tabpanel'>
            <p className='text-muted-foreground text-xs'>
              {widgetShortLabel(t, wSel.type)}
            </p>
            <div className={FIELD_WRAPPER}>
              <Label className={PROP_LABEL}>
                {t('props.editOrientation', {
                  default: 'Editing placement for'
                })}
              </Label>
              <Select
                value={editOrientation}
                onValueChange={(v) => {
                  if (v === 'portrait' || v === 'landscape') {
                    setEditOrientation(v);
                  }
                }}
              >
                <SelectTrigger className='h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='portrait'>
                    {t('props.portrait', { default: 'Portrait' })}
                  </SelectItem>
                  <SelectItem value='landscape'>
                    {t('props.landscape', { default: 'Landscape' })}
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className='grid grid-cols-2 gap-2'>
                {(['col', 'row', 'colSpan', 'rowSpan'] as const).map((key) => (
                  <div key={key} className={FIELD_WRAPPER}>
                    <Label className={PROP_LABEL} htmlFor={`pl-${key}`}>
                      {t(`props.${key}`)}
                    </Label>
                    <Input
                      id={`pl-${key}`}
                      type='number'
                      min={1}
                      className='h-8 text-xs'
                      disabled={!canEdit}
                      value={
                        template[editOrientation].widgets.find(
                          (x) => x.id === wSel.id
                        )?.placement[key] ?? ''
                      }
                      onChange={(e) => {
                        if (!canEdit) return;
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        const cur = template[editOrientation].widgets.find(
                          (x) => x.id === wSel.id
                        )!;
                        setWidgetPlacement(
                          wSel.id,
                          { ...cur.placement, [key]: n },
                          editOrientation
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            {wSel.type === 'weather' || wSel.type === 'rss-feed' ? (
              <div className={FIELD_WRAPPER}>
                <Label className={PROP_LABEL} htmlFor='feed'>
                  {t('props.feed', { default: 'Feed' })}
                </Label>
                <Select
                  value={feedSelectValue}
                  onValueChange={(v) => {
                    if (!canEdit) {
                      return;
                    }
                    updateWidget(wSel.id, {
                      config: { ...wSel.config, feedId: v === '_none' ? '' : v }
                    });
                  }}
                >
                  <SelectTrigger
                    id='feed'
                    className='h-8 w-full min-w-0 text-xs'
                  >
                    <SelectValue
                      placeholder={t('props.feedPlaceholder', {
                        default: 'Select feed'
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent className='max-w-md'>
                    <SelectItem value='_none'>
                      {t('props.noFeed', { default: '—' })}
                    </SelectItem>
                    {orphanSavedFeed ? (
                      <SelectItem value={savedFeedId}>
                        {(savedFeedId.length > 40
                          ? `${savedFeedId.slice(0, 14)}…`
                          : savedFeedId) +
                          ' — ' +
                          t('props.feedNotOnUnitList', {
                            default: 'not in this display’s feed list'
                          })}
                      </SelectItem>
                    ) : null}
                    {feedsForWidget.map((f) => (
                      <SelectItem key={f.id} value={f.id!}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {wSel.type === 'custom-html' ? (
              <div className={FIELD_WRAPPER}>
                <Label className={PROP_LABEL} htmlFor='html'>
                  {t('props.html', { default: 'HTML' })}
                </Label>
                <Textarea
                  id='html'
                  className='min-h-24 font-mono text-xs'
                  value={String(
                    (wSel.config as { html?: string } | undefined)?.html ?? ''
                  )}
                  onChange={(e) => {
                    if (!canEdit) {
                      return;
                    }
                    updateWidget(wSel.id, {
                      config: { ...wSel.config, html: e.target.value }
                    });
                  }}
                />
              </div>
            ) : null}
            {wSel.type === 'content-player' ? (
              <div className='flex items-center justify-between gap-2'>
                <Label htmlFor='ov' className={PROP_LABEL}>
                  {t('props.overlayTickets', { default: 'Overlay calls' })}
                </Label>
                <Switch
                  id='ov'
                  disabled={!canEdit}
                  checked={Boolean(
                    (wSel.config as { overlayTickets?: boolean } | undefined)
                      ?.overlayTickets
                  )}
                  onCheckedChange={(c) => {
                    updateWidget(wSel.id, {
                      config: { ...wSel.config, overlayTickets: c }
                    });
                  }}
                />
              </div>
            ) : null}
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3'>
              <CssColorField
                id='bg'
                label={t('props.bg', { default: 'Background' })}
                value={wSel.style?.backgroundColor}
                disabled={!canEdit}
                pickerFallback='#0f172a'
                onValueChange={(v) => {
                  if (!canEdit) {
                    return;
                  }
                  updateWidget(wSel.id, {
                    style: { ...wSel.style, backgroundColor: v || undefined }
                  });
                }}
              />
              <CssColorField
                id='tx'
                label={t('props.fg', { default: 'Text' })}
                value={wSel.style?.textColor}
                disabled={!canEdit}
                pickerFallback='#f8fafc'
                onValueChange={(v) => {
                  if (!canEdit) {
                    return;
                  }
                  updateWidget(wSel.id, {
                    style: { ...wSel.style, textColor: v || undefined }
                  });
                }}
              />
              <div className={FIELD_WRAPPER}>
                <Label className={PROP_LABEL} htmlFor='fs'>
                  {t('props.fontSize', { default: 'Font size' })}
                </Label>
                <Input
                  id='fs'
                  className='h-8 text-xs'
                  disabled={!canEdit}
                  placeholder='1.25rem'
                  value={wSel.style?.fontSize ?? ''}
                  onChange={(e) => {
                    if (!canEdit) {
                      return;
                    }
                    updateWidget(wSel.id, {
                      style: {
                        ...wSel.style,
                        fontSize: e.target.value || undefined
                      }
                    });
                  }}
                />
              </div>
              <div className={FIELD_WRAPPER}>
                <Label className={PROP_LABEL} htmlFor='pd'>
                  {t('props.padding', { default: 'Padding' })}
                </Label>
                <Input
                  id='pd'
                  className='h-8 text-xs'
                  disabled={!canEdit}
                  placeholder='8px'
                  value={wSel.style?.padding ?? ''}
                  onChange={(e) => {
                    if (!canEdit) {
                      return;
                    }
                    updateWidget(wSel.id, {
                      style: {
                        ...wSel.style,
                        padding: e.target.value || undefined
                      }
                    });
                  }}
                />
              </div>
            </div>
            {wSel.type === 'screen-header' ? (
              <div className='space-y-3'>
                <div className={FIELD_WRAPPER}>
                  <Label className={PROP_LABEL} htmlFor='header-title'>
                    {t('props.headerTitle', { default: 'Title' })}
                  </Label>
                  <Input
                    id='header-title'
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    placeholder={t('props.headerTitlePlaceholder', {
                      default: 'Leave empty for unit name'
                    })}
                    value={String(
                      (wSel.config as { title?: string } | undefined)?.title ??
                        ''
                    )}
                    onChange={(e) => {
                      if (!canEdit) return;
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, title: e.target.value }
                      });
                    }}
                  />
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <Label htmlFor='header-show-date' className={PROP_LABEL}>
                    {t('props.headerShowDate', { default: 'Show date' })}
                  </Label>
                  <Switch
                    id='header-show-date'
                    disabled={!canEdit}
                    checked={Boolean(
                      (wSel.config as { showDate?: boolean } | undefined)
                        ?.showDate ?? true
                    )}
                    onCheckedChange={(c) => {
                      if (!canEdit) return;
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, showDate: c }
                      });
                    }}
                  />
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <Label htmlFor='header-show-time' className={PROP_LABEL}>
                    {t('props.headerShowTime', { default: 'Show time' })}
                  </Label>
                  <Switch
                    id='header-show-time'
                    disabled={!canEdit}
                    checked={Boolean(
                      (wSel.config as { showTime?: boolean } | undefined)
                        ?.showTime ?? true
                    )}
                    onCheckedChange={(c) => {
                      if (!canEdit) return;
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, showTime: c }
                      });
                    }}
                  />
                </div>
              </div>
            ) : null}
            {wSel.type === 'clock' ? (
              <div className={FIELD_WRAPPER}>
                <Label htmlFor='clock-fmt' className={PROP_LABEL}>
                  {t('props.clockTimeFormat', { default: 'Time format' })}
                </Label>
                <Select
                  value={parseClockDisplayMode(
                    (wSel.config ?? {}) as Record<string, unknown>
                  )}
                  disabled={!canEdit}
                  onValueChange={(v) => {
                    if (!canEdit) {
                      return;
                    }
                    const mode = v as ClockTimeFormatMode;
                    const prev = { ...(wSel.config ?? {}) } as Record<
                      string,
                      unknown
                    >;
                    delete prev.use24h;
                    updateWidget(wSel.id, {
                      config: { ...prev, clockTimeFormat: mode }
                    });
                  }}
                >
                  <SelectTrigger
                    id='clock-fmt'
                    className='h-8 w-full min-w-0'
                    size='sm'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='locale'>
                      {t('props.clockFmtLocale', {
                        default: 'Match language (locale default)'
                      })}
                    </SelectItem>
                    <SelectItem value='12h'>
                      {t('props.clockFmt12', { default: '12-hour (AM/PM)' })}
                    </SelectItem>
                    <SelectItem value='24h'>
                      {t('props.clockFmt24', { default: '24-hour' })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {wSel.type === 'eta-display' ? (
              <div className='flex items-center justify-between gap-2'>
                <Label htmlFor='eta' className={PROP_LABEL}>
                  {t('props.etaCompact', { default: 'Compact' })}
                </Label>
                <Switch
                  id='eta'
                  disabled={!canEdit}
                  checked={Boolean(
                    (wSel.config as { compact?: boolean } | undefined)?.compact
                  )}
                  onCheckedChange={(c) => {
                    if (!canEdit) {
                      return;
                    }
                    updateWidget(wSel.id, {
                      config: { ...wSel.config, compact: c }
                    });
                  }}
                />
              </div>
            ) : null}
            {wSel.type === 'announcements' ? (
              <div className={FIELD_WRAPPER}>
                <Label className={PROP_LABEL} htmlFor='an'>
                  {t('props.announceMaxItems', { default: 'Max items' })}
                </Label>
                <Input
                  id='an'
                  className='h-7 text-xs'
                  type='number'
                  min={1}
                  max={20}
                  disabled={!canEdit}
                  value={String(
                    (wSel.config as { maxItems?: number } | undefined)
                      ?.maxItems ?? ''
                  )}
                  onChange={(e) => {
                    if (!canEdit) {
                      return;
                    }
                    const n =
                      e.target.value === ''
                        ? undefined
                        : Math.min(20, Math.max(1, Number(e.target.value)));
                    updateWidget(wSel.id, {
                      config: { ...wSel.config, maxItems: n }
                    });
                  }}
                />
              </div>
            ) : null}
            {wSel.type === 'screen-footer-qr' ? (
              <>
                <div className='flex items-center justify-between gap-2'>
                  <Label htmlFor='fqr' className={PROP_LABEL}>
                    {t('props.footerShowQr', { default: 'Show QR' })}
                  </Label>
                  <Switch
                    id='fqr'
                    disabled={!canEdit}
                    checked={Boolean(
                      (wSel.config as { showQr?: boolean } | undefined)
                        ?.showQr ?? true
                    )}
                    onCheckedChange={(c) => {
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, showQr: c }
                      });
                    }}
                  />
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <Label htmlFor='fst' className={PROP_LABEL}>
                    {t('props.footerShowStats', { default: 'Show stats' })}
                  </Label>
                  <Switch
                    id='fst'
                    disabled={!canEdit}
                    checked={Boolean(
                      (wSel.config as { showStats?: boolean } | undefined)
                        ?.showStats ?? true
                    )}
                    onCheckedChange={(c) => {
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, showStats: c }
                      });
                    }}
                  />
                </div>
              </>
            ) : null}
            {wSel.type === 'queue-ticker' ? (
              <div className={SECTION_GAP}>
                <div className={FIELD_WRAPPER}>
                  <Label htmlFor='qt-ru' className={PROP_LABEL}>
                    {t('props.queueTickerLabelRu', { default: 'Phrase (RU)' })}
                  </Label>
                  <Input
                    id='qt-ru'
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    placeholder={t('props.queueTickerLabelPlaceholder', {
                      default: 'Leave empty for default'
                    })}
                    value={String(
                      (wSel.config as { labelRu?: unknown } | undefined)
                        ?.labelRu ?? ''
                    )}
                    onChange={(e) => {
                      if (!canEdit) return;
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, labelRu: e.target.value }
                      });
                    }}
                  />
                </div>
                <div className={FIELD_WRAPPER}>
                  <Label htmlFor='qt-en' className={PROP_LABEL}>
                    {t('props.queueTickerLabelEn', { default: 'Phrase (EN)' })}
                  </Label>
                  <Input
                    id='qt-en'
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    placeholder={t('props.queueTickerLabelPlaceholder', {
                      default: 'Leave empty for default'
                    })}
                    value={String(
                      (wSel.config as { labelEn?: unknown } | undefined)
                        ?.labelEn ?? ''
                    )}
                    onChange={(e) => {
                      if (!canEdit) return;
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, labelEn: e.target.value }
                      });
                    }}
                  />
                </div>
                <div className={FIELD_WRAPPER}>
                  <Label className={PROP_LABEL} htmlFor='qt-dir'>
                    {t('props.queueTickerDirection', {
                      default: 'Scroll direction'
                    })}
                  </Label>
                  <Select
                    value={parseQueueTickerDirection(
                      (wSel.config as { direction?: unknown } | undefined)
                        ?.direction
                    )}
                    disabled={!canEdit}
                    onValueChange={(v) => {
                      if (!canEdit) return;
                      if (v === 'left' || v === 'right') {
                        updateWidget(wSel.id, {
                          config: { ...wSel.config, direction: v }
                        });
                      }
                    }}
                  >
                    <SelectTrigger id='qt-dir' className='h-8 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='left'>
                        {t('props.queueTickerDirectionLeft', {
                          default: 'Left'
                        })}
                      </SelectItem>
                      <SelectItem value='right'>
                        {t('props.queueTickerDirectionRight', {
                          default: 'Right'
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={FIELD_WRAPPER}>
                  <Label htmlFor='qt-dur' className={PROP_LABEL}>
                    {t('props.queueTickerDurationSec', {
                      default: 'Loop duration (sec)'
                    })}
                  </Label>
                  <Input
                    id='qt-dur'
                    type='number'
                    min={8}
                    max={120}
                    step={1}
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    value={parseQueueTickerDurationSeconds(
                      (wSel.config as { durationSeconds?: unknown } | undefined)
                        ?.durationSeconds
                    )}
                    onChange={(e) => {
                      if (!canEdit) return;
                      const n = Number(e.target.value);
                      updateWidget(wSel.id, {
                        config: {
                          ...wSel.config,
                          durationSeconds: Number.isFinite(n)
                            ? parseQueueTickerDurationSeconds(n)
                            : 24
                        }
                      });
                    }}
                  />
                  <p className='text-muted-foreground text-[11px] leading-snug'>
                    {t('props.queueTickerDurationHint', {
                      default: 'Higher = slower. Range 8–120.'
                    })}
                  </p>
                </div>
              </div>
            ) : null}
            {wSel.type === 'join-queue-qr' ? (
              <div className={FIELD_WRAPPER}>
                <Label className={PROP_LABEL} htmlFor='jq-align'>
                  {t('props.joinQueueQrAlign', { default: 'QR alignment' })}
                </Label>
                <Select
                  value={parseJoinQueueQrAlign(
                    (wSel.config as { align?: unknown } | undefined)?.align
                  )}
                  disabled={!canEdit}
                  onValueChange={(v) => {
                    if (!canEdit) return;
                    if (v === 'left' || v === 'center' || v === 'right') {
                      updateWidget(wSel.id, {
                        config: { ...wSel.config, align: v }
                      });
                    }
                  }}
                >
                  <SelectTrigger id='jq-align' className='h-8 text-xs'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='left'>
                      {t('props.joinQueueQrAlignLeft', { default: 'Left' })}
                    </SelectItem>
                    <SelectItem value='center'>
                      {t('props.joinQueueQrAlignCenter', { default: 'Center' })}
                    </SelectItem>
                    <SelectItem value='right'>
                      {t('props.joinQueueQrAlignRight', { default: 'Right' })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {wSel.type === 'queue-stats' ? (
              <div className={FIELD_WRAPPER}>
                <Label className={PROP_LABEL}>
                  {t('props.queueStatsCards', { default: 'Stat cards' })}
                </Label>
                <QueueStatsCardsDialog
                  cards={getQueueStatsCards(
                    wSel.config as QueueStatsWidgetConfig | undefined
                  )}
                  canEdit={canEdit}
                  onSave={(cards) => {
                    if (!canEdit) return;
                    updateWidget(wSel.id, {
                      config: {
                        ...wSel.config,
                        cards
                      }
                    });
                  }}
                />
              </div>
            ) : null}
            <Button
              type='button'
              size='sm'
              variant='destructive'
              className='h-7 w-full gap-1 text-xs'
              disabled={!canEdit}
              onClick={() => {
                void removeWidget(wSel.id);
              }}
            >
              <Trash2 className='h-3 w-3' />
              {t('props.remove', { default: 'Remove' })}
            </Button>
          </div>
        )}

        {!wSel && (
          <div className='min-w-0 space-y-1.5 pt-0.5' role='tabpanel'>
            <div className={FIELD_WRAPPER}>
              <Label className={PROP_LABEL} htmlFor='tid'>
                {t('props.templateId', { default: 'Layout id' })}
              </Label>
              <div className='relative'>
                <Input
                  id='tid'
                  readOnly
                  tabIndex={-1}
                  aria-readonly
                  className='bg-muted/50 text-muted-foreground h-8 cursor-default pr-9 font-mono text-xs'
                  value={template.id}
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='text-muted-foreground hover:text-foreground absolute top-1/2 right-0.5 h-7 w-7 -translate-y-1/2'
                  onClick={() => {
                    void copyLayoutId();
                  }}
                  aria-label={t('props.copyLayoutId', {
                    default: 'Copy layout id'
                  })}
                >
                  <Copy className='h-3.5 w-3.5' aria-hidden />
                </Button>
              </div>
            </div>
            <div className={FIELD_WRAPPER}>
              <Label className={PROP_LABEL}>
                {t('props.canvasOrientation', {
                  default: 'Canvas orientation (editing)'
                })}
              </Label>
              <Select
                value={editOrientation}
                onValueChange={(v) => {
                  if (v === 'portrait' || v === 'landscape') {
                    setEditOrientation(v);
                  }
                }}
              >
                <SelectTrigger className='h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='portrait'>
                    {t('props.portrait', { default: 'Portrait' })}
                  </SelectItem>
                  <SelectItem value='landscape'>
                    {t('props.landscape', { default: 'Landscape' })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1 rounded-md border p-1.5'>
              <p className={PROP_LABEL}>
                {t('props.portraitGrid', { default: 'Portrait grid' })}
              </p>
              <div className='grid grid-cols-2 gap-1.5'>
                <div className={FIELD_WRAPPER}>
                  <Label className={PROP_LABEL} htmlFor='pg-cols'>
                    {t('props.gridColumns', { default: 'Columns' })}
                  </Label>
                  <Input
                    id='pg-cols'
                    type='number'
                    min={1}
                    max={48}
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    value={template.portrait.columns}
                    onChange={(e) => {
                      if (!canEdit) return;
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setGridDimensions(n, template.portrait.rows, 'portrait');
                    }}
                  />
                </div>
                <div className={FIELD_WRAPPER}>
                  <Label className={PROP_LABEL} htmlFor='pg-rows'>
                    {t('props.gridRows', { default: 'Rows' })}
                  </Label>
                  <Input
                    id='pg-rows'
                    type='number'
                    min={1}
                    max={48}
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    value={template.portrait.rows}
                    onChange={(e) => {
                      if (!canEdit) return;
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setGridDimensions(
                        template.portrait.columns,
                        n,
                        'portrait'
                      );
                    }}
                  />
                </div>
              </div>
            </div>
            <div className='space-y-1 rounded-md border p-1.5'>
              <p className={PROP_LABEL}>
                {t('props.landscapeGrid', { default: 'Landscape grid' })}
              </p>
              <div className='grid grid-cols-2 gap-1.5'>
                <div className={FIELD_WRAPPER}>
                  <Label className={PROP_LABEL} htmlFor='lg-cols'>
                    {t('props.gridColumns', { default: 'Columns' })}
                  </Label>
                  <Input
                    id='lg-cols'
                    type='number'
                    min={1}
                    max={48}
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    value={template.landscape.columns}
                    onChange={(e) => {
                      if (!canEdit) return;
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setGridDimensions(
                        n,
                        template.landscape.rows,
                        'landscape'
                      );
                    }}
                  />
                </div>
                <div className={FIELD_WRAPPER}>
                  <Label className={PROP_LABEL} htmlFor='lg-rows'>
                    {t('props.gridRows', { default: 'Rows' })}
                  </Label>
                  <Input
                    id='lg-rows'
                    type='number'
                    min={1}
                    max={48}
                    className='h-8 text-xs'
                    disabled={!canEdit}
                    value={template.landscape.rows}
                    onChange={(e) => {
                      if (!canEdit) return;
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setGridDimensions(
                        template.landscape.columns,
                        n,
                        'landscape'
                      );
                    }}
                  />
                </div>
              </div>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('props.hint', {
                default:
                  'Add widgets from the list; drag in the canvas to place or reorder.'
              })}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
