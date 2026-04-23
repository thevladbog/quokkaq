'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { useShallow } from 'zustand/react/shallow';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';
import { SCREEN_TEMPLATE_PRESET_KEYS as PRESET_KEYS } from '@/lib/screen-template-from-unit';
import { Redo2, Save, Undo2, ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
  /** Live preview in dock */
  showPreview: boolean;
  onTogglePreview: () => void;
  /** When false, preset picker is hidden (preset is chosen on the unit Layout tab). */
  showPresetPicker?: boolean;
  sourcePresetId: string | null;
  onLoadPreset: (k: (typeof PRESET_KEYS)[number]) => void;
};

export function BuilderToolbar({
  canSave,
  isSaving,
  onSave,
  showPreview,
  onTogglePreview,
  showPresetPicker = true,
  sourcePresetId,
  onLoadPreset
}: Props) {
  const t = useTranslations('admin.signage');
  const tb = useTranslations('admin.screenBuilder');
  const [zoom, undo, redo, isDirty, historyIndex, history] =
    useScreenBuilderStore(
      useShallow((s) => [
        s.zoom,
        s.undo,
        s.redo,
        s.isDirty,
        s.historyIndex,
        s.history
      ])
    );
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const setZoom = useScreenBuilderStore((s) => s.setZoom);

  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
      <div className='space-y-1.5 sm:min-w-0 sm:flex-1'>
        {showPresetPicker ? (
          <>
            <Label
              className='text-foreground/90'
              htmlFor='builder-preset-boost'
            >
              {tb('toolbar.loadPreset', { default: 'Load from preset' })}
            </Label>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3'>
              <Select
                value={sourcePresetId ?? 'info-heavy'}
                aria-label={tb('toolbar.loadPreset', {
                  default: 'Load from preset'
                })}
                onValueChange={(v) => {
                  onLoadPreset(
                    (v in SCREEN_TEMPLATE_PRESETS
                      ? v
                      : 'info-heavy') as (typeof PRESET_KEYS)[number]
                  );
                }}
              >
                <SelectTrigger
                  id='builder-preset-boost'
                  className='w-full min-w-0 sm:max-w-md'
                >
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
          </>
        ) : null}
        <p className='text-muted-foreground text-xs' aria-live='polite'>
          {isDirty
            ? tb('toolbar.unsaved', { default: 'Unsaved' })
            : tb('toolbar.saved', { default: 'In sync with last apply' })}
        </p>
      </div>

      <div className='flex flex-wrap items-center gap-2 sm:shrink-0 md:max-w-full'>
        <div className='text-muted-foreground flex items-center gap-1.5 pr-1 text-sm'>
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='h-8 w-8'
            onClick={() => {
              setZoom(zoom * 0.9);
            }}
            aria-label={tb('toolbar.zoomOut', { default: 'Zoom out' })}
            title={tb('toolbar.zoomOut', { default: 'Zoom out' })}
          >
            <ZoomOut className='h-3.5 w-3.5' />
          </Button>
          <span className='w-9 text-center' aria-live='polite'>
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='h-8 w-8'
            onClick={() => {
              setZoom(zoom * 1.1);
            }}
            aria-label={tb('toolbar.zoomIn', { default: 'Zoom in' })}
            title={tb('toolbar.zoomIn', { default: 'Zoom in' })}
          >
            <ZoomIn className='h-3.5 w-3.5' />
          </Button>
        </div>

        <Button
          type='button'
          variant='outline'
          className='gap-1.5'
          onClick={onTogglePreview}
          title={
            showPreview
              ? tb('toolbar.hidePreview', { default: 'Hide live preview' })
              : tb('toolbar.showPreview', { default: 'Show live preview' })
          }
        >
          {showPreview ? (
            <EyeOff className='h-3.5 w-3.5' />
          ) : (
            <Eye className='h-3.5 w-3.5' />
          )}
          {showPreview
            ? tb('toolbar.hidePreview', { default: 'Hide live' })
            : tb('toolbar.showPreview', { default: 'Show live' })}
        </Button>

        <div
          className='bg-border mx-0.5 hidden h-6 w-px sm:block'
          aria-hidden
        />

        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={undo}
          disabled={!canUndo}
          aria-label={tb('toolbar.undo', { default: 'Undo' })}
          className='h-8 w-8'
        >
          <Undo2 className='h-3.5 w-3.5' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={redo}
          disabled={!canRedo}
          aria-label={tb('toolbar.redo', { default: 'Redo' })}
          className='h-8 w-8'
        >
          <Redo2 className='h-3.5 w-3.5' />
        </Button>

        <Button
          type='button'
          onClick={onSave}
          disabled={isSaving || !isDirty || !canSave}
          className={cn(
            'gap-1.5',
            (isSaving || !canSave) && 'pointer-events-auto'
          )}
        >
          <Save className='h-3.5 w-3.5' />
          {t('applyLayout', { default: 'Apply' })}
        </Button>
      </div>
    </div>
  );
}
