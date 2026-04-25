'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type KioskWelcomeHeroProps = {
  title: string;
  subtitle?: string;
  highContrast?: boolean;
  /**
   * True when the main body is dark (by L*), e.g. `kioskBaseTheme: dark` or custom dark `bodyColor`
   * — not only a11y HC. Ensures the heading stays light even if `data-kiosk-base-theme` is omitted
   * (e.g. custom unit colors) so it does not use the default dark-brown kiosk-ink.
   */
  onDarkKioskPage?: boolean;
  /** e.g. accessibility control — top-end of the hero, below the top bar, alongside headings */
  accessory?: ReactNode;
};

export function KioskWelcomeHero({
  title,
  subtitle,
  highContrast,
  onDarkKioskPage = false,
  accessory
}: KioskWelcomeHeroProps) {
  const hasAccessory = Boolean(accessory);
  const lightText = highContrast || onDarkKioskPage;

  const textBlock = (
    <>
      <h1
        className={cn(
          'kiosk-welcome-title text-center font-extrabold tracking-tight',
          lightText ? 'text-white' : 'text-kiosk-ink'
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={cn(
            'kiosk-welcome-subtitle mx-auto mt-2 max-w-2xl text-center font-medium',
            lightText ? 'text-zinc-200' : 'text-kiosk-ink-muted'
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
