'use client';

import { useQuery } from '@tanstack/react-query';
import { unitsApi } from '@/lib/api';
import { logger } from '@/lib/logger';

type RssPayload = {
  type?: string;
  title?: string;
  items?: Array<{ title?: string; link?: string; summary?: string }>;
};

export function ScreenRssFeedWidget({
  unitId,
  feedId
}: {
  unitId: string;
  feedId: string;
}) {
  const { data, isError, error } = useQuery({
    queryKey: ['publicFeed', unitId, feedId],
    queryFn: async () => {
      const raw = await unitsApi.getPublicFeedData(unitId, feedId);
      return (raw as unknown as RssPayload | undefined) ?? null;
    },
    refetchInterval: 120_000,
    enabled: Boolean(unitId && feedId)
  });
  if (isError && error) {
    logger.error('RSS widget', error);
  }
  if (!data?.items?.length) {
    return (
      <div className='text-muted-foreground text-sm'>{data?.title ?? '—'}</div>
    );
  }
  return (
    <div className='text-left'>
      {data.title ? (
        <div className='text-muted-foreground mb-1 text-xs font-semibold'>
          {data.title}
        </div>
      ) : null}
      <ul className='space-y-1 text-sm leading-snug'>
        {data.items.slice(0, 5).map((it, i) => (
          <li key={i} className='line-clamp-2'>
            {it.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
