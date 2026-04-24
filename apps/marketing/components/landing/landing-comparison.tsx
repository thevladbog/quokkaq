import { TextLogoImg } from '@/components/landing/text-logo-img';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages['comparison'];
  locale: AppLocale;
};

export function LandingComparison({ copy, locale }: Props) {
  return (
    <section
      id='comparison'
      className='relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-16 sm:py-24'
      aria-labelledby='comparison-heading'
    >
      <div className='mx-auto max-w-5xl px-4 sm:px-6 lg:px-8'>
        <div className='mb-10 text-center sm:mb-12'>
          <h2
            id='comparison-heading'
            aria-label={copy.heading}
            className='font-display mb-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2 text-center text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:mb-4 sm:gap-x-3 sm:text-4xl'
          >
            <span className='max-w-[min(100%,22rem)] leading-tight sm:max-w-none'>
              {copy.headingPrefix}
            </span>
            <span className='inline-flex shrink-0 items-center' aria-hidden>
              <TextLogoImg
                locale={locale}
                className='h-8 w-auto sm:h-9 md:h-10'
              />
            </span>
          </h2>
          <p className='mx-auto max-w-2xl text-lg text-[color:var(--color-text-muted)]'>
            {copy.subheading}
          </p>
        </div>
        <div className='overflow-hidden rounded-2xl border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] shadow-[0_14px_44px_-14px_rgb(0_0_0/0.2)] ring-1 ring-[color:var(--color-primary)]/15 dark:shadow-[0_18px_56px_-16px_rgb(0_0_0/0.55)]'>
          <div className='grid grid-cols-1 divide-y divide-[color:var(--color-border)] md:grid-cols-2 md:divide-x md:divide-y-0'>
            <div className='bg-[color:var(--color-surface)] px-4 py-4 text-center sm:px-6 sm:py-5'>
              <span className='text-xs font-bold tracking-[0.14em] text-[color:var(--color-text-muted)] uppercase sm:text-[13px]'>
                {copy.beforeColumn}
              </span>
            </div>
            <div className='flex min-h-[3.25rem] items-center justify-center bg-gradient-to-br from-[color:var(--color-primary)]/16 via-[color:var(--color-primary)]/10 to-[color:var(--color-secondary)]/10 px-4 py-4 sm:min-h-[3.5rem] sm:px-6 sm:py-5'>
              <TextLogoImg
                locale={locale}
                className='h-8 w-auto sm:h-9'
                alt={copy.afterColumn}
              />
            </div>
          </div>
          <ul className='divide-y divide-[color:var(--color-border)]'>
            {copy.rows.map((row) => (
              <li
                key={row.before}
                className='grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-[color:var(--color-border)]'
              >
                <div className='bg-[color:var(--color-surface)]/90 px-5 py-5 text-[15px] leading-relaxed text-[color:var(--color-text-muted)] sm:px-7 sm:text-base dark:bg-[color:var(--color-surface)]/70'>
                  {row.before}
                </div>
                <div className='bg-[color:var(--color-primary)]/[0.07] px-5 py-5 text-[15px] leading-relaxed font-medium text-[color:var(--color-text)] sm:px-7 sm:text-base dark:bg-[color:var(--color-primary)]/12'>
                  {row.after}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
