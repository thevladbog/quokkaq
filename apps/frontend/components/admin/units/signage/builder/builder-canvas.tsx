'use client';

import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { useShallow } from 'zustand/react/shallow';
import { RegionDropColumn } from './region-drop-column';
import { TwoColumnBuilderLayout } from './two-column-resize-split';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * WYSIWYG structure preview + drop targets; zoom scales the design surface.
 */
export function BuilderCanvas() {
  const t = useTranslations('admin.screenBuilder');
  const [template, zoom] = useScreenBuilderStore(
    useShallow((s) => [s.template, s.zoom])
  );
  const layout = template.layout;
  const regions = layout.regions;

  if (layout.type === 'grid' && regions.length === 2) {
    const a = regions[0]!;
    const b = regions[1]!;
    return (
      <div
        className='bg-dotted h-[min(520px,56vh)] min-h-0 w-full min-w-0 overflow-hidden [background-image:radial-gradient(circle,oklch(0.8_0.02_240/_0.2)_1px,transparent_1px)] [background-size:16px_16px] p-1 sm:min-h-[26rem] sm:p-2'
        aria-label={t('canvas.label', { default: 'Layout canvas' })}
      >
        <div
          className='h-full w-full min-w-0 origin-top-left will-change-transform'
          style={{
            transform: `scale(${zoom})`,
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`
          }}
        >
          <TwoColumnBuilderLayout
            sideRegionId={b.id}
            sideSize={b.size}
            main={
              <div
                className='bg-card/5 flex h-full min-h-0 w-full min-w-0 flex-col p-1 sm:p-2'
                data-region='main'
              >
                <RegionDropColumn className='min-h-0 flex-1' region={a} />
              </div>
            }
            side={
              <div
                className='flex h-full min-h-0 w-full min-w-0 flex-col p-1 sm:p-2'
                data-region='side'
              >
                <RegionDropColumn className='min-h-0 flex-1' region={b} />
              </div>
            }
          />
        </div>
      </div>
    );
  }

  if (layout.type === 'grid' && regions.length >= 3) {
    return (
      <div
        className='h-[min(520px,56vh)] w-full min-w-0 [background-image:radial-gradient(circle,oklch(0.8_0.02_240/_0.2)_1px,transparent_1px)] [background-size:16px_16px] p-1 sm:min-h-[26rem]'
        aria-label={t('canvas.label', { default: 'Layout canvas' })}
      >
        <div
          className='h-full w-full min-w-0 origin-top-left will-change-transform'
          style={{
            transform: `scale(${zoom})`,
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`
          }}
        >
          <div
            className='grid h-full min-h-0 w-full min-w-0 gap-1.5 p-0.5'
            style={{
              gridTemplateRows: regions.map((r) => r.size).join(' ')
            }}
          >
            {regions.map((r) => (
              <div
                key={r.id}
                className='min-h-0 w-full min-w-0 overflow-hidden p-0.5'
              >
                <RegionDropColumn region={r} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (layout.type === 'fullscreen' && regions[0]) {
    return (
      <div
        className={cn(
          'h-[min(480px,52vh)] w-full min-w-0 rounded-md border-2 sm:min-h-[24rem]',
          'border-dashed p-1 sm:p-2'
        )}
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      >
        <RegionDropColumn className='h-full' region={regions[0]} />
      </div>
    );
  }

  if (
    (layout.type === 'split-h' || layout.type === 'split-v') &&
    regions.length >= 2
  ) {
    return (
      <div
        className='grid h-[min(520px,56vh)] w-full min-w-0 grid-cols-1 gap-1 sm:min-h-[26rem] md:grid-cols-2'
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      >
        {regions.map((r) => (
          <div key={r.id} className='min-h-0 overflow-hidden p-0.5'>
            <RegionDropColumn region={r} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='text-muted-foreground border-muted-foreground/30 p-3 text-sm'>
      {t('canvas.unsupported', {
        type: layout.type,
        default: 'This layout is not yet editable in the visual builder'
      })}
    </div>
  );
}
