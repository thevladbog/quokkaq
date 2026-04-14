'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  newGuestSurveyBlockId,
  type GuestSurveyBlockDraft,
  type GuestSurveyIconPreset,
  type GuestSurveyScalePresentation
} from '@/lib/guest-survey-blocks';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

type Props = {
  blocks: GuestSurveyBlockDraft[];
  onChange: (next: GuestSurveyBlockDraft[]) => void;
  idPrefix?: string;
};

function move<T>(arr: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  const t = next[index];
  const u = next[j];
  if (t === undefined || u === undefined) return arr;
  next[index] = u;
  next[j] = t;
  return next;
}

export function GuestSurveyBlocksEditor({
  blocks,
  onChange,
  idPrefix = 'gsb'
}: Props) {
  const t = useTranslations('admin.guest_survey');

  const addScale = () => {
    onChange([
      ...blocks,
      {
        kind: 'scale',
        id: newGuestSurveyBlockId(),
        labelEn: '',
        labelRu: '',
        min: 1,
        max: 5,
        presentation: 'numeric'
      }
    ]);
  };

  const addInfo = () => {
    onChange([
      ...blocks,
      {
        kind: 'info',
        id: newGuestSurveyBlockId(),
        labelEn: '',
        labelRu: ''
      }
    ]);
  };

  const updateAt = (index: number, patch: Partial<GuestSurveyBlockDraft>) => {
    const row = blocks[index];
    if (!row) return;
    const next = [...blocks];
    next[index] = { ...row, ...patch } as GuestSurveyBlockDraft;
    onChange(next);
  };

  const setKind = (index: number, kind: 'scale' | 'info') => {
    const row = blocks[index];
    if (!row) return;
    const base = { id: row.id, labelEn: row.labelEn, labelRu: row.labelRu };
    if (kind === 'info') {
      onChange(
        blocks.map((b, i) =>
          i === index ? ({ ...base, kind: 'info' } as GuestSurveyBlockDraft) : b
        )
      );
    } else {
      onChange(
        blocks.map((b, i) =>
          i === index
            ? ({
                ...base,
                kind: 'scale',
                min: 'min' in b ? b.min : 1,
                max: 'max' in b ? b.max : 5,
                presentation:
                  b.kind === 'scale' && b.presentation === 'icons'
                    ? 'icons'
                    : 'numeric',
                ...(b.kind === 'scale' &&
                b.presentation === 'icons' &&
                b.iconPreset
                  ? { iconPreset: b.iconPreset }
                  : {})
              } as GuestSurveyBlockDraft)
            : b
        )
      );
    }
  };

  const setScalePresentation = (
    index: number,
    presentation: GuestSurveyScalePresentation
  ) => {
    const row = blocks[index];
    if (!row || row.kind !== 'scale') return;
    if (presentation === 'icons') {
      updateAt(index, {
        presentation: 'icons',
        min: 1,
        max: 5,
        iconPreset: row.iconPreset ?? 'stars_gold'
      });
    } else {
      updateAt(index, {
        presentation: 'numeric',
        iconPreset: undefined
      });
    }
  };

  const setIconPreset = (index: number, preset: GuestSurveyIconPreset) => {
    updateAt(index, { iconPreset: preset });
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' size='sm' onClick={addScale}>
          <Plus className='mr-1 h-4 w-4' />
          {t('add_scale_block')}
        </Button>
        <Button type='button' variant='outline' size='sm' onClick={addInfo}>
          <Plus className='mr-1 h-4 w-4' />
          {t('add_info_block')}
        </Button>
      </div>

      <div className='space-y-4'>
        {blocks.map((block, index) => (
          <div
            key={index}
            className='border-border space-y-3 rounded-lg border p-4'
          >
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='grid w-full max-w-xs gap-1.5'>
                <Label className='text-xs'>{t('block_type')}</Label>
                <Select
                  value={block.kind}
                  onValueChange={(v) => setKind(index, v as 'scale' | 'info')}
                >
                  <SelectTrigger id={`${idPrefix}-type-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='scale'>
                      {t('block_type_scale')}
                    </SelectItem>
                    <SelectItem value='info'>{t('block_type_info')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='flex shrink-0 gap-1'>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-8 w-8'
                  disabled={index === 0}
                  onClick={() => onChange(move(blocks, index, -1))}
                  aria-label={t('move_up')}
                >
                  <ChevronUp className='h-4 w-4' />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-8 w-8'
                  disabled={index === blocks.length - 1}
                  onClick={() => onChange(move(blocks, index, 1))}
                  aria-label={t('move_down')}
                >
                  <ChevronDown className='h-4 w-4' />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='text-destructive h-8 w-8'
                  onClick={() => onChange(blocks.filter((_, i) => i !== index))}
                  aria-label={t('remove_block')}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            </div>

            <div className='grid gap-2'>
              <Label htmlFor={`${idPrefix}-id-${index}`} className='text-xs'>
                {t('block_id')}
              </Label>
              <Input
                id={`${idPrefix}-id-${index}`}
                value={block.id}
                onChange={(e) => updateAt(index, { id: e.target.value })}
                className='font-mono text-sm'
              />
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='grid gap-2'>
                <Label htmlFor={`${idPrefix}-en-${index}`}>
                  {t('label_en')}
                </Label>
                <Textarea
                  id={`${idPrefix}-en-${index}`}
                  value={block.labelEn}
                  onChange={(e) => updateAt(index, { labelEn: e.target.value })}
                  rows={block.kind === 'info' ? 4 : 2}
                  className='text-sm'
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor={`${idPrefix}-ru-${index}`}>
                  {t('label_ru')}
                </Label>
                <Textarea
                  id={`${idPrefix}-ru-${index}`}
                  value={block.labelRu}
                  onChange={(e) => updateAt(index, { labelRu: e.target.value })}
                  rows={block.kind === 'info' ? 4 : 2}
                  className='text-sm'
                />
              </div>
            </div>

            {block.kind === 'scale' ? (
              <div className='space-y-4'>
                <div className='grid w-full max-w-md gap-1.5'>
                  <Label className='text-xs'>
                    {t('scale_presentation_label')}
                  </Label>
                  <Select
                    value={block.presentation}
                    onValueChange={(v) =>
                      setScalePresentation(
                        index,
                        v as GuestSurveyScalePresentation
                      )
                    }
                  >
                    <SelectTrigger id={`${idPrefix}-presentation-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='numeric'>
                        {t('scale_presentation_numeric')}
                      </SelectItem>
                      <SelectItem value='icons'>
                        {t('scale_presentation_icons')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className='text-muted-foreground text-xs'>
                    {block.presentation === 'icons'
                      ? t('scale_icons_range_hint')
                      : t('scale_numeric_hint')}
                  </p>
                </div>
                {block.presentation === 'icons' ? (
                  <div className='grid w-full max-w-xs gap-1.5'>
                    <Label className='text-xs'>
                      {t('scale_icon_preset_label')}
                    </Label>
                    <Select
                      value={block.iconPreset ?? 'stars_gold'}
                      onValueChange={(v) =>
                        setIconPreset(index, v as GuestSurveyIconPreset)
                      }
                    >
                      <SelectTrigger id={`${idPrefix}-icon-preset-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='stars_gold'>
                          {t('scale_icon_preset_stars_gold')}
                        </SelectItem>
                        <SelectItem value='hearts_red'>
                          {t('scale_icon_preset_hearts_red')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className='grid max-w-xs grid-cols-2 gap-3'>
                    <div className='grid gap-2'>
                      <Label htmlFor={`${idPrefix}-min-${index}`}>
                        {t('scale_min')}
                      </Label>
                      <Input
                        id={`${idPrefix}-min-${index}`}
                        type='number'
                        inputMode='numeric'
                        min={0}
                        max={20}
                        value={block.min}
                        onChange={(e) =>
                          updateAt(index, {
                            min: Number.parseInt(e.target.value, 10) || 0
                          })
                        }
                      />
                    </div>
                    <div className='grid gap-2'>
                      <Label htmlFor={`${idPrefix}-max-${index}`}>
                        {t('scale_max')}
                      </Label>
                      <Input
                        id={`${idPrefix}-max-${index}`}
                        type='number'
                        inputMode='numeric'
                        min={0}
                        max={20}
                        value={block.max}
                        onChange={(e) =>
                          updateAt(index, {
                            max: Number.parseInt(e.target.value, 10) || 0
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
