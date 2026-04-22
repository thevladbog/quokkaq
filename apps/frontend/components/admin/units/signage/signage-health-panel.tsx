'use client';

import { useTranslations } from 'next-intl';
import * as orval from '@/lib/api/generated/units';
import { Button } from '@/components/ui/button';

export function SignageHealthPanel({ unitId }: { unitId: string }) {
  const t = useTranslations('admin.signage');
  const { data, isLoading, refetch, isFetching } = orval.useGetSignageHealth(
    unitId,
    { query: { refetchInterval: 60_000 } }
  );
  const h = (data as { data?: orval.ServicesSignageHealthDTO } | undefined)
    ?.data;

  return (
    <div className='space-y-4 rounded-lg border p-3'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-medium'>
          {t('healthTitle', { default: 'Signage & feeds status' })}
        </h3>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={isFetching}
          onClick={() => {
            void refetch();
          }}
        >
          {t('healthRefresh', { default: 'Refresh' })}
        </Button>
      </div>
      {isLoading && !h ? (
        <p className='text-muted-foreground text-sm'>…</p>
      ) : h ? (
        <div className='space-y-3 text-sm'>
          <p>
            <span className='text-muted-foreground'>
              {t('healthTimezone', { default: 'Timezone' })}:{' '}
            </span>
            {h.timezone}
          </p>
          {h.active ? (
            <div>
              <p>
                {t('healthActiveSource', { default: 'Active playlist' })}:{' '}
                <code className='text-xs'>{h.active.source}</code>
                {h.active.empty ? (
                  <span className='text-destructive ml-2'>
                    {t('healthEmpty', {
                      default: '— no slides (check item date ranges or media)'
                    })}
                  </span>
                ) : null}
              </p>
              {h.active.reason ? (
                <p className='text-muted-foreground text-xs'>
                  {h.active.reason}
                </p>
              ) : null}
            </div>
          ) : null}
          <p>
            {t('healthPlaylists', { default: 'Playlists' })}: {h.playlistCount}{' '}
            ·{t('healthSchedules', { default: ' Schedules' })}:{' '}
            {h.scheduleCount}
            {h.hasDefaultPlaylist
              ? ` · ${t('hasDefault', { default: 'has default' })}`
              : ` · ${t('noDefault', { default: 'no default' })}`}
          </p>
          <div>
            <p className='text-muted-foreground mb-1 text-xs font-medium uppercase'>
              {t('healthFeeds', { default: 'External feeds' })}
            </p>
            <ul className='max-h-40 space-y-1 overflow-y-auto'>
              {(h.feeds ?? []).map((f) => (
                <li
                  key={f.id}
                  className={
                    f.healthy
                      ? 'text-xs'
                      : 'text-destructive text-xs font-medium'
                  }
                >
                  {f.name} —{' '}
                  {f.healthy
                    ? t('feedOk', { default: 'OK' })
                    : t('feedFailing', {
                        default: 'Failing (poll errors; check URL or network)'
                      })}
                  {f.consecutiveFailures ? ` ×${f.consecutiveFailures}` : null}
                </li>
              ))}
              {(!h.feeds || h.feeds.length === 0) && (
                <li className='text-muted-foreground text-xs'>—</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
