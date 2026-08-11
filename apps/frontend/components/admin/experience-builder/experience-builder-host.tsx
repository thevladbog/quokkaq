'use client';

import { useEffect, useState } from 'react';
import type { ExperienceTemplate } from '@quokkaq/shared-types';
import {
  createScreenLayoutTemplate,
  listScreenLayoutTemplates,
  type ModelsScreenLayoutTemplate
} from '@/lib/api/generated/auth';
import {
  parseExperienceDefinition,
  publishExperienceTemplate,
  updateExperienceDraft
} from '@/lib/experience/experience-api';
import { useExperienceBuilderStore } from '@/lib/stores/experience-builder-store';
import { CreateExperienceDialog } from './create-experience-dialog';
import { ExperienceBuilderShell } from './experience-builder-shell';
import { useTranslations } from 'next-intl';

function templateFromApi(
  template: ModelsScreenLayoutTemplate
): ExperienceTemplate | null {
  if (!template.id || !template.definition) return null;
  const parsed = parseExperienceDefinition(template.definition);
  return parsed.kind === 'valid' ? parsed.template : null;
}

export function ExperienceBuilderHost() {
  const t = useTranslations('experience.builder');
  const loadDraft = useExperienceBuilderStore((state) => state.loadDraft);
  const [templates, setTemplates] = useState<ModelsScreenLayoutTemplate[]>([]);
  const [selected, setSelected] = useState<ModelsScreenLayoutTemplate | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await listScreenLayoutTemplates();
      if (response.status !== 200)
        throw new Error('Could not load experiences');
      setTemplates(response.data);
      setSelected((current) =>
        current
          ? (response.data.find((item) => item.id === current.id) ?? null)
          : current
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not load experiences'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const draft = selected ? templateFromApi(selected) : null;
    if (draft) loadDraft(draft);
  }, [loadDraft, selected]);

  const create = async (draft: ExperienceTemplate) => {
    setError(null);
    try {
      const response = await createScreenLayoutTemplate({
        name: draft.id,
        surface: draft.surface,
        definition: draft
      });
      if (response.status !== 201)
        throw new Error('Could not create experience');
      setTemplates((current) => [...current, response.data]);
      setSelected(response.data);
      setCreateOpen(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not create experience'
      );
    }
  };

  if (loading) {
    return (
      <div className='p-6'>
        {t('host.loading', { default: 'Loading experiences…' })}
      </div>
    );
  }

  if (!selected) {
    return (
      <main
        className='space-y-6 p-6'
        aria-label={t('host.label', { default: 'Experience templates' })}
      >
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-semibold'>
              {t('host.title', { default: 'Experiences' })}
            </h1>
            <p className='text-muted-foreground mt-1'>
              {t('host.description', {
                default: 'Design reusable screen experiences for devices.'
              })}
            </p>
          </div>
          <button
            type='button'
            className='bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium'
            onClick={() => setCreateOpen(true)}
          >
            {t('create.open', { default: 'Create experience' })}
          </button>
        </div>
        {error ? <p role='alert'>{error}</p> : null}
        <div className='grid gap-3'>
          {templates.map((template) => (
            <button
              type='button'
              key={template.id}
              className='hover:bg-muted/50 rounded-lg border p-4 text-left'
              onClick={() => setSelected(template)}
            >
              <span className='font-medium'>
                {template.name ?? template.id}
              </span>
              <span className='text-muted-foreground ml-2 text-sm'>
                {template.surface ??
                  t('host.unknownSurface', { default: 'unknown surface' })}
              </span>
            </button>
          ))}
        </div>
        <CreateExperienceDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={(draft) => void create(draft)}
        />
      </main>
    );
  }

  const selectedDraft = templateFromApi(selected);
  if (!selectedDraft) {
    return (
      <p role='alert'>
        {t('host.invalidDefinition', {
          default: 'This experience definition is invalid.'
        })}
      </p>
    );
  }

  return (
    <ExperienceBuilderShell
      onBack={() => setSelected(null)}
      onSaveDraft={async (draft) => {
        const result = await updateExperienceDraft(selected.id!, {
          name: selected.name,
          definition: draft
        });
        if (result.kind === 'valid') {
          setSelected((current) =>
            current ? { ...current, definition: result.template } : current
          );
        }
        return result;
      }}
      onPublish={async () => publishExperienceTemplate(selected.id!)}
      serviceSettingsHref='/settings/units'
    />
  );
}
