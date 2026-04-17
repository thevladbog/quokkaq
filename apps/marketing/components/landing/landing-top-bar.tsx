import Link from 'next/link';

import { HomeControls } from '@/app/home-controls';
import type { AppLocale, HomeMessages } from '@/src/messages';

import { TextLogoImg } from './text-logo-img';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
};

export function LandingTopBar({ locale, copy }: Props) {
  return (
    <header className='landing-reveal sticky top-0 z-50 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/90 backdrop-blur-md'>
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8'>
        <Link
          href={`/${locale}`}
          prefetch={false}
          className='focus-ring shrink-0 rounded-md'
          aria-label={copy.logoAlt}
        >
          <TextLogoImg locale={locale} className='h-8 w-auto sm:h-9' />
        </Link>

        <nav className='hidden items-center gap-6 md:flex' aria-label='Main navigation'>
          <a
            href='#how-it-works'
            className='focus-ring text-sm font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
          >
            How it works
          </a>
          <a
            href='#pricing'
            className='focus-ring text-sm font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
          >
            Pricing
          </a>
          <a
            href='#faq'
            className='focus-ring text-sm font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
          >
            FAQ
          </a>
          <Link
            href={`/${locale}/docs`}
            prefetch={false}
            className='focus-ring text-sm font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
          >
            {copy.docsCta}
          </Link>
        </nav>

        <div className='flex items-center gap-3'>
          <HomeControls copy={copy} locale={locale} />
        </div>
      </div>
    </header>
  );
}
