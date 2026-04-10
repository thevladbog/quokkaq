'use client';

type KioskWelcomeHeroProps = {
  title: string;
  subtitle?: string;
};

export function KioskWelcomeHero({ title, subtitle }: KioskWelcomeHeroProps) {
  return (
    <div className='mb-3 shrink-0 px-1 text-center sm:mb-4'>
      <h1 className='text-kiosk-ink text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl md:text-4xl lg:text-[2.75rem] lg:leading-[1.1]'>
        {title}
      </h1>
      {subtitle ? (
        <p className='text-kiosk-ink-muted mx-auto mt-2 max-w-2xl text-base font-medium sm:text-lg'>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
