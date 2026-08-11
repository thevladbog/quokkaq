'use client';

import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

export type ExperienceVersionHistoryItem = {
  id: string;
  version: number;
  publishedAt: string;
};

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function VersionHistory({
  versions,
  onRestoreVersion,
  disabled = false
}: {
  versions: readonly ExperienceVersionHistoryItem[];
  onRestoreVersion?: (versionId: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('experience.builder.task11');
  const label = t('publish.history', {
    default: 'Version history and rollback'
  });

  return (
    <section className='space-y-3' aria-label={label}>
      <div className='flex items-center gap-2'>
        <History className='size-4' aria-hidden />
        <h3 className='text-sm font-semibold'>{label}</h3>
      </div>
      {versions.length === 0 ? (
        <p className='text-muted-foreground text-xs'>
          {t('publish.noHistory', { default: 'No published versions yet.' })}
        </p>
      ) : (
        <ol className='space-y-2'>
          {versions.map((version) => (
            <li
              key={version.id}
              className='flex items-center justify-between gap-3 rounded-md border p-3'
            >
              <div>
                <p className='text-sm font-medium'>v{version.version}</p>
                <time
                  className='text-muted-foreground text-xs'
                  dateTime={version.publishedAt}
                >
                  {formatPublishedAt(version.publishedAt)}
                </time>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='min-h-11'
                disabled={disabled || !onRestoreVersion}
                aria-label={t('publish.restoreVersion', {
                  default: 'Restore version {version}',
                  version: version.version
                })}
                onClick={() => onRestoreVersion?.(version.id)}
              >
                {t('publish.restore', { default: 'Restore' })}
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
