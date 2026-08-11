'use client';

import type {
  ExperienceLayoutVariant,
  ExperienceWidget
} from '@quokkaq/shared-types';
import {
  Accessibility,
  Boxes,
  Link2,
  Palette,
  ShieldCheck
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { ConditionBuilder } from './condition-builder';
import { ConditionPreviewScenarios } from './condition-preview-scenarios';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { SharedWidgetUpdate } from '@/lib/stores/experience-builder-store';

type ExperiencePlacement = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

type SharedChanges = Pick<SharedWidgetUpdate, 'config' | 'actions' | 'access'>;

export type ExperienceInspectorProps = {
  pageId: string;
  widget: ExperienceWidget | undefined;
  variant: ExperienceLayoutVariant;
  placement: ExperiencePlacement | undefined;
  typographyScale?: number;
  canEdit?: boolean;
  serviceSettingsHref?: string;
  onSharedChange?: (changes: SharedChanges) => void;
  onPlacementChange?: (placement: ExperiencePlacement) => void;
  onTypographyScaleChange?: (scale: number | undefined) => void;
};

function titleFromWidget(widget: ExperienceWidget): string {
  const config = widget.config;
  return config !== null &&
    typeof config === 'object' &&
    !Array.isArray(config) &&
    typeof (config as Record<string, unknown>).title === 'string'
    ? ((config as Record<string, unknown>).title as string)
    : '';
}

function updateTitle(widget: ExperienceWidget, title: string): SharedChanges {
  const config =
    widget.config !== null &&
    typeof widget.config === 'object' &&
    !Array.isArray(widget.config)
      ? { ...(widget.config as Record<string, unknown>) }
      : {};
  return { config: { ...config, title } };
}

function Section({
  title,
  shared,
  children
}: {
  title: string;
  shared?: string;
  children: ReactNode;
}) {
  return (
    <section
      className='space-y-3 border-b pb-4 last:border-b-0'
      aria-label={title}
    >
      <div className='flex items-start justify-between gap-2'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        {shared ? (
          <span className='bg-muted text-muted-foreground rounded px-2 py-1 text-[11px]'>
            {shared}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function ExperienceInspector({
  pageId,
  widget,
  variant,
  placement,
  typographyScale,
  canEdit = true,
  serviceSettingsHref,
  onSharedChange,
  onPlacementChange,
  onTypographyScaleChange
}: ExperienceInspectorProps) {
  const t = useTranslations('experience.builder.task11');
  if (!widget) {
    return (
      <div className='space-y-3 p-4'>
        <h2 className='text-sm font-semibold'>
          {t('inspector.title', { default: 'Inspector' })}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {t('inspector.empty', {
            default:
              'Select a widget to edit its shared content and active layout.'
          })}
        </p>
      </div>
    );
  }
  const currentPlacement = placement ?? {
    col: 1,
    row: 1,
    colSpan: 1,
    rowSpan: 1
  };
  const profileLabel = variant.profile.name;
  const isServiceOwned =
    widget.type === 'service-picker' ||
    widget.type === 'ticket-form' ||
    widget.type === 'identify';
  const mediaConfig =
    widget.type === 'media' &&
    widget.config !== null &&
    typeof widget.config === 'object' &&
    !Array.isArray(widget.config)
      ? (widget.config as Record<string, unknown>)
      : undefined;
  const updatePlacement = (field: keyof ExperiencePlacement, raw: string) => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) return;
    onPlacementChange?.({ ...currentPlacement, [field]: value });
  };

  return (
    <div className='space-y-4 p-4'>
      <div className='flex items-center gap-2'>
        <Boxes className='size-4' aria-hidden />
        <h2 className='text-sm font-semibold'>
          {t('inspector.title', { default: 'Inspector' })}
        </h2>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t('inspector.selection', {
          default: 'Editing {widget} on {page}',
          widget: widget.type,
          page: pageId
        })}
      </p>
      <Separator />
      <Section
        title={t('inspector.content', { default: 'Content and data' })}
        shared={t('inspector.shared', { default: 'Shared across variants' })}
      >
        <Label className='text-xs' htmlFor={`experience-title-${widget.id}`}>
          {t('inspector.titleField', { default: 'Widget title' })}
        </Label>
        <Input
          id={`experience-title-${widget.id}`}
          aria-label={t('inspector.titleField', { default: 'Widget title' })}
          className='min-h-11'
          disabled={!canEdit}
          value={titleFromWidget(widget)}
          onChange={(event) =>
            onSharedChange?.(updateTitle(widget, event.target.value))
          }
        />
      </Section>
      <Section
        title={t('inspector.behavior', { default: 'Behavior and action' })}
        shared={t('inspector.shared', { default: 'Shared across variants' })}
      >
        {isServiceOwned ? (
          <div className='bg-muted rounded-md p-3 text-sm'>
            <p className='font-medium'>
              {t('inspector.serviceOwned', {
                default: 'Service-owned behavior'
              })}
            </p>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('inspector.serviceOwnedHint', {
                default:
                  'Information, requested fields, access policy and route stages belong to the service, not this widget.'
              })}
            </p>
            {serviceSettingsHref ? (
              <a
                className='text-primary focus-visible:ring-ring mt-3 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2'
                href={serviceSettingsHref}
              >
                <Link2 className='mr-2 size-4' aria-hidden />
                {t('inspector.openServiceSettings', {
                  default: 'Open service settings'
                })}
              </a>
            ) : null}
          </div>
        ) : (
          <div className='text-muted-foreground space-y-1 text-xs'>
            <p>
              {t('inspector.actionHint', {
                default:
                  'Actions remain shared and execute in their configured order.'
              })}
            </p>
            <p>
              {t('inspector.actionCount', {
                default: '{count} configured actions',
                count: widget.actions.length
              })}
            </p>
          </div>
        )}
      </Section>
      {mediaConfig ? (
        <Section
          title={t('inspector.media', { default: 'Media' })}
          shared={t('inspector.shared', { default: 'Shared across variants' })}
        >
          <Label
            className='text-xs'
            htmlFor={`experience-media-src-${widget.id}`}
          >
            {t('inspector.mediaSource', { default: 'Image URL' })}
            <Input
              id={`experience-media-src-${widget.id}`}
              aria-label={t('inspector.mediaSource', { default: 'Image URL' })}
              className='mt-1 min-h-11'
              type='url'
              disabled={!canEdit}
              value={typeof mediaConfig.src === 'string' ? mediaConfig.src : ''}
              onChange={(event) =>
                onSharedChange?.({
                  config: { ...mediaConfig, src: event.target.value }
                })
              }
            />
          </Label>
          <Label className='text-xs'>
            {t('inspector.mediaAlt', { default: 'Alternative text' })}
            <Input
              aria-label={t('inspector.mediaAlt', {
                default: 'Alternative text'
              })}
              className='mt-1 min-h-11'
              disabled={!canEdit}
              value={typeof mediaConfig.alt === 'string' ? mediaConfig.alt : ''}
              onChange={(event) =>
                onSharedChange?.({
                  config: { ...mediaConfig, alt: event.target.value }
                })
              }
            />
          </Label>
          <Label className='text-xs'>
            {t('inspector.mediaFit', { default: 'Image fit' })}
            <select
              aria-label={t('inspector.mediaFit', { default: 'Image fit' })}
              className='border-input bg-background mt-1 min-h-11 w-full rounded-md border px-3 text-sm'
              disabled={!canEdit}
              value={mediaConfig.fit === 'cover' ? 'cover' : 'contain'}
              onChange={(event) =>
                onSharedChange?.({
                  config: { ...mediaConfig, fit: event.target.value }
                })
              }
            >
              <option value='contain'>Contain</option>
              <option value='cover'>Cover</option>
            </select>
          </Label>
        </Section>
      ) : null}
      <Section
        title={t('inspector.access', { default: 'Visibility and access' })}
        shared={t('inspector.shared', { default: 'Shared across variants' })}
      >
        <ConditionBuilder
          value={widget.access}
          allowLock
          onChange={(access) => onSharedChange?.({ access: access ?? null })}
          disabled={!canEdit}
        />
        <ConditionPreviewScenarios policy={widget.access} />
      </Section>
      <Section
        title={t('inspector.layout', { default: 'Current variant layout' })}
        shared={profileLabel}
      >
        <div className='grid grid-cols-2 gap-2'>
          <Label className='text-xs'>
            {t('inspector.column', { default: 'Column' })}
            <Input
              aria-label={t('inspector.column', { default: 'Column' })}
              className='mt-1 min-h-11'
              type='number'
              min='1'
              max={variant.grid.columns}
              disabled={!canEdit}
              value={currentPlacement.col}
              onChange={(event) => updatePlacement('col', event.target.value)}
            />
          </Label>
          <Label className='text-xs'>
            {t('inspector.row', { default: 'Row' })}
            <Input
              aria-label={t('inspector.row', { default: 'Row' })}
              className='mt-1 min-h-11'
              type='number'
              min='1'
              max={variant.grid.rows}
              disabled={!canEdit}
              value={currentPlacement.row}
              onChange={(event) => updatePlacement('row', event.target.value)}
            />
          </Label>
          <Label className='text-xs'>
            {t('inspector.width', { default: 'Width' })}
            <Input
              aria-label={t('inspector.width', { default: 'Width' })}
              className='mt-1 min-h-11'
              type='number'
              min='1'
              max={variant.grid.columns}
              disabled={!canEdit}
              value={currentPlacement.colSpan}
              onChange={(event) =>
                updatePlacement('colSpan', event.target.value)
              }
            />
          </Label>
          <Label className='text-xs'>
            {t('inspector.height', { default: 'Height' })}
            <Input
              aria-label={t('inspector.height', { default: 'Height' })}
              className='mt-1 min-h-11'
              type='number'
              min='1'
              max={variant.grid.rows}
              disabled={!canEdit}
              value={currentPlacement.rowSpan}
              onChange={(event) =>
                updatePlacement('rowSpan', event.target.value)
              }
            />
          </Label>
        </div>
      </Section>
      <Section
        title={t('inspector.appearance', { default: 'Appearance' })}
        shared={t('inspector.shared', { default: 'Shared across variants' })}
      >
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <Palette className='size-4' aria-hidden />
          {t('inspector.appearanceHint', {
            default:
              'Use semantic widget tones. Per-tile colors are not available.'
          })}
        </div>
      </Section>
      <Section
        title={t('inspector.accessibility', { default: 'Accessibility' })}
        shared={profileLabel}
      >
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <Accessibility className='size-4' aria-hidden />
          {t('inspector.a11yHint', {
            default: 'Primary touch targets are validated at 56 px or larger.'
          })}
        </div>
        <Label className='text-xs'>
          {t('inspector.typographyScale', { default: 'Typography scale' })}
          <Input
            aria-label={t('inspector.typographyScale', {
              default: 'Typography scale'
            })}
            className='mt-1 min-h-11'
            type='number'
            min='0.5'
            max='2'
            step='0.05'
            disabled={!canEdit}
            value={typographyScale ?? ''}
            onChange={(event) => {
              const scale =
                event.target.value === ''
                  ? undefined
                  : Number(event.target.value);
              if (
                scale === undefined ||
                (Number.isFinite(scale) && scale >= 0.5 && scale <= 2)
              )
                onTypographyScaleChange?.(scale);
            }}
          />
        </Label>
      </Section>
      <div className='text-muted-foreground flex items-center gap-2 text-xs'>
        <ShieldCheck className='size-4' aria-hidden />
        {t('inspector.inheritanceNotice', {
          default:
            'Shared edits affect every layout; placement and typography apply only to the active profile.'
        })}
      </div>
    </div>
  );
}
