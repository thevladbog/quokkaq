'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { TFn } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface StaffServiceScopeLeaf {
  id: string;
  label: string;
}

export interface StaffServiceScopeSelectorProps {
  t: TFn;
  leaves: StaffServiceScopeLeaf[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  summary?: {
    kind: 'all' | 'single' | 'multiple';
    labels: string[];
    count: number;
  };
  waitingCount?: number;
  className?: string;
  /** In a dialog, omit outer card chrome and duplicate headings (title lives in DialogHeader). */
  variant?: 'card' | 'dialog';
}

function SelectAllButton({
  onSelectAll,
  disabled,
  label
}: {
  onSelectAll: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Button
      type='button'
      size='sm'
      variant='outline'
      className='h-9 text-xs'
      onClick={onSelectAll}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

export function StaffServiceScopeSelector({
  t,
  leaves,
  selectedIds,
  onChange,
  summary,
  waitingCount,
  className,
  variant = 'card'
}: StaffServiceScopeSelectorProps) {
  const isDialog = variant === 'dialog';

  if (!isDialog && summary) {
    const summaryLabel =
      summary.kind === 'all'
        ? t('scope.all_services')
        : summary.kind === 'single'
          ? t('scope.selected_one', { service: summary.labels[0] ?? '' })
          : t('scope.selected_many', {
              service: summary.labels[0] ?? '',
              count: Math.max(0, summary.count - 1)
            });

    return (
      <div
        className={cn(
          'border-border/60 bg-muted/15 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 shadow-xs',
          className
        )}
      >
        <div className='min-w-0'>
          <p className='text-muted-foreground text-[10px] font-semibold tracking-wide uppercase'>
            {t('scope.title')}
          </p>
          <p className='truncate text-sm font-semibold'>{summaryLabel}</p>
        </div>
        {waitingCount !== undefined ? (
          <p className='text-muted-foreground shrink-0 text-xs tabular-nums'>
            {t('scope.matching_count', { count: waitingCount })}
          </p>
        ) : null}
      </div>
    );
  }

  if (!leaves.length) return null;

  const allIds = leaves.map((l) => l.id);
  const set = new Set(selectedIds);
  const allSelected =
    selectedIds.length === allIds.length && allIds.every((id) => set.has(id));

  const toggle = (id: string, nextChecked: boolean) => {
    if (nextChecked) {
      if (!set.has(id)) onChange([...selectedIds, id]);
      return;
    }
    if (selectedIds.length <= 1) return;
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div
      className={cn(
        !isDialog &&
          'border-border/60 bg-muted/15 rounded-lg border p-3 shadow-xs',
        isDialog && 'flex flex-col gap-2',
        className
      )}
    >
      {!isDialog && (
        <div className='mb-2 flex flex-wrap items-start justify-between gap-2'>
          <div>
            <p className='text-foreground text-sm font-semibold'>
              {t('scope.title')}
            </p>
            <p className='text-muted-foreground mt-0.5 text-xs leading-snug'>
              {t('scope.hint')}
            </p>
          </div>
          <div className='flex shrink-0 flex-wrap gap-1.5'>
            <SelectAllButton
              onSelectAll={() => onChange([...allIds])}
              disabled={allSelected}
              label={t('scope.select_all')}
            />
          </div>
        </div>
      )}
      {isDialog && (
        <div className='flex justify-end'>
          <SelectAllButton
            onSelectAll={() => onChange([...allIds])}
            disabled={allSelected}
            label={t('scope.select_all')}
          />
        </div>
      )}
      <ul
        className={cn(
          'space-y-2 overflow-y-auto pr-1',
          isDialog
            ? 'max-h-[min(55vh,22rem)] sm:max-h-[min(55vh,26rem)]'
            : 'max-h-40 sm:max-h-48'
        )}
      >
        {leaves.map((leaf) => {
          const checked = set.has(leaf.id);
          const disableUncheck = checked && selectedIds.length === 1;
          return (
            <li
              key={leaf.id}
              className='border-border/40 bg-background/60 flex min-h-9 items-center gap-1 rounded-md border px-1'
            >
              <Checkbox
                id={`staff-scope-${leaf.id}`}
                checked={checked}
                disabled={disableUncheck}
                onCheckedChange={(v) => toggle(leaf.id, v === true)}
                className='size-9 rounded-md'
              />
              <label
                htmlFor={`staff-scope-${leaf.id}`}
                className='flex min-h-9 flex-1 cursor-pointer items-center py-1.5 text-sm leading-snug select-none'
              >
                {leaf.label}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
