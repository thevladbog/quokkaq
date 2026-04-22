'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';

import { HomeControls } from '@/app/home-controls';
import { pushMarketingEvent } from '@/lib/marketing-analytics';
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

const mobileNavRowClass =
  'focus-ring block w-full rounded-lg px-3 py-2.5 text-left text-base font-medium text-[color:var(--color-text)] transition hover:bg-[color:var(--color-surface-elevated)]';

export function LandingTopBar({ locale, copy, appBaseUrl }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mobilePanelId = useId();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const trialHref = appBaseUrl
    ? `${String(appBaseUrl).replace(/\/$/, '')}/${locale}/signup`
    : `${localeHomePath(locale)}#book-demo`;

  const onTrialClick = () => {
    pushMarketingEvent('marketing_cta_click', {
      cta_id: 'header_trial',
      cta_href: trialHref
    });
  };

  const headerSurface = scrolled
    ? 'border-[color:var(--color-border)]/55 bg-[color:var(--color-surface)]/52 backdrop-blur-xl dark:border-[color:var(--color-border)]/40 dark:bg-[color:var(--color-surface)]/42'
    : 'border-[color:var(--color-border)]/85 bg-[#f3ebe1]/97 dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-elevated)]/94';

  const allNav: Array<{ href: string; label: string }> = [
    { href: '#features', label: copy.topNav.features },
    { href: '#how-it-works', label: copy.topNav.howItWorks },
    { href: '#pillars', label: copy.topNav.benefits },
    { href: '#interface-showcase', label: copy.topNav.interfaceShowcase },
    { href: '#use-cases', label: copy.topNav.useCases },
    { href: '#pricing', label: copy.topNav.pricing },
    { href: '#faq', label: copy.topNav.faq }
  ];

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
          className='hidden min-w-0 grow items-center justify-center gap-1.5 md:flex md:gap-2.5 md:pl-1 lg:gap-4'
          aria-label='Main navigation'
        >
          {allNav.map((item, i) => (
            <a
              key={item.href}
              href={item.href}
              className={`${navLinkClass} ${
                i === 3 || i === 4 ? 'hidden lg:inline' : ''
              }`}
              onClick={() => {
                pushMarketingEvent('marketing_nav_click', { nav_href: item.href });
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className='flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-2.5 md:shrink md:gap-2 lg:gap-3'>
          <div className='shrink-0 sm:mr-0.5 md:mx-0'>
            <HomeControls copy={copy} locale={locale} />
          </div>
          {appBaseUrl ? (
            <a
              href={trialHref}
              target='_blank'
              rel='noopener noreferrer'
              onClick={onTrialClick}
              className={headerCtaClass}
            >
              {copy.topNav.primaryCta}
            </a>
          ) : (
            <Link
              href={trialHref}
              prefetch={false}
              onClick={onTrialClick}
              className={headerCtaClass}
            >
              {copy.topNav.primaryCta}
            </Link>
          )}
          <div className='shrink-0 md:hidden'>
            <button
              type='button'
              className='focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]/80 text-[color:var(--color-text)] shadow-sm'
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? mobilePanelId : undefined}
              onClick={() => {
                setMenuOpen((o) => !o);
                pushMarketingEvent('marketing_mobile_menu_toggle', {
                  open: !menuOpen
                });
              }}
            >
              <span className='sr-only'>
                {menuOpen ? copy.topNav.closeMenu : copy.topNav.openMenu}
              </span>
              {menuOpen ? <IconClose /> : <IconHamburger />}
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <div
          className='fixed inset-0 z-[60] md:hidden'
          id={mobilePanelId}
          role='dialog'
          aria-modal
        >
          <button
            type='button'
            className='absolute inset-0 bg-[color:var(--color-text)]/40 backdrop-blur-sm'
            aria-label={copy.topNav.closeMenu}
            onClick={closeMenu}
          />
          <div className='absolute top-0 right-0 left-0 max-h-[min(90dvh,28rem)] overflow-y-auto border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-2xl dark:bg-[color:var(--color-surface-elevated)]'>
            <div className='mb-1 flex items-center justify-between border-b border-[color:var(--color-border)]/50 px-1 pb-2.5'>
              <span className='text-sm font-semibold text-[color:var(--color-text)]'>
                {copy.logoAlt}
              </span>
              <button
                type='button'
                className='focus-ring rounded-md p-2 text-[color:var(--color-text)]'
                onClick={closeMenu}
                aria-label={copy.topNav.closeMenu}
              >
                <IconClose />
              </button>
            </div>
            <nav
              className='flex flex-col gap-0.5'
              aria-label='Mobile main navigation'
            >
              {allNav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={mobileNavRowClass}
                  onClick={() => {
                    pushMarketingEvent('marketing_nav_click', {
                      nav_href: item.href,
                      nav_scope: 'mobile'
                    });
                    closeMenu();
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function IconHamburger() {
  return (
    <svg
      className='h-5 w-5'
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M4 6h16M4 12h16M4 18h16'
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg
      className='h-5 w-5'
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M6 18L18 6M6 6l12 12'
      />
    </svg>
  );
}
