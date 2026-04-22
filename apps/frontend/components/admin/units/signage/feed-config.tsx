'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import * as orval from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

export function FeedConfig({ unitId }: { unitId: string }) {
  const t = useTranslations('admin.signage');
  const { data: feeds, refetch: refetchFeeds } =
    orval.useListSignageFeeds(unitId);
  const [feedName, setFeedName] = useState('');
  const [feedType, setFeedType] = useState('rss');
  const [feedUrl, setFeedUrl] = useState('');
  const [poll, setPoll] = useState(300);
  const [preview, setPreview] = useState<string>('');
  const [previewId, setPreviewId] = useState<string>('');
  const createFeed = orval.useCreateSignageFeed();
  const deleteFeed = orval.useDeleteSignageFeed();

  const onCreate = async () => {
    if (!feedName || !feedUrl) {
      return;
    }
    const data = {
      name: feedName,
      type: feedType,
      url: feedUrl,
      pollInterval: poll,
      isActive: true
    };
    if (!safeParseSignageWithToast('Feed', signageZod.feed, data).success) {
      return;
    }
    try {
      await createFeed.mutateAsync({
        unitId,
        data: data as orval.HandlersCreateFeedRequest
      });
      toast.success(t('saved', { default: 'Saved' }));
      setFeedName('');
      setFeedUrl('');
      void refetchFeeds();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete feed?')) return;
    try {
      await deleteFeed.mutateAsync({ unitId, feedId: id });
      void refetchFeeds();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const loadPreview = async (id: string) => {
    setPreviewId(id);
    try {
      const d = await unitsApi.getPublicFeedData(unitId, id);
      setPreview(JSON.stringify(d, null, 2));
    } catch (e) {
      setPreview(String(e));
    }
  };

  return (
    <TooltipProvider>
      <div className='space-y-3'>
        <div className='grid gap-2 sm:grid-cols-2'>
          <Input
            value={feedName}
            onChange={(e) => setFeedName(e.target.value)}
            placeholder='Name'
          />
          <select
            className='border-input h-9 rounded-md border'
            value={feedType}
            onChange={(e) => setFeedType(e.target.value)}
          >
            <option value='rss'>rss</option>
            <option value='weather'>
              weather (Open-Meteo, lat/lon in config)
            </option>
            <option value='custom_url'>custom_url</option>
          </select>
          <Input
            className='sm:col-span-2'
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder='https://…'
          />
          <div className='flex items-center gap-2 sm:col-span-2'>
            <span className='text-muted-foreground text-sm'>Poll s</span>
            <Input
              className='w-24'
              type='number'
              min={60}
              value={poll}
              onChange={(e) => setPoll(parseInt(e.target.value, 10) || 300)}
            />
          </div>
        </div>
        <Button
          onClick={() => {
            void onCreate();
          }}
        >
          {t('create', { default: 'Create' })}
        </Button>
        <ul className='space-y-1'>
          {((feeds as orval.ModelsExternalFeed[] | undefined) ?? []).map(
            (f) => {
              const fails =
                (f.consecutiveFailures ?? 0) > 0 ||
                (f.lastError && String(f.lastError).length > 0);
              return (
                <li
                  key={f.id}
                  className='flex flex-wrap items-center justify-between gap-2 text-sm'
                >
                  <span className='flex min-w-0 flex-1 items-center gap-1'>
                    {fails ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className='shrink-0'
                            aria-label={t('feedStatusFail')}
                          >
                            <AlertCircle className='text-destructive h-4 w-4' />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className='max-w-sm'>
                          {String(f.lastError) || t('feedStatusFail')}
                          {f.consecutiveFailures
                            ? ` · ${f.consecutiveFailures}×`
                            : ''}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <CheckCircle2
                        className='text-muted-foreground h-4 w-4 shrink-0'
                        aria-label={t('feedStatusOk')}
                      />
                    )}
                    <span className='truncate'>
                      {f.name} · {f.type}
                      {f.lastFetchAt ? (
                        <span className='text-muted-foreground text-xs'>
                          {' '}
                          · {f.lastFetchAt}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <div className='flex items-center gap-1'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        if (f.id) void loadPreview(f.id);
                      }}
                    >
                      {t('preview', { default: 'Preview' })}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => f.id && void onDelete(f.id)}
                    >
                      Del
                    </Button>
                  </div>
                </li>
              );
            }
          )}
        </ul>
        {previewId && (
          <pre className='bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs'>
            {preview}
          </pre>
        )}
      </div>
    </TooltipProvider>
  );
}
