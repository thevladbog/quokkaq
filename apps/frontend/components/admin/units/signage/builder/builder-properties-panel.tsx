'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import type { ScreenTemplate } from '@quokkaq/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { widgetShortLabel } from './widget-preview';
import { CssColorField } from './css-color-field';
import {
  parseClockDisplayMode,
  type ClockTimeFormatMode
} from '@/lib/screen-clock-config';

const PROP_LABEL =
  'text-muted-foreground flex min-h-12 items-end text-xs leading-snug';

const LAYOUTS: Array<{ v: ScreenTemplate['layout']['type']; key: string }> = [
  { v: 'grid', key: 'props.layoutGrid' },
  { v: 'fullscreen', key: 'props.layoutFullscreen' },
  { v: 'split-h', key: 'props.layoutSplitH' },
  { v: 'split-v', key: 'props.layoutSplitV' }
];

type ScreenRegion = ScreenTemplate['layout']['regions'][number];

function LayoutTemplateIdField({
  templateId,
  canEdit,
  setTemplateId
}: {
  templateId: string;
  canEdit: boolean;
  setTemplateId: (id: string) => void;
}) {
  const t = useTranslations('admin.screenBuilder');
  const [layoutIdDraft, setLayoutIdDraft] = useState(templateId);

  const commitLayoutId = useCallback(() => {
    if (!canEdit) {
      return;
    }
    if (layoutIdDraft.trim() && layoutIdDraft !== templateId) {
      setTemplateId(layoutIdDraft.trim());
    } else {
      setLayoutIdDraft(templateId);
    }
  }, [canEdit, layoutIdDraft, setLayoutIdDraft, setTemplateId, templateId]);

  return (
    <div>
      <Label className='text-xs' htmlFor='tid'>
        {t('props.templateId', { default: 'Layout id' })}
      </Label>
      <Input
        id='tid'
        className='h-8 text-xs'
        value={layoutIdDraft}
        onChange={(e) => {
          setLayoutIdDraft(e.target.value);
        }}
        onBlur={commitLayoutId}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitLayoutId();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={!canEdit}
      />
    </div>
  );
}

function RegionPropertyFields({
  region,
  canEdit,
  setRegionSize,
  setRegionBackground,
  setRegionPanelStyle
}: {
  region: ScreenRegion;
  canEdit: boolean;
  setRegionSize: (id: string, size: string) => void;
  setRegionBackground: (id: string, color: string | null) => void;
  setRegionPanelStyle: (
    id: string,
    style: 'default' | 'card' | 'scrollPadded' | 'splitSection' | null
  ) => void;
}) {
  const t = useTranslations('admin.screenBuilder');
  const [regionSizeDraft, setRegionSizeDraft] = useState(region.size);
  const [regionBgDraft, setRegionBgDraft] = useState(
    region.backgroundColor ?? ''
  );

  const commitRegionSize = useCallback(() => {
    if (!canEdit) {
      return;
    }
    if (regionSizeDraft !== region.size) {
      setRegionSize(region.id, regionSizeDraft);
    }
  }, [canEdit, region.id, region.size, regionSizeDraft, setRegionSize]);

  const commitRegionBackground = useCallback(() => {
    if (!canEdit) {
      return;
    }
    const next = regionBgDraft.trim();
    const prev = region.backgroundColor?.trim() ?? '';
    if (next !== prev) {
      setRegionBackground(region.id, next || null);
    }
  }, [
    canEdit,
    region.backgroundColor,
    region.id,
    regionBgDraft,
    setRegionBackground
  ]);

  return (
    <div className='min-w-0 space-y-2 pt-1' role='tabpanel'>
      <p className='text-muted-foreground text-xs'>{`area: ${region.area}`}</p>
      <div>
        <Label className='text-xs' htmlFor='rs'>
          {t('props.regionSize', { default: 'Size (CSS)' })}
        </Label>
        <Input
          id='rs'
          className='h-8 font-mono text-xs'
          value={regionSizeDraft}
          onChange={(e) => {
            setRegionSizeDraft(e.target.value);
          }}
          onBlur={commitRegionSize}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitRegionSize();
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={!canEdit}
        />
      </div>
      <CssColorField
        id='rbg'
        label={t('props.regionBg', { default: 'Region background' })}
        value={regionBgDraft}
        placeholder='#0f172a or transparent'
        pickerFallback='#1e293b'
        disabled={!canEdit}
        onValueChange={(v) => {
          setRegionBgDraft(v);
        }}
        onWellChange={(hex) => {
          setRegionBgDraft(hex);
          if (canEdit) {
            setRegionBackground(region.id, hex);
          }
        }}
        onTextBlur={commitRegionBackground}
        onTextKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitRegionBackground();
            e.currentTarget.blur();
          }
        }}
      />
      <div>
        <Label className='text-xs' htmlFor='rp'>
          {t('props.panel', { default: 'Panel' })}
        </Label>
        <Select
          value={region.panelStyle ?? 'default'}
          onValueChange={(v) => {
            if (!canEdit) {
              return;
            }
            if (v === 'default') {
              setRegionPanelStyle(region.id, null);
            } else {
              setRegionPanelStyle(
                region.id,
                v as 'card' | 'scrollPadded' | 'splitSection'
              );
            }
          }}
          disabled={!canEdit}
        >
          <SelectTrigger id='rp' className='h-8 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='default'>
              {t('props.panelDefault', { default: 'Default' })}
            </SelectItem>
            <SelectItem value='card'>
              {t('props.panelCard', { default: 'Card' })}
            </SelectItem>
            <SelectItem value='scrollPadded'>
              {t('props.panelScroll', { default: 'Scroll' })}
            </SelectItem>
            <SelectItem value='splitSection'>
              {t('props.panelSection', { default: 'Section' })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
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
  const feedList: orval.ModelsExternalFeed[] = feedsRes?.data ?? [];

  const template = useScreenBuilderStore((s) => s.template);
  const selection = useScreenBuilderStore((s) => s.selection);
  const setLayoutType = useScreenBuilderStore((s) => s.setLayoutType);
  const setTemplateId = useScreenBuilderStore((s) => s.setTemplateId);
  const setRegionSize = useScreenBuilderStore((s) => s.setRegionSize);
  const setRegionPanelStyle = useScreenBuilderStore(
    (s) => s.setRegionPanelStyle
  );
  const setRegionBackground = useScreenBuilderStore(
    (s) => s.setRegionBackground
  );
  const updateWidget = useScreenBuilderStore((s) => s.updateWidget);
  const removeWidget = useScreenBuilderStore((s) => s.removeWidget);
  const moveWidget = useScreenBuilderStore((s) => s.moveWidget);
  const setSelection = useScreenBuilderStore((s) => s.setSelection);

  const wSel =
    selection.kind === 'widget'
      ? template.widgets.find((x) => x.id === selection.id)
      : null;
  const rSel =
    selection.kind === 'region'
      ? template.layout.regions.find((r) => r.id === selection.id)
      : null;

  const tab = wSel ? 'widget' : rSel ? 'region' : 'layout';
  return (
    <Card className='min-w-0 overflow-hidden'>
      <CardHeader className='pt-3 pb-2'>
        <CardTitle className='text-sm font-semibold'>
          {t('props.title', { default: 'Properties' })}
        </CardTitle>
      </CardHeader>
      <CardContent className='min-w-0 space-y-2 pb-3 text-sm'>
        <Tabs
          value={tab}
          onValueChange={() => {
            /* visual only; selection sets tab */
          }}
        >
          <TabsList className='grid w-full min-w-0 [grid-template-columns:repeat(3,minmax(0,1fr))] flex-wrap'>
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
              value='region'
              disabled={!rSel}
            >
              {t('props.regionTab', { default: 'Region' })}
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
          <div className='min-w-0 space-y-2 pt-1' role='tabpanel'>
            <p className='text-muted-foreground text-xs'>
              {widgetShortLabel(t, wSel.type)}
            </p>
            <div>
              <Label className='text-xs' htmlFor='widget-region'>
                {t('props.moveTo', { default: 'Region' })}
              </Label>
              <Select
                value={wSel.regionId}
                onValueChange={(v) => {
                  if (!canEdit) {
                    return;
                  }
                  const idx = useScreenBuilderStore
                    .getState()
                    .template.widgets.filter((q) => q.regionId === v).length;
                  moveWidget(wSel.id, v, idx);
                }}
                disabled={!canEdit}
              >
                <SelectTrigger
                  id='widget-region'
                  className='h-8 w-full min-w-0 text-xs'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {template.layout.regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.area} ({r.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {wSel.type === 'weather' || wSel.type === 'rss-feed' ? (
              <div>
                <Label className='text-xs' htmlFor='feed'>
                  {t('props.feed', { default: 'Feed' })}
                </Label>
                <Select
                  value={String(
                    (wSel.config as { feedId?: string } | undefined)?.feedId ||
                      '_none'
                  )}
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
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className='max-w-md'>
                    <SelectItem value='_none'>
                      {t('props.noFeed', { default: '—' })}
                    </SelectItem>
                    {feedList
                      .filter((f) => {
                        if (wSel.type === 'weather') {
                          return f.type === 'weather' && f.id;
                        }
                        return f.type === 'rss' && f.id;
                      })
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id!}>
                          {f.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {wSel.type === 'custom-html' ? (
              <div>
                <Label className='text-xs' htmlFor='html'>
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
              <div className='flex items-center justify-between gap-2 py-0.5'>
                <Label htmlFor='ov' className='text-xs'>
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
              <div className='flex min-w-0 flex-col gap-1.5'>
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
              <div className='flex min-w-0 flex-col gap-1.5'>
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
              <div className='flex min-w-0 flex-col gap-1.5'>
                <Label className={PROP_LABEL} htmlFor='ww'>
                  {t('props.sizeWidth', { default: 'Width' })}
                </Label>
                <Input
                  id='ww'
                  className='h-8 text-xs'
                  disabled={!canEdit}
                  placeholder='100%'
                  value={wSel.size?.width ?? ''}
                  onChange={(e) => {
                    if (!canEdit) {
                      return;
                    }
                    updateWidget(wSel.id, {
                      size: { ...wSel.size, width: e.target.value || undefined }
                    });
                  }}
                />
              </div>
              <div className='flex min-w-0 flex-col gap-1.5'>
                <Label className={PROP_LABEL} htmlFor='wh'>
                  {t('props.sizeHeight', { default: 'Height' })}
                </Label>
                <Input
                  id='wh'
                  className='h-8 text-xs'
                  disabled={!canEdit}
                  placeholder='auto'
                  value={wSel.size?.height ?? ''}
                  onChange={(e) => {
                    if (!canEdit) {
                      return;
                    }
                    updateWidget(wSel.id, {
                      size: {
                        ...wSel.size,
                        height: e.target.value || undefined
                      }
                    });
                  }}
                />
              </div>
            </div>
            {wSel.type === 'clock' ? (
              <div className='flex min-w-0 flex-col gap-1.5'>
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
              <div className='flex items-center justify-between gap-2 py-0.5'>
                <Label htmlFor='eta' className='text-xs'>
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
              <div>
                <Label className='text-xs' htmlFor='an'>
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
            {wSel.position ? (
              <p
                className='text-muted-foreground text-xs'
                aria-live='polite'
              >{`x: ${wSel.position.x ?? 0} y: ${wSel.position.y ?? 0}`}</p>
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

        {rSel && !wSel && (
          <RegionPropertyFields
            key={`${rSel.id}-${rSel.size}-${rSel.backgroundColor ?? ''}`}
            region={rSel}
            canEdit={canEdit}
            setRegionSize={setRegionSize}
            setRegionBackground={setRegionBackground}
            setRegionPanelStyle={setRegionPanelStyle}
          />
        )}

        {!rSel && !wSel && (
          <div className='min-w-0 space-y-2 pt-1' role='tabpanel'>
            <LayoutTemplateIdField
              key={template.id}
              templateId={template.id}
              canEdit={canEdit}
              setTemplateId={setTemplateId}
            />
            <div>
              <Label className='text-xs' htmlFor='ltype'>
                {t('props.layout', { default: 'Structure' })}
              </Label>
              <Select
                value={template.layout.type}
                onValueChange={(v) => {
                  if (!canEdit) {
                    return;
                  }
                  setLayoutType(
                    (v in { grid: 1, fullscreen: 1, 'split-h': 1, 'split-v': 1 }
                      ? v
                      : 'grid') as 'grid' | 'fullscreen' | 'split-h' | 'split-v'
                  );
                }}
                disabled={!canEdit}
              >
                <SelectTrigger id='ltype' className='h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUTS.map((l) => (
                    <SelectItem key={l.v} value={l.v}>
                      {t(l.key, { default: l.v })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('props.hint', {
                default:
                  'Add widgets from the list; drag in the canvas to place or reorder.'
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
