'use client';

import type {
  ExperienceSurface,
  ExperienceWidget
} from '@quokkaq/shared-types';
import { Image, Info, Keyboard, ListTree, Plus, Ticket } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type CatalogGroup = 'queue' | 'information' | 'media' | 'navigation' | 'input';

export type ExperienceCatalogEntry = {
  type: ExperienceWidget['type'];
  group: CatalogGroup;
  surfaces: readonly ExperienceSurface[];
  labelKey: string;
  descriptionKey: string;
  label: string;
  description: string;
};

export const EXPERIENCE_WIDGET_CATALOG: readonly ExperienceCatalogEntry[] = [
  {
    type: 'service-picker',
    group: 'queue',
    surfaces: ['ticket-station', 'visitor-mobile'],
    labelKey: 'catalog.widgets.servicePicker.label',
    descriptionKey: 'catalog.widgets.servicePicker.description',
    label: 'Service picker',
    description: 'Categories and services'
  },
  {
    type: 'called-tickets',
    group: 'queue',
    surfaces: ['queue-display', 'counter-display'],
    labelKey: 'catalog.widgets.calledTickets.label',
    descriptionKey: 'catalog.widgets.calledTickets.description',
    label: 'Called tickets',
    description: 'Current queue calls'
  },
  {
    type: 'queue-stats',
    group: 'queue',
    surfaces: ['queue-display', 'counter-display'],
    labelKey: 'catalog.widgets.queueStats.label',
    descriptionKey: 'catalog.widgets.queueStats.description',
    label: 'Queue stats',
    description: 'Waiting and service metrics'
  },
  {
    type: 'rich-info',
    group: 'information',
    surfaces: [
      'ticket-station',
      'queue-display',
      'counter-display',
      'visitor-mobile'
    ],
    labelKey: 'catalog.widgets.richInfo.label',
    descriptionKey: 'catalog.widgets.richInfo.description',
    label: 'Information',
    description: 'Guidance and instructions'
  },
  {
    type: 'screen-header',
    group: 'information',
    surfaces: ['ticket-station', 'queue-display', 'counter-display'],
    labelKey: 'catalog.widgets.header.label',
    descriptionKey: 'catalog.widgets.header.description',
    label: 'Header',
    description: 'Venue and status header'
  },
  {
    type: 'media',
    group: 'media',
    surfaces: [
      'ticket-station',
      'queue-display',
      'counter-display',
      'visitor-mobile'
    ],
    labelKey: 'catalog.widgets.media.label',
    descriptionKey: 'catalog.widgets.media.description',
    label: 'Media',
    description: 'Image or managed media'
  },
  {
    type: 'content-player',
    group: 'media',
    surfaces: ['queue-display', 'counter-display'],
    labelKey: 'catalog.widgets.contentPlayer.label',
    descriptionKey: 'catalog.widgets.contentPlayer.description',
    label: 'Content player',
    description: 'Scheduled signage content'
  },
  {
    type: 'language-switch',
    group: 'navigation',
    surfaces: ['ticket-station', 'visitor-mobile'],
    labelKey: 'catalog.widgets.languageSwitch.label',
    descriptionKey: 'catalog.widgets.languageSwitch.description',
    label: 'Language switch',
    description: 'Select the active locale'
  },
  {
    type: 'ticket-success',
    group: 'navigation',
    surfaces: ['ticket-station', 'visitor-mobile'],
    labelKey: 'catalog.widgets.ticketSuccess.label',
    descriptionKey: 'catalog.widgets.ticketSuccess.description',
    label: 'Ticket success',
    description: 'End-of-flow confirmation'
  },
  {
    type: 'ticket-form',
    group: 'input',
    surfaces: ['ticket-station', 'visitor-mobile'],
    labelKey: 'catalog.widgets.ticketForm.label',
    descriptionKey: 'catalog.widgets.ticketForm.description',
    label: 'Ticket form',
    description: 'Service-owned visitor fields'
  },
  {
    type: 'identify',
    group: 'input',
    surfaces: ['ticket-station'],
    labelKey: 'catalog.widgets.identify.label',
    descriptionKey: 'catalog.widgets.identify.description',
    label: 'Identify visitor',
    description: 'Badge, login, or document step'
  }
];

const GROUPS: readonly {
  id: CatalogGroup;
  icon: typeof Ticket;
  label: string;
}[] = [
  { id: 'queue', icon: Ticket, label: 'Queue' },
  { id: 'information', icon: Info, label: 'Information' },
  { id: 'media', icon: Image, label: 'Media' },
  { id: 'navigation', icon: ListTree, label: 'Navigation' },
  { id: 'input', icon: Keyboard, label: 'Input' }
];

export function experienceWidgetTitle(
  widget: ExperienceWidget,
  translate?: (entry: ExperienceCatalogEntry) => string
): string {
  const configured = widget.config.title;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return configured;
  }
  const entry = EXPERIENCE_WIDGET_CATALOG.find(
    (candidate) => candidate.type === widget.type
  );
  return entry ? (translate?.(entry) ?? entry.label) : widget.type;
}

export type ExperienceCatalogTranslation = (
  key: string,
  values?: { default?: string }
) => string;

export function searchCatalogEntries(
  surface: ExperienceSurface,
  query: string,
  translate: ExperienceCatalogTranslation
): ExperienceCatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  return EXPERIENCE_WIDGET_CATALOG.filter((entry) => {
    if (!entry.surfaces.includes(surface)) return false;
    if (normalized === '') return true;
    const label = translate(entry.labelKey, { default: entry.label });
    const description = translate(entry.descriptionKey, {
      default: entry.description
    });
    return `${label} ${description}`.toLocaleLowerCase().includes(normalized);
  });
}

export type ExperienceWidgetCatalogProps = {
  surface: ExperienceSurface;
  canEdit?: boolean;
  disabled?: boolean;
  onAdd: (type: ExperienceWidget['type']) => void;
};

export function ExperienceWidgetCatalog({
  surface,
  canEdit = true,
  disabled = false,
  onAdd
}: ExperienceWidgetCatalogProps) {
  const t = useTranslations('experience.builder');
  const [query, setQuery] = useState('');
  const mutationDisabled = disabled || !canEdit;
  const translateCatalogEntry = useCallback<ExperienceCatalogTranslation>(
    (key, values) =>
      values?.default === undefined
        ? t(key)
        : t(key, { default: values.default }),
    [t]
  );
  const entries = useMemo(
    () => searchCatalogEntries(surface, query, translateCatalogEntry),
    [query, surface, translateCatalogEntry]
  );

  return (
    <section
      aria-label={t('catalog.label', { default: 'Add widgets' })}
      className='flex min-h-0 flex-1 flex-col'
    >
      <div className='border-b p-3'>
        <label className='sr-only' htmlFor='experience-widget-search'>
          {t('catalog.searchLabel', { default: 'Search widgets' })}
        </label>
        <Input
          id='experience-widget-search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('catalog.search', { default: 'Search widgets' })}
          className='min-h-11'
        />
      </div>
      <div className='min-h-0 space-y-5 overflow-y-auto p-3'>
        {GROUPS.map(({ id, icon: Icon, label }) => {
          const groupEntries = entries.filter((entry) => entry.group === id);
          const groupLabel = t(`catalog.groups.${id}`, { default: label });
          return (
            <section key={id} aria-label={groupLabel}>
              <div className='text-muted-foreground mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] uppercase'>
                <Icon className='size-3.5' aria-hidden />
                {groupLabel}
              </div>
              {groupEntries.length === 0 ? (
                <p className='text-muted-foreground px-1 text-xs'>
                  {t('catalog.none', {
                    default: 'Not available on this surface.'
                  })}
                </p>
              ) : (
                <div className='space-y-1'>
                  {groupEntries.map((entry) => (
                    <Button
                      key={entry.type}
                      type='button'
                      variant='ghost'
                      disabled={mutationDisabled}
                      onClick={() => {
                        if (!mutationDisabled) onAdd(entry.type);
                      }}
                      className={cn(
                        'h-auto min-h-12 w-full justify-start px-2.5 py-2 text-left',
                        mutationDisabled && 'cursor-not-allowed'
                      )}
                    >
                      <Plus className='size-4 shrink-0' aria-hidden />
                      <span className='min-w-0'>
                        <span className='block truncate text-sm font-medium'>
                          {t(entry.labelKey, { default: entry.label })}
                        </span>
                        <span className='text-muted-foreground block truncate text-xs font-normal'>
                          {t(entry.descriptionKey, {
                            default: entry.description
                          })}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
