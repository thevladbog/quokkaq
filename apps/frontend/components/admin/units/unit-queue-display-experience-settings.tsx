'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, MonitorPlay } from 'lucide-react';
import { ExperienceTemplateSchema } from '@quokkaq/shared-types';
import {
  listScreenLayoutTemplates,
  getListScreenLayoutTemplatesQueryKey
} from '@/lib/api/generated/auth';
import {
  getGetUnitByIDQueryKey,
  usePatchUnitQueueDisplayExperience
} from '@/lib/api/generated/units';
import type { Unit } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface UnitQueueDisplayExperienceSettingsProps {
  unitId: string;
  unit: Unit;
}

type QueueTemplate = {
  id: string;
  name: string;
  variants: Array<{ id: string; label: string; width: number; height: number }>;
};

export function UnitQueueDisplayExperienceSettings({
  unitId,
  unit
}: UnitQueueDisplayExperienceSettingsProps) {
  const t = useTranslations('admin.units.queue_display_experience');
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState(
    unit.experienceTemplateId ?? 'legacy'
  );
  const [variantId, setVariantId] = useState(unit.experienceVariantId ?? '');

  const templatesQuery = useQuery({
    queryKey: getListScreenLayoutTemplatesQueryKey(),
    queryFn: () => listScreenLayoutTemplates()
  });

  const templates = useMemo<QueueTemplate[]>(() => {
    if (templatesQuery.data?.status !== 200) return [];
    return templatesQuery.data.data.flatMap((item) => {
      if (
        !item.id ||
        !item.name ||
        !item.publishedVersionId ||
        item.surface !== 'queue-display'
      )
        return [];
      const parsed = ExperienceTemplateSchema.safeParse(item.definition);
      if (!parsed.success || parsed.data.surface !== 'queue-display') return [];
      return [
        {
          id: item.id,
          name: item.name,
          variants: parsed.data.variants.map((variant) => ({
            id: variant.id,
            label: variant.profile.name,
            width: variant.profile.width,
            height: variant.profile.height
          }))
        }
      ];
    });
  }, [templatesQuery.data]);

  const selectedTemplate = templates.find((item) => item.id === templateId);
  const assignedTemplateMissing =
    templateId !== 'legacy' && !selectedTemplate && !templatesQuery.isLoading;
  const patchMutation = usePatchUnitQueueDisplayExperience();

  const save = () => {
    const nextTemplateId = templateId === 'legacy' ? null : templateId;
    const nextVariantId = nextTemplateId ? variantId || null : null;
    if (nextTemplateId && !nextVariantId) {
      toast.error(
        t('variant_required', { defaultValue: 'Choose a display profile.' })
      );
      return;
    }
    patchMutation.mutate(
      {
        unitId,
        data: {
          templateId: nextTemplateId,
          variantId: nextVariantId
        }
      },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: getGetUnitByIDQueryKey(unitId)
          });
          toast.success(
            t('saved', { defaultValue: 'Queue display assignment saved.' })
          );
        },
        onError: () =>
          toast.error(
            t('save_error', {
              defaultValue: 'Could not save queue display assignment.'
            })
          )
      }
    );
  };

  return (
    <Card data-testid='unit-queue-display-experience-settings'>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <MonitorPlay className='h-5 w-5' />
              {t('title', { defaultValue: 'Queue display experience' })}
            </CardTitle>
            <CardDescription>
              {t('description', {
                defaultValue:
                  'Choose the published composable screen used by queue displays in this unit. Legacy remains the safe default.'
              })}
            </CardDescription>
          </div>
          <Badge variant={templateId === 'legacy' ? 'secondary' : 'default'}>
            {templateId === 'legacy'
              ? t('legacy_badge', { defaultValue: 'Legacy' })
              : t('experience_badge', { defaultValue: 'Composable' })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {templatesQuery.isLoading ? (
          <p className='text-muted-foreground text-sm'>
            {t('loading', { defaultValue: 'Loading published experiences…' })}
          </p>
        ) : templates.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('empty', {
              defaultValue:
                'No published queue display experiences are available yet.'
            })}
          </p>
        ) : null}

        {assignedTemplateMissing ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('assigned_missing', {
                defaultValue:
                  'The assigned experience is no longer published. Select Legacy to clear this assignment.'
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='grid gap-4 md:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='queue-display-template'>
              {t('template_label', { defaultValue: 'Experience' })}
            </Label>
            <Select
              value={templateId}
              onValueChange={(value) => {
                setTemplateId(value);
                setVariantId('');
              }}
            >
              <SelectTrigger id='queue-display-template' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignedTemplateMissing ? (
                  <SelectItem value={templateId} disabled>
                    {t('assigned_missing_option', {
                      defaultValue: 'Assigned experience (no longer published)'
                    })}
                  </SelectItem>
                ) : null}
                <SelectItem value='legacy'>
                  {t('legacy_option', { defaultValue: 'Legacy queue display' })}
                </SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='queue-display-variant'>
              {t('variant_label', { defaultValue: 'Default display profile' })}
            </Label>
            <Select
              value={variantId}
              onValueChange={setVariantId}
              disabled={!selectedTemplate}
            >
              <SelectTrigger id='queue-display-variant' className='w-full'>
                <SelectValue
                  placeholder={t('variant_placeholder', {
                    defaultValue: 'Select a profile'
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {selectedTemplate?.variants.map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.label} · {variant.width}×{variant.height}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='flex items-center justify-between gap-4 border-t pt-4'>
          <p className='text-muted-foreground text-xs'>
            {t('fallback_hint', {
              defaultValue:
                'If the manifest is unavailable or invalid, the display automatically falls back to Legacy.'
            })}
          </p>
          <Button
            type='button'
            onClick={save}
            disabled={
              patchMutation.isPending ||
              templatesQuery.isLoading ||
              assignedTemplateMissing
            }
          >
            {patchMutation.isPending ? (
              t('saving', { defaultValue: 'Saving…' })
            ) : (
              <>
                <Check className='mr-2 h-4 w-4' />
                {t('save', { defaultValue: 'Save assignment' })}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
