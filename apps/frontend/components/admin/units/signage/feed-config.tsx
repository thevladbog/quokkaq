'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import * as orval from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

function feedTypeUiLabel(
  t: (key: string, o?: { default: string }) => string,
  apiType: string | undefined
): string {
  switch (apiType) {
    case 'rss':
      return t('feedTypeRss', { default: 'RSS' });
    case 'weather':
      return t('feedTypeWeatherList', { default: 'Weather' });
    case 'custom_url':
      return t('feedTypeCustomUrl', { default: 'Custom URL' });
    default:
      return apiType ?? '';
  }
}

export function FeedConfig({ unitId }: { unitId: string }) {
  const t = useTranslations('admin.signage');
  const { data: feedsRes, refetch: refetchFeeds } =
    orval.useListSignageFeeds(unitId);
  const feeds: orval.ModelsExternalFeed[] = feedsRes?.data ?? [];
  const [feedName, setFeedName] = useState('');
  const [feedType, setFeedType] = useState('rss');
  const [feedUrl, setFeedUrl] = useState('');
  const [poll, setPoll] = useState(300);
  const [preview, setPreview] = useState<string>('');
  const [previewId, setPreviewId] = useState<string>('');
  const createFeed = orval.useCreateSignageFeed();
  const deleteFeed = orval.useDeleteSignageFeed();

  const onCreate = async () => {
    if (!feedName.trim() || !feedUrl.trim()) {
      toast.error(
        t('feedFormIncomplete', { default: 'Name and URL are required' })
      );
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
    if (
      !window.confirm(t('confirmDeleteFeed', { default: 'Delete this feed?' }))
    ) {
      return;
    }
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
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='signage-feed-name'>
              {t('feedNameLabel', { default: 'Name' })}
            </Label>
            <Input
              id='signage-feed-name'
              value={feedName}
              onChange={(e) => setFeedName(e.target.value)}
              placeholder={t('feedNamePlaceholder', { default: 'Feed name' })}
            />
          </div>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='signage-feed-type'>
              {t('feedTypeLabel', { default: 'Type' })}
            </Label>
            <Select value={feedType} onValueChange={setFeedType}>
              <SelectTrigger
                id='signage-feed-type'
                className={cn(
                  'h-auto min-h-9 w-full max-w-full items-start gap-2 py-2 pl-3 text-left leading-snug !whitespace-normal',
                  '*:data-[slot=select-value]:!line-clamp-2 *:data-[slot=select-value]:max-w-full *:data-[slot=select-value]:items-start *:data-[slot=select-value]:!py-0 *:data-[slot=select-value]:!whitespace-normal'
                )}
              >
                <SelectValue
                  placeholder={t('feedTypeRss', { default: 'RSS' })}
                />
              </SelectTrigger>
              <SelectContent align='start' className='max-w-[min(100%,28rem)]'>
                <SelectItem className='py-2 pr-2 pl-2' value='rss'>
                  {t('feedTypeRss', { default: 'RSS' })}
                </SelectItem>
                <SelectItem
                  className='py-2.5 pr-2 pl-2 text-left leading-snug whitespace-normal'
                  value='weather'
                >
                  {t('feedTypeWeather', {
                    default: 'Weather (Open-Meteo — lat/lon in config)'
                  })}
                </SelectItem>
                <SelectItem className='py-2 pr-2 pl-2' value='custom_url'>
                  {t('feedTypeCustomUrl', { default: 'Custom URL' })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='min-w-0 space-y-2 sm:col-span-2'>
            <Label htmlFor='signage-feed-url'>
              {t('feedUrlLabel', { default: 'URL' })}
            </Label>
            <Input
              id='signage-feed-url'
              className='w-full'
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder={t('feedUrlPlaceholder', { default: 'https://…' })}
            />
          </div>
          <div className='min-w-0 space-y-2 sm:col-span-2 sm:max-w-xs'>
            <Label htmlFor='signage-feed-poll'>
              {t('feedPollInterval', { default: 'Poll interval (seconds)' })}
            </Label>
            <Input
              id='signage-feed-poll'
              className='w-28'
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
          {feeds.map((f) => {
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
                    {f.name} · {feedTypeUiLabel(t, f.type)}
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
                    {t('feedDelete', { default: 'Delete' })}
                  </Button>
                </div>
              </li>
            );
          })}
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
