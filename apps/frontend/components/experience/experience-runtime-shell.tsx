'use client';

import type {
  DeviceProfile,
  ExperienceLayoutVariant,
  ExperiencePage
} from '@quokkaq/shared-types';
import { ArrowLeft, Home, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RuntimeShellProps = {
  page: ExperiencePage;
  layout: ExperiencePage['layouts'][string];
  grid: ExperienceLayoutVariant['grid'];
  profile: DeviceProfile;
  sessionId: string;
  showNavigation: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onHome: () => void;
  onReset: () => void;
  renderWidget: (widget: ExperiencePage['widgets'][number]) => ReactNode;
  overlay?: ReactNode;
};

export function ExperienceRuntimeShell({
  page,
  layout,
  grid,
  profile,
  sessionId,
  showNavigation,
  canGoBack,
  onBack,
  onHome,
  onReset,
  renderWidget,
  overlay
}: RuntimeShellProps) {
  const t = useTranslations('experience.runtime.task12');
  return (
    <main
      data-testid='experience-runtime'
      data-session-id={sessionId}
      className='bg-background text-foreground relative flex h-full min-h-0 w-full flex-col overflow-hidden'
    >
      {showNavigation ? (
        <nav
          aria-label={t('navigation.label', {
            default: 'Experience navigation'
          })}
          className='border-border bg-background/95 z-10 flex min-h-16 items-center gap-2 border-b px-4 py-2'
        >
          <Button
            type='button'
            variant='outline'
            size='lg'
            disabled={!canGoBack}
            onClick={onBack}
            className='min-h-11'
          >
            <ArrowLeft aria-hidden />
            {t('navigation.back', { default: 'Back' })}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='lg'
            onClick={onHome}
            className='min-h-11'
          >
            <Home aria-hidden />
            {t('navigation.home', { default: 'Home' })}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='lg'
            onClick={onReset}
            className='ml-auto min-h-11'
          >
            <RotateCcw aria-hidden />
            {t('navigation.reset', { default: 'Reset session' })}
          </Button>
        </nav>
      ) : null}
      <div
        data-testid='experience-runtime-surface'
        aria-label={page.name}
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          profile.viewingDistance === 'far' ? 'bg-neutral-50' : 'bg-background'
        )}
        style={{
          padding: `${profile.safeArea.top}px ${profile.safeArea.right}px ${profile.safeArea.bottom}px ${profile.safeArea.left}px`
        }}
      >
        <div
          className='grid h-full min-h-0 w-full min-w-0 gap-2'
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`
          }}
        >
          {page.widgets.map((widget) => {
            const placement = layout.placements[widget.id];
            if (!placement) return null;
            return (
              <div
                key={widget.id}
                className='min-h-0 min-w-0 overflow-hidden'
                style={{
                  gridColumn: `${placement.col} / span ${placement.colSpan}`,
                  gridRow: `${placement.row} / span ${placement.rowSpan}`
                }}
              >
                {renderWidget(widget)}
              </div>
            );
          })}
        </div>
        {overlay}
      </div>
    </main>
  );
}
