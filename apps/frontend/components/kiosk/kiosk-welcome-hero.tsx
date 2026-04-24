'use client';

import { cn } from '@/lib/utils';

type KioskWelcomeHeroProps = {
  title: string;
  subtitle?: string;
  highContrast?: boolean;
};

export function KioskWelcomeHero({
  title,
  subtitle,
  highContrast
}: KioskWelcomeHeroProps) {
  return (
    <div className='mb-3 shrink-0 px-1 text-center sm:mb-4'>
      <h1
        className={cn(
          'kiosk-welcome-title font-extrabold tracking-tight',
          highContrast ? 'text-white' : 'text-kiosk-ink'
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={cn(
            'kiosk-welcome-subtitle mx-auto mt-2 max-w-2xl font-medium',
            highContrast ? 'text-zinc-300' : 'text-kiosk-ink-muted'
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
