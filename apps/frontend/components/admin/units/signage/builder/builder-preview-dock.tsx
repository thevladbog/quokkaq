'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ScreenTemplate } from '@quokkaq/shared-types';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { ScreenPresetSchematic } from '../screen-preset-schematic';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Props = {
  unitId: string;
  locale: string;
  onRefreshKey: string;
  template: ScreenTemplate;
};

/**
 * Draft schematic + live iframe (saved unit).
 */
export function BuilderPreviewDock({
  unitId,
  locale,
  onRefreshKey,
  template
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
    <div className='min-w-0 space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-muted-foreground text-xs font-medium'>
          {t('schematicTitle')}
        </span>
      </div>
      <motion.div
        layout
        className={cn(
          'bg-muted/15 mx-auto w-full max-w-2xl overflow-hidden rounded-lg border p-0.5',
          'aspect-[16/6] sm:aspect-[16/5]'
        )}
        title={template.id}
      >
        <div className='h-full min-h-0 w-full min-w-0'>
          <ScreenPresetSchematic template={template} />
        </div>
      </motion.div>

      <div className='border-border/50 flex flex-col gap-2 border-t pt-2'>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('schematicLiveTitle')}
          </span>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-8 w-8 shrink-0 p-0'
            onClick={() => {
              setBust((b) => b + 1);
            }}
            title={t('refreshPreview', { default: 'Refresh' })}
            aria-label={t('refreshPreview', { default: 'Refresh' })}
          >
            <RefreshCw className='h-3.5 w-3.5' />
          </Button>
        </div>
        <div className='bg-muted/20 min-h-40 overflow-hidden rounded-lg border sm:min-h-[200px]'>
          <iframe
            title={t('screenPreview', { default: 'Screen preview' })}
            className='h-[min(280px,45vh)] w-full border-0 sm:h-[min(360px,50vh)]'
            src={src}
            sandbox='allow-same-origin allow-scripts allow-popups'
            suppressHydrationWarning
          />
        </div>
      </div>
    </div>
  );
}
