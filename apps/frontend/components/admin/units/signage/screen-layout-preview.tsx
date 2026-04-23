'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ScreenTemplate } from '@quokkaq/shared-types';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { ScreenPresetSchematic } from './screen-preset-schematic';

type Props = {
  unitId: string;
  locale: string;
  /** Bust iframe cache when unit data (saved screen) actually changes, not on draft preset selection. */
  onRefreshKey?: string;
  /** Wireframe for the **currently selected** preset; updates without a server save. */
  schematicTemplate?: ScreenTemplate;
};

export function ScreenLayoutPreview({
  unitId,
  locale,
  onRefreshKey,
  schematicTemplate
}: Props) {
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
      {schematicTemplate ? (
        <div className='space-y-1.5'>
          <p className='text-sm font-medium'>{t('schematicTitle')}</p>
          <div
            className='bg-muted/15 aspect-[16/6] w-full max-w-2xl overflow-hidden rounded-lg border p-0.5 sm:aspect-[16/5]'
            title={schematicTemplate.id}
          >
            <ScreenPresetSchematic template={schematicTemplate} />
          </div>
        </div>
      ) : null}
      <div className='flex items-center justify-between gap-2'>
        <p className='text-sm font-medium'>{t('schematicLiveTitle')}</p>
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
      <p className='text-muted-foreground text-sm'>
        {t('schematicLiveDescription')}
      </p>
      {typeof window !== 'undefined' && src !== 'about:blank' && (
        <p className='text-muted-foreground font-mono text-xs break-all'>
          {src}
        </p>
      )}
      {process.env.NODE_ENV === 'development' ? (
        <p className='text-muted-foreground text-xs'>
          {t('previewDevHint', {
            default:
              "Dev: preview uses this site's origin. If the API is on another host, the screen data may not match production."
          })}
        </p>
      ) : null}
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
