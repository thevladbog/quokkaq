'use client';

import type {
  ConditionContext,
  ExperienceLayoutVariant,
  ExperienceTemplate
} from '@quokkaq/shared-types';
import { Maximize2, Shield, Shrink, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ConditionPreviewScenarios } from './condition-preview-scenarios';

export type ExperiencePreviewRenderProps = {
  draft: ExperienceTemplate;
  variant: ExperienceLayoutVariant;
  scale: 'fit' | '100';
  showSafeArea: boolean;
  /** Synthetic-only condition context reserved for Task 12's runtime renderer. */
  scenarioContext: ConditionContext;
};

export type ExperiencePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ExperienceTemplate;
  activeVariantId: string;
  publishedDefinition: ExperienceTemplate | null;
  renderPreview?: (props: ExperiencePreviewRenderProps) => ReactNode;
};

function defaultPreview({
  draft,
  variant,
  scale,
  showSafeArea
}: ExperiencePreviewRenderProps) {
  const page =
    draft.pages.find((candidate) => candidate.id === draft.startPageId) ??
    draft.pages[0];
  const safe = variant.profile.safeArea;
  return (
    <div
      className='border-border bg-background relative mx-auto overflow-hidden rounded-[1.5rem] border-2 shadow-sm'
      data-testid='experience-preview-surface'
      data-scale={scale}
      style={{
        width: scale === '100' ? variant.profile.width : 'min(100%, 530px)',
        aspectRatio: `${variant.profile.width}/${variant.profile.height}`
      }}
    >
      {showSafeArea ? (
        <div
          data-testid='experience-preview-safe-area'
          className='pointer-events-none absolute z-10 border border-dashed border-emerald-600/70'
          style={{
            top: `${(safe.top / variant.profile.height) * 100}%`,
            right: `${(safe.right / variant.profile.width) * 100}%`,
            bottom: `${(safe.bottom / variant.profile.height) * 100}%`,
            left: `${(safe.left / variant.profile.width) * 100}%`
          }}
        />
      ) : null}
      <div className='flex h-full flex-col p-[8%]'>
        <div className='flex items-center justify-between text-[clamp(10px,2vw,16px)] font-medium'>
          <span>{draft.surface}</span>
          <span>14:32</span>
        </div>
        <h3 className='mt-[10%] text-[clamp(20px,5vw,42px)] font-semibold'>
          {page?.name ?? 'Preview'}
        </h3>
        <div className='mt-6 grid flex-1 grid-cols-2 gap-3'>
          {page?.widgets.map((widget) => (
            <div
              key={widget.id}
              className='flex min-h-16 items-end rounded-xl border p-3 text-[clamp(10px,2vw,16px)] font-medium'
            >
              {widget.type}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function definitionsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) => definitionsEqual(value, right[index]))
    );
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        Object.hasOwn(right, key) &&
        definitionsEqual(left[key], right[key])
    )
  );
}

function definitionsMatch(
  draft: ExperienceTemplate,
  published: ExperienceTemplate | null
): boolean {
  return published !== null && definitionsEqual(draft, published);
}

export function ExperiencePreviewDialog({
  open,
  onOpenChange,
  draft,
  activeVariantId,
  publishedDefinition,
  renderPreview = defaultPreview
}: ExperiencePreviewDialogProps) {
  const t = useTranslations('experience.builder.task11');
  const [scale, setScale] = useState<'fit' | '100'>('fit');
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [scenarioContext, setScenarioContext] = useState<ConditionContext>({
    identity: { isAuthenticated: false, isEmployee: false, groups: [] },
    live: { queueLength: 0, isOpen: true, isConnected: true },
    session: { selectedServiceId: null }
  });
  const variant = useMemo(
    () =>
      draft.variants.find((candidate) => candidate.id === activeVariantId) ??
      draft.variants[0]!,
    [draft.variants, activeVariantId]
  );
  const isDraftPreview = !definitionsMatch(draft, publishedDefinition);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] max-w-[min(1120px,calc(100%-2rem))] overflow-y-auto p-0'>
        <DialogHeader className='border-b p-5 pr-14'>
          <DialogTitle>
            {t('preview.title', { default: 'Full-device preview' })}
          </DialogTitle>
          <DialogDescription>
            {variant.profile.name} · {variant.profile.width}×
            {variant.profile.height}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]'>
          <div className='bg-muted/30 min-w-0 overflow-auto rounded-lg p-5'>
            {isDraftPreview ? (
              <div className='mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'>
                <Shield className='size-4' aria-hidden />
                {t('preview.draftBanner', {
                  default: 'Draft preview — this is not running on devices.'
                })}
              </div>
            ) : (
              <div className='mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'>
                {t('preview.publishedBanner', {
                  default: 'Matches the currently published definition.'
                })}
              </div>
            )}
            {renderPreview({
              draft,
              variant,
              scale,
              showSafeArea,
              scenarioContext
            })}
          </div>
          <aside
            className='space-y-4'
            aria-label={t('preview.controls', { default: 'Preview controls' })}
          >
            <fieldset className='space-y-2 rounded-md border p-3'>
              <legend className='px-1 text-xs font-medium'>
                {t('preview.scale', { default: 'Scale' })}
              </legend>
              <Button
                type='button'
                variant={scale === 'fit' ? 'secondary' : 'outline'}
                className='min-h-11 w-full'
                onClick={() => setScale('fit')}
              >
                <Shrink aria-hidden />
                {t('preview.fit', { default: 'Fit to window' })}
              </Button>
              <Button
                type='button'
                variant={scale === '100' ? 'secondary' : 'outline'}
                className='min-h-11 w-full'
                onClick={() => setScale('100')}
              >
                <Maximize2 aria-hidden />
                {t('preview.full', { default: '100% scale' })}
              </Button>
            </fieldset>
            <label className='flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm'>
              <input
                aria-label={t('preview.safeArea', {
                  default: 'Safe area overlay'
                })}
                type='checkbox'
                className='size-4'
                checked={showSafeArea}
                onChange={(event) => setShowSafeArea(event.target.checked)}
              />
              {t('preview.safeArea', { default: 'Safe area overlay' })}
            </label>
            <ConditionPreviewScenarios
              policy={undefined}
              onContextChange={setScenarioContext}
            />
            <Button
              type='button'
              variant='outline'
              className='min-h-11 w-full'
              onClick={() => onOpenChange(false)}
            >
              <X aria-hidden />
              {t('preview.close', { default: 'Close preview' })}
            </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
