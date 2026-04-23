'use client';

import { useEffect, useState } from 'react';
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
  const [data, setData] = useState<RssPayload | null>(null);
  useEffect(() => {
    if (!feedId) return;
    const load = async () => {
      try {
        const raw = await unitsApi.getPublicFeedData(unitId, feedId);
        setData((raw as unknown as RssPayload | undefined) ?? null);
      } catch (e) {
        logger.error('RSS widget', e);
      }
    };
    void load();
    const iv = setInterval(load, 120_000);
    return () => clearInterval(iv);
  }, [unitId, feedId]);
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
