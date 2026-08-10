'use client';

import type { ExperiencePage, ExperienceTemplate } from '@quokkaq/shared-types';
import {
  AlertCircle,
  CircleDot,
  Copy,
  Ellipsis,
  FileWarning,
  Flag,
  Plus,
  Trash2,
  Waypoints
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type PageStatus =
  | 'start'
  | 'error'
  | 'unreachable'
  | 'service-reference'
  | 'conditional';

function pageStatuses(
  template: ExperienceTemplate,
  page: ExperiencePage
): PageStatus[] {
  const statuses: PageStatus[] = [];
  if (template.startPageId === page.id) statuses.push('start');
  if (
    !template.variants.every(
      (variant) => page.layouts[variant.id] !== undefined
    ) ||
    !Object.keys(page.layouts).every((variantId) =>
      template.variants.some((variant) => variant.id === variantId)
    )
  ) {
    statuses.push('error');
  }
  if (page.access || page.widgets.some((widget) => widget.access)) {
    statuses.push('conditional');
  }
  if (Object.values(template.flowPages ?? {}).some((id) => id === page.id)) {
    statuses.push('service-reference');
  }
  const queue = [template.startPageId];
  const reachable = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const currentPage = template.pages.find(
      (candidate) => candidate.id === current
    );
    for (const widget of currentPage?.widgets ?? []) {
      for (const action of widget.actions) {
        if (action.type === 'navigate') queue.push(action.toPageId);
      }
    }
  }
  if (!reachable.has(page.id)) statuses.push('unreachable');
  return statuses;
}

const STATUS_ICON = {
  start: Flag,
  error: AlertCircle,
  unreachable: FileWarning,
  'service-reference': Waypoints,
  conditional: CircleDot
} as const;

export type ExperiencePageRailProps = {
  template: ExperienceTemplate;
  activePageId: string;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onDuplicate: (pageId: string) => void;
  onRename: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
};

export function ExperiencePageRail({
  template,
  activePageId,
  onSelect,
  onAdd,
  onDuplicate,
  onRename,
  onDelete,
  onMove
}: ExperiencePageRailProps) {
  const t = useTranslations('experience.builder');
  return (
    <section
      className='flex min-h-0 flex-1 flex-col'
      aria-label={t('pages.label', { default: 'Pages' })}
    >
      <div className='min-h-0 space-y-2 overflow-y-auto p-3'>
        {template.pages.map((page, index) => {
          const selected = activePageId === page.id;
          const statuses = pageStatuses(template, page);
          return (
            <article
              key={page.id}
              className={cn(
                'rounded-lg border p-2 transition-colors motion-reduce:transition-none',
                selected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:bg-muted/50'
              )}
            >
              <div className='flex items-start gap-1'>
                <Button
                  type='button'
                  variant='ghost'
                  className='h-auto min-h-10 min-w-0 flex-1 justify-start px-2 text-left'
                  aria-pressed={selected}
                  aria-label={page.name}
                  onClick={() => onSelect(page.id)}
                >
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-medium'>
                      {page.name}
                    </span>
                    <span className='text-muted-foreground block text-xs'>
                      {page.widgets.length}{' '}
                      {t('pages.widgets', { default: 'widgets' })}
                    </span>
                  </span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      className='min-h-11 min-w-11'
                      aria-label={t('pages.actions', {
                        name: page.name,
                        default: `Open ${page.name} actions`
                      })}
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem onSelect={() => onDuplicate(page.id)}>
                      <Copy /> {t('pages.duplicate', { default: 'Duplicate' })}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onRename(page.id)}>
                      {t('pages.rename', { default: 'Rename' })}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={index === 0}
                      onSelect={() => onMove(page.id, -1)}
                    >
                      {t('pages.moveUp', { default: 'Move up' })}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === template.pages.length - 1}
                      onSelect={() => onMove(page.id, 1)}
                    >
                      {t('pages.moveDown', { default: 'Move down' })}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant='destructive'
                      disabled={page.id === template.startPageId}
                      onSelect={() => onDelete(page.id)}
                    >
                      <Trash2 /> {t('pages.delete', { default: 'Delete' })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className='mt-1 flex flex-wrap gap-1 px-1'>
                {statuses.map((status) => {
                  const Icon = STATUS_ICON[status];
                  return (
                    <Badge
                      key={status}
                      variant='secondary'
                      className='gap-1 px-1.5 py-0.5 text-[10px] font-medium'
                    >
                      <Icon className='size-3' aria-hidden />
                      {t(`pages.status.${status}`, { default: status })}
                    </Badge>
                  );
                })}
              </div>
              <div className='sr-only'>
                <Button
                  type='button'
                  aria-label={t('pages.moveUpAria', {
                    name: page.name,
                    default: `Move ${page.name} up`
                  })}
                  onClick={() => onMove(page.id, -1)}
                />
              </div>
            </article>
          );
        })}
      </div>
      <div className='border-t p-3'>
        <Button
          type='button'
          variant='outline'
          className='min-h-11 w-full'
          onClick={onAdd}
        >
          <Plus /> {t('pages.add', { default: 'Add page' })}
        </Button>
      </div>
    </section>
  );
}
