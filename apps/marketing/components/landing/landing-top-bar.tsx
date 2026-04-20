'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { HomeControls } from '@/app/home-controls';
import { localeHomePath } from '@/lib/locale-paths';
import type { AppLocale, HomeMessages } from '@/src/messages';

import { TextLogoImg } from './text-logo-img';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
  appBaseUrl: string | null;
};

const navLinkClass =
  'focus-ring text-sm font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]';

const headerCtaClass =
  'focus-ring inline-flex max-w-[10.5rem] shrink-0 items-center justify-center truncate rounded-full bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] px-3 py-2 text-xs font-semibold text-white shadow-md shadow-[color:var(--color-primary)]/25 transition hover:brightness-105 sm:max-w-none sm:px-5 sm:py-2.5 sm:text-sm';

export function LandingTopBar({ locale, copy, appBaseUrl }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const trialHref = appBaseUrl
    ? `${String(appBaseUrl).replace(/\/$/, '')}/${locale}/signup`
    : `${localeHomePath(locale)}#book-demo`;

  const headerSurface = scrolled
    ? 'border-[color:var(--color-border)]/55 bg-[color:var(--color-surface)]/52 backdrop-blur-xl dark:border-[color:var(--color-border)]/40 dark:bg-[color:var(--color-surface)]/42'
    : 'border-[color:var(--color-border)]/85 bg-[#f3ebe1]/97 dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-elevated)]/94';

  return (
    <header
      className={`landing-reveal landing-top-bar sticky top-0 z-50 border-b transition-[background-color,backdrop-filter,border-color] duration-300 ease-out ${headerSurface}`}
    >
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4 lg:px-8'>
        <Link
          href={localeHomePath(locale)}
          prefetch={false}
          className='focus-ring shrink-0 rounded-md'
          aria-label={copy.logoAlt}
        >
          <TextLogoImg locale={locale} className='h-8 w-auto sm:h-9' />
        </Link>

        <nav
          className='hidden items-center gap-6 md:flex lg:gap-7'
          aria-label='Main navigation'
        >
          <a href='#features' className={navLinkClass}>
            {copy.topNav.features}
          </a>
          <a href='#how-it-works' className={navLinkClass}>
            {copy.topNav.howItWorks}
          </a>
          <a href='#pillars' className={navLinkClass}>
            {copy.topNav.benefits}
          </a>
          <a href='#faq' className={navLinkClass}>
            {copy.topNav.faq}
          </a>
        </nav>

        <div className='flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-2.5 md:flex-none md:gap-3'>
          <HomeControls copy={copy} locale={locale} />
          {appBaseUrl ? (
            <a
              href={trialHref}
              target='_blank'
              rel='noopener noreferrer'
              className={headerCtaClass}
            >
              {copy.topNav.primaryCta}
            </a>
          ) : (
            <Link href={trialHref} prefetch={false} className={headerCtaClass}>
              {copy.topNav.primaryCta}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
