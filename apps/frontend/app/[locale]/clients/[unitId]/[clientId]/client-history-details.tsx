'use client';

import type { useTranslations } from 'next-intl';
import type { UnitClientHistoryItem } from '@/lib/api';

function formatHistoryScalar(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.trim() === '' ? '—' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function ClientHistoryDetails({
  row,
  t
}: {
  row: UnitClientHistoryItem;
  t: ReturnType<typeof useTranslations<'clients'>>;
}) {
  const p = row.payload;
  if (row.action === 'profile_updated') {
    const changes = p.changes as
      | Record<string, { from?: unknown; to?: unknown }>
      | undefined;
    if (!changes || typeof changes !== 'object') {
      return <span className='text-muted-foreground text-sm'>—</span>;
    }
    return (
      <ul className='list-inside list-disc space-y-1 text-sm'>
        {Object.entries(changes).map(([field, delta]) => {
          const from =
            delta && typeof delta === 'object' && 'from' in delta
              ? (delta as { from?: unknown }).from
              : undefined;
          const to =
            delta && typeof delta === 'object' && 'to' in delta
              ? (delta as { to?: unknown }).to
              : undefined;
          const labelKey = `historyField_${field}`;
          const label = t.has(labelKey) ? t(labelKey) : field;
          return (
            <li key={field}>
              <span className='font-medium'>{label}</span>:{' '}
              {formatHistoryScalar(from)} → {formatHistoryScalar(to)}
            </li>
          );
        })}
      </ul>
    );
  }
  if (row.action === 'tags_updated') {
    const added = Array.isArray(p.addedTagLabels)
      ? (p.addedTagLabels as unknown[]).filter(
          (x): x is string => typeof x === 'string'
        )
      : [];
    const removed = Array.isArray(p.removedTagLabels)
      ? (p.removedTagLabels as unknown[]).filter(
          (x): x is string => typeof x === 'string'
        )
      : [];
    const reason = typeof p.reason === 'string' ? p.reason.trim() : '';
    return (
      <div className='space-y-1 text-sm'>
        {added.length > 0 ? (
          <p>{t('historyTagsAdded', { list: added.join(', ') })}</p>
        ) : null}
        {removed.length > 0 ? (
          <p>{t('historyTagsRemoved', { list: removed.join(', ') })}</p>
        ) : null}
        {reason ? (
          <p className='text-muted-foreground'>
            {t('historyReason', { text: reason })}
          </p>
        ) : null}
        {!added.length && !removed.length && !reason ? (
          <span className='text-muted-foreground'>—</span>
        ) : null}
      </div>
    );
  }
  return <span className='text-muted-foreground text-sm'>{row.action}</span>;
}
