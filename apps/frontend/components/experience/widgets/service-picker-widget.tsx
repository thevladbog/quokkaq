'use client';

import type {
  AccessPolicy,
  ConditionContext,
  DeviceProfile
} from '@quokkaq/shared-types';
import { LockKeyhole } from 'lucide-react';
import { useMemo, useState } from 'react';

import { evaluateCondition } from '@/lib/experience/condition-evaluator';

export type ServicePickerEntry = {
  id: string;
  label: string;
  categoryId?: string;
  locale?: string;
  access?: AccessPolicy;
};

export type ServicePickerCategory = ServicePickerEntry;

const PAGE_SIZE = 12;

function visibleEntries<T extends ServicePickerEntry>(
  entries: readonly T[],
  context: ConditionContext
) {
  return entries.filter(
    (entry) =>
      !entry.access ||
      entry.access.whenFalse === 'lock' ||
      evaluateCondition(entry.access.when, context)
  );
}

export function ServicePickerWidget({
  services,
  categories,
  conditionContext,
  profile,
  locked = false,
  onSelectService,
  onSelectCategory
}: {
  services: readonly ServicePickerEntry[];
  categories: readonly ServicePickerCategory[];
  conditionContext: ConditionContext;
  profile?: Pick<DeviceProfile, 'width' | 'height'>;
  locked?: boolean;
  onSelectService: (service: ServicePickerEntry) => void;
  onSelectCategory?: (category: ServicePickerCategory) => void;
}) {
  const [page, setPage] = useState(0);
  const [activeCategoryId, setActiveCategoryId] = useState<
    string | undefined
  >();
  const entries = useMemo(
    () => [
      ...(activeCategoryId
        ? [{ id: '__back__', label: 'Back', kind: 'back' as const }]
        : []),
      ...visibleEntries(categories, conditionContext)
        .filter(
          (entry) => !activeCategoryId || entry.categoryId === activeCategoryId
        )
        .map((entry) => ({
          ...entry,
          kind: 'category' as const
        })),
      ...visibleEntries(services, conditionContext)
        .filter(
          (entry) => !activeCategoryId || entry.categoryId === activeCategoryId
        )
        .map((entry) => ({
          ...entry,
          kind: 'service' as const
        }))
    ],
    [activeCategoryId, categories, conditionContext, services]
  );
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const portrait = (profile?.height ?? 1) >= (profile?.width ?? 1);

  if (entries.length === 0) {
    return (
      <div
        data-testid='service-picker-empty'
        className='flex h-full min-h-14 items-center justify-center rounded-xl border p-5 text-center text-lg font-semibold'
      >
        No services available
      </div>
    );
  }

  return (
    <section
      data-testid='service-picker'
      data-layout={portrait ? 'portrait' : 'landscape'}
      className='flex h-full min-h-0 flex-col overflow-hidden'
    >
      <div className='grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2 lg:grid-cols-3'>
        {entries
          .slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
          .map((entry) => {
            if (entry.kind === 'back') {
              return (
                <button
                  key='back'
                  type='button'
                  className='min-h-14 rounded-xl border px-4 text-lg font-semibold'
                  onClick={() => {
                    setActiveCategoryId(undefined);
                    setPage(0);
                  }}
                >
                  {entry.label}
                </button>
              );
            }
            const entryLocked =
              locked ||
              Boolean(
                entry.access &&
                !evaluateCondition(entry.access.when, conditionContext)
              );
            return (
              <button
                key={`${entry.kind}-${entry.id}`}
                type='button'
                disabled={entryLocked}
                data-testid={
                  entry.kind === 'category'
                    ? 'service-picker-category'
                    : 'service-picker-option'
                }
                onClick={() => {
                  const selection = {
                    id: entry.id,
                    label: entry.label,
                    ...(entry.categoryId
                      ? { categoryId: entry.categoryId }
                      : {}),
                    ...(entry.locale ? { locale: entry.locale } : {}),
                    ...(entry.access ? { access: entry.access } : {})
                  };
                  if (entry.kind === 'category') {
                    setActiveCategoryId(entry.id);
                    setPage(0);
                    onSelectCategory?.(selection);
                  } else onSelectService(selection);
                }}
                className='bg-card text-card-foreground flex min-h-14 items-center justify-center gap-2 overflow-hidden rounded-xl border px-4 text-center text-lg font-semibold disabled:opacity-50'
              >
                {entryLocked ? (
                  <LockKeyhole className='size-5 shrink-0' aria-hidden />
                ) : null}
                <span className='truncate'>{entry.label}</span>
              </button>
            );
          })}
      </div>
      {pageCount > 1 ? (
        <nav
          aria-label='Service catalog pages'
          className='mt-3 flex shrink-0 items-center justify-between gap-3'
        >
          <button
            type='button'
            className='min-h-14 rounded-lg border px-5 font-semibold disabled:opacity-50'
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous page
          </button>
          <span aria-live='polite'>
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type='button'
            className='min-h-14 rounded-lg border px-5 font-semibold disabled:opacity-50'
            disabled={currentPage + 1 === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next page
          </button>
        </nav>
      ) : null}
    </section>
  );
}
