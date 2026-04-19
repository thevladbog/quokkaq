'use client';

type KioskWelcomeHeroProps = {
  title: string;
  subtitle?: string;
};

export function KioskWelcomeHero({ title, subtitle }: KioskWelcomeHeroProps) {
  return (
    <div className='mb-3 shrink-0 px-1 text-center sm:mb-4'>
      <h1 className='kiosk-welcome-title text-kiosk-ink font-extrabold tracking-tight'>
        {title}
      </h1>
      {subtitle ? (
        <p className='kiosk-welcome-subtitle text-kiosk-ink-muted mx-auto mt-2 max-w-2xl font-medium'>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
