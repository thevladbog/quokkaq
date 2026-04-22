'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

type Props = {
  unitId: string;
  locale: string;
  onRefreshKey?: string;
};

export function ScreenLayoutPreview({ unitId, locale, onRefreshKey }: Props) {
  const t = useTranslations('admin.signage');
  const [bust, setBust] = useState(0);

  const src = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'about:blank';
    }
    const u = new URL(`/${locale}/screen/${unitId}`, window.location.origin);
    u.searchParams.set('v', `${bust}|${onRefreshKey ?? ''}`);
    return u.toString();
  }, [locale, unitId, bust, onRefreshKey]);

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-sm font-medium'>
          {t('screenPreview', { default: 'Screen preview' })}
        </p>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => {
            setBust((b) => b + 1);
          }}
        >
          <RefreshCw className='mr-1 h-3.5 w-3.5' />
          {t('refreshPreview', { default: 'Refresh' })}
        </Button>
      </div>
      {typeof window !== 'undefined' && src !== 'about:blank' && (
        <p className='text-muted-foreground font-mono text-xs break-all'>
          {src}
        </p>
      )}
      <div className='bg-muted/20 overflow-hidden rounded-lg border'>
        <iframe
          title={t('screenPreview', { default: 'Screen preview' })}
          className='h-[min(420px,50vh)] w-full border-0'
          src={src}
          sandbox='allow-same-origin allow-scripts allow-popups'
          suppressHydrationWarning
        />
      </div>
    </div>
  );
}
