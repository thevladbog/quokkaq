'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { localeHomePath } from '@/lib/locale-paths';
import {
  MARKETING_MOBILE_NAV_OPEN_EVENT,
  type MarketingMobileNavOpenDetail
} from '@/lib/marketing-mobile-nav-event';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
  appBaseUrl: string | null;
};

export function LandingStickyMobileCta({ locale, copy, appBaseUrl }: Props) {
  const [pastHero, setPastHero] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const normalizedAppBase =
    appBaseUrl != null && String(appBaseUrl).trim() !== ''
      ? String(appBaseUrl).trim().replace(/\/$/, '')
      : null;
  const signupHref = normalizedAppBase
    ? `${normalizedAppBase}/${locale}/signup`
    : null;

  useEffect(() => {
    const sentinel = document.getElementById('landing-hero-sticky-sentinel');
    if (!sentinel) {
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setPastHero(!entry.isIntersecting);
      },
      { root: null, rootMargin: '0px', threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onNav = (e: Event) => {
      const ce = e as CustomEvent<MarketingMobileNavOpenDetail>;
      if (ce.detail && typeof ce.detail.open === 'boolean') {
        setMobileNavOpen(ce.detail.open);
      }
    };
    window.addEventListener(
      MARKETING_MOBILE_NAV_OPEN_EVENT,
      onNav as EventListener
    );
    return () =>
      window.removeEventListener(
        MARKETING_MOBILE_NAV_OPEN_EVENT,
        onNav as EventListener
      );
  }, []);

  const visible = pastHero && !mobileNavOpen;

  const ctaClass =
    'focus-ring flex min-h-12 w-full items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-4 text-sm font-semibold text-white shadow-md shadow-[color:var(--color-primary)]/25';

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden ${
        visible
          ? 'pointer-events-auto translate-y-0 opacity-100 transition-[opacity,transform] duration-200'
          : 'pointer-events-none translate-y-2 opacity-0 transition-[opacity,transform] duration-200'
      }`}
      aria-hidden={!visible}
    >
      <div className='mx-auto max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 p-2 shadow-lg backdrop-blur-md'>
        {signupHref ? (
          <a
            href={signupHref}
            target='_blank'
            rel='noopener noreferrer'
            className={ctaClass}
            aria-label={copy.stickyMobileCta.ariaLabel}
          >
            {copy.stickyMobileCta.label}
          </a>
        ) : (
          <Link
            href={`${localeHomePath(locale)}#pricing`}
            prefetch={false}
            className={ctaClass}
            aria-label={copy.stickyMobileCta.ariaLabel}
          >
            {copy.stickyMobileCta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
