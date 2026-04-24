import Link from 'next/link';

import { TextLogoImg } from '@/components/landing/text-logo-img';
import { localeRoiPath } from '@/lib/locale-paths';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages['comparison'];
  locale: AppLocale;
};

export function LandingComparison({ copy, locale }: Props) {
  const tag = copy.roiTableTag;

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
            className='font-display mb-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2 text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:mb-4 sm:gap-x-3 sm:text-4xl'
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

        <div className='relative isolate pt-2 sm:pt-3'>
          <Link
            href={localeRoiPath(locale)}
            prefetch={false}
            className='comparison-roi-table-tag focus-ring font-display absolute top-2 right-0 z-20 max-w-[calc(100%-2rem)] origin-top-right translate-x-[34%] -translate-y-[14%] rotate-[11deg] rounded-full border border-black/20 px-3 py-1.5 text-center text-[0.7rem] leading-none font-bold tracking-wide text-white shadow-[0_4px_14px_-4px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.18)] transition-[filter,transform] duration-200 hover:brightness-[1.08] motion-reduce:transition-none motion-reduce:hover:brightness-100 sm:top-3 sm:translate-x-[38%] sm:-translate-y-[10%] sm:px-3.5 sm:py-2 sm:text-[0.8125rem] md:translate-x-[42%]'
          >
            <span className='relative z-10 whitespace-nowrap drop-shadow-[0_1px_1px_rgb(0_0_0/0.45)]'>
              {tag.linkLabel}
              <span className='sr-only'>{tag.linkSrOnly}</span>
            </span>
          </Link>

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
            {copy.rows.map((row, idx) => (
              <li
                key={`comparison-row-${idx}`}
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
      </div>
    </section>
  );
}
