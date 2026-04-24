'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type KioskWelcomeHeroProps = {
  title: string;
  subtitle?: string;
  highContrast?: boolean;
  /** e.g. accessibility control — top-end of the hero, below the top bar, alongside headings */
  accessory?: ReactNode;
};

export function KioskWelcomeHero({
  title,
  subtitle,
  highContrast,
  accessory
}: KioskWelcomeHeroProps) {
  const hasAccessory = Boolean(accessory);

  const textBlock = (
    <>
      <h1
        className={cn(
          'kiosk-welcome-title text-center font-extrabold tracking-tight',
          highContrast ? 'text-white' : 'text-kiosk-ink'
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={cn(
            'kiosk-welcome-subtitle mx-auto mt-2 max-w-2xl text-center font-medium',
            highContrast ? 'text-zinc-300' : 'text-kiosk-ink-muted'
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </>
  );

  if (!hasAccessory) {
    return (
      <div className='mb-3 shrink-0 px-1 text-center sm:mb-4'>{textBlock}</div>
    );
  }

  return (
    <div className='mb-3 flex w-full min-w-0 items-start sm:mb-4'>
      {/* Symmetric side rails: middle column is only as wide as the title block (capped) — stays optically centered */}
      <div className='min-w-0 flex-1' aria-hidden />
      <div className='max-w-2xl min-w-0 px-1 text-center sm:max-w-3xl'>
        {textBlock}
      </div>
      <div className='flex min-w-0 flex-1 items-start justify-end'>
        {accessory}
      </div>
    </div>
  );
}
