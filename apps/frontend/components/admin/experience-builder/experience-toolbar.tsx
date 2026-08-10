'use client';

import type { ExperienceLayoutVariant } from '@quokkaq/shared-types';
import { Eye, Redo2, Save, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type ExperienceToolbarProps = {
  variants: readonly ExperienceLayoutVariant[];
  activeVariantId: string;
  zoom: number;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canEdit?: boolean;
  saveDisabled?: boolean;
  publishDisabled?: boolean;
  onVariantChange: (variantId: string) => void;
  onZoomChange: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPreview?: () => void;
  onSaveDraft?: () => void;
  onPublish?: () => void;
};

export function ExperienceToolbar({
  variants,
  activeVariantId,
  zoom,
  isDirty,
  canUndo,
  canRedo,
  canEdit = true,
  saveDisabled = false,
  publishDisabled = false,
  onVariantChange,
  onZoomChange,
  onUndo,
  onRedo,
  onPreview,
  onSaveDraft,
  onPublish
}: ExperienceToolbarProps) {
  const t = useTranslations('experience.builder');
  return (
    <header className='bg-background border-b px-4 py-2.5'>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <Badge
          variant={isDirty ? 'secondary' : 'outline'}
          className='h-7 gap-1.5 px-2'
        >
          <span
            className={isDirty ? 'bg-amber-500' : 'bg-emerald-500'}
            aria-hidden
          />
          {isDirty
            ? t('toolbar.draft', { default: 'Unpublished draft' })
            : t('toolbar.saved', { default: 'Draft saved' })}
        </Badge>
        <label className='ml-1 flex h-10 min-w-0 items-center gap-2'>
          <span className='sr-only'>
            {t('toolbar.variant', { default: 'Layout variant' })}
          </span>
          <select
            aria-label={t('toolbar.variant', { default: 'Layout variant' })}
            className='border-input bg-background focus-visible:ring-ring h-11 min-w-48 rounded-md border px-2 text-sm outline-none focus-visible:ring-2'
            value={activeVariantId}
            onChange={(event) => onVariantChange(event.target.value)}
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.profile.name} · {variant.profile.width}×
                {variant.profile.height}
              </option>
            ))}
          </select>
        </label>
        <div className='flex items-center rounded-md border p-0.5'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='min-h-11 min-w-11'
            aria-label={t('toolbar.zoomOut', { default: 'Zoom out' })}
            disabled={!canEdit}
            onClick={() => onZoomChange(Math.max(0.5, zoom - 0.1))}
          >
            <ZoomOut />
          </Button>
          <span
            aria-live='polite'
            className='w-11 text-center text-xs tabular-nums'
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='min-h-11 min-w-11'
            aria-label={t('toolbar.zoomIn', { default: 'Zoom in' })}
            disabled={!canEdit}
            onClick={() => onZoomChange(Math.min(1.25, zoom + 0.1))}
          >
            <ZoomIn />
          </Button>
        </div>
        <div className='flex items-center rounded-md border p-0.5'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='min-h-11 min-w-11'
            aria-label={t('toolbar.undo', { default: 'Undo' })}
            disabled={!canUndo || !canEdit}
            onClick={onUndo}
          >
            <Undo2 />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='min-h-11 min-w-11'
            aria-label={t('toolbar.redo', { default: 'Redo' })}
            disabled={!canRedo || !canEdit}
            onClick={onRedo}
          >
            <Redo2 />
          </Button>
        </div>
        <div className='ml-auto flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            className='min-h-11'
            onClick={onPreview}
          >
            <Eye />
            {t('toolbar.preview', { default: 'Preview' })}
          </Button>
          <Button
            type='button'
            variant='outline'
            className='min-h-11'
            disabled={!canEdit || !isDirty || saveDisabled}
            onClick={onSaveDraft}
          >
            <Save />
            {t('toolbar.save', { default: 'Save draft' })}
          </Button>
          <Button
            type='button'
            className='min-h-11'
            disabled={!canEdit || publishDisabled}
            onClick={onPublish}
          >
            {t('toolbar.publish', { default: 'Publish' })}
          </Button>
        </div>
      </div>
    </header>
  );
}
