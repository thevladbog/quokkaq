'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react';

import { HomeControls } from '@/app/home-controls';
import { dispatchMarketingMobileNavOpen } from '@/lib/marketing-mobile-nav-event';
import { pushMarketingEvent } from '@/lib/marketing-analytics';
import { localeHomePath } from '@/lib/locale-paths';
import type { AppLocale, HomeMessages } from '@/src/messages';

import { TextLogoImg } from './text-logo-img';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
  appBaseUrl: string | null;
};

type NavItem = { href: string; label: string };

const navLinkClass =
  'focus-ring whitespace-nowrap text-sm font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]';

const headerCtaClass =
  'focus-ring inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] px-3 py-2 text-xs font-semibold text-white shadow-md shadow-[color:var(--color-primary)]/25 transition hover:brightness-105 sm:px-4 sm:py-2.5 sm:text-sm';

const overflowLinkClass =
  'focus-ring block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[color:var(--color-text)] transition hover:bg-[color:var(--color-surface-elevated)]';

const DESKTOP_NAV_MIN_WIDTH = '(min-width: 1536px)';
const COMPACT_NAV_GAP_PX = 8;
/** Reserve width for the “More” control + gap until it can be measured. */
const MORE_BUTTON_RESERVE_PX = 96;

function computeVisibleCount(
  shellWidth: number,
  widths: number[],
  moreReserve: number,
  gap: number
): number {
  const n = widths.length;
  if (n === 0 || shellWidth <= 0) {
    return 0;
  }
  if (widths.every((w) => w <= 0)) {
    return n;
  }

  let best = 0;
  for (let k = 0; k <= n; k++) {
    const rest = n - k;
    const needMore = rest > 0;
    let sum = 0;
    for (let i = 0; i < k; i++) {
      sum += widths[i] + (i > 0 ? gap : 0);
    }
    const total = sum + (needMore ? gap + moreReserve : 0);
    if (total <= shellWidth) {
      best = k;
    }
  }
  return best;
}

function IconChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`ml-0.5 h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden
    >
      <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
    </svg>
  );
}

function TopBarCompactNav({
  items,
  topNav
}: {
  items: NavItem[];
  topNav: HomeMessages['topNav'];
}) {
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const remeasure = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.matchMedia(DESKTOP_NAV_MIN_WIDTH).matches) {
      setVisibleCount(items.length);
      setMoreOpen(false);
      return;
    }

    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const widths = items.map(
      (_, i) => measureRefs.current[i]?.getBoundingClientRect().width ?? 0
    );
    if (widths.some((w) => w <= 0)) {
      return;
    }

    const moreReserve = MORE_BUTTON_RESERVE_PX;

    const next = computeVisibleCount(
      shell.clientWidth,
      widths,
      moreReserve,
      COMPACT_NAV_GAP_PX
    );
    setVisibleCount(next);
  }, [items]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const run = () => requestAnimationFrame(remeasure);
    run();
    requestAnimationFrame(() => requestAnimationFrame(remeasure));
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(remeasure);
    });
    ro.observe(shell);
    window.addEventListener('resize', remeasure);
    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) {
          requestAnimationFrame(remeasure);
        }
      });
    }
    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [remeasure]);

  useEffect(() => {
    dispatchMarketingMobileNavOpen(moreOpen);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || moreWrapRef.current?.contains(t)) {
        return;
      }
      setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) {
      return;
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);

  const onNav = (href: string, scope?: string) => {
    pushMarketingEvent('marketing_nav_click', {
      nav_href: href,
      ...(scope ? { nav_scope: scope } : {})
    });
  };

  return (
    <nav
      className='relative flex min-h-10 w-full min-w-0 flex-1 items-center 2xl:hidden'
      aria-label={topNav.navAriaLabel}
    >
      <div
        ref={shellRef}
        className='flex min-h-10 w-full max-w-full min-w-0 flex-1 justify-end'
      >
        <div
          className='pointer-events-none fixed top-0 left-0 -z-10 flex gap-2 opacity-0'
          aria-hidden
        >
          {items.map((item, i) => (
            <span
              key={item.href}
              ref={(el) => {
                measureRefs.current[i] = el;
              }}
              className={`${navLinkClass} inline-flex shrink-0`}
            >
              {item.label}
            </span>
          ))}
        </div>

        {/*
          Do not use overflow-hidden here: the overflow menu is position:absolute below the row
          and would be clipped (looks like “click does nothing”).
        */}
        <div className='flex max-w-full min-w-0 items-center justify-end gap-2'>
          {visible.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={navLinkClass}
              onClick={() => onNav(item.href)}
            >
              {item.label}
            </a>
          ))}
          {overflow.length > 0 ? (
            <div ref={moreWrapRef} className='relative shrink-0'>
              <button
                type='button'
                className={`${navLinkClass} inline-flex cursor-pointer items-center border-0 bg-transparent p-0 shadow-none`}
                aria-expanded={moreOpen}
                aria-haspopup='menu'
                aria-controls={panelId}
                onClick={() => {
                  setMoreOpen((o) => {
                    const next = !o;
                    pushMarketingEvent('marketing_nav_overflow_toggle', {
                      open: next
                    });
                    return next;
                  });
                }}
              >
                {topNav.moreNav}
                <IconChevronDown open={moreOpen} />
              </button>
              {moreOpen ? (
                <div
                  ref={panelRef}
                  id={panelId}
                  role='menu'
                  aria-label={topNav.moreNavMenuAriaLabel}
                  className='absolute top-full right-0 z-50 mt-1.5 max-w-[min(22rem,calc(100vw-2rem))] min-w-[12rem] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-1 shadow-xl dark:bg-[color:var(--color-surface-elevated)]'
                >
                  {overflow.map((item) => (
                    <a
                      key={item.href}
                      role='menuitem'
                      href={item.href}
                      className={overflowLinkClass}
                      onClick={() => {
                        onNav(item.href, 'overflow');
                        setMoreOpen(false);
                      }}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

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

  const onTrialClick = () => {
    pushMarketingEvent('marketing_cta_click', {
      cta_id: 'header_trial',
      cta_href: trialHref
    });
  };

  const headerSurface = scrolled
    ? 'border-[color:var(--color-border)]/55 bg-[color:var(--color-surface)]/52 backdrop-blur-xl dark:border-[color:var(--color-border)]/40 dark:bg-[color:var(--color-surface)]/42'
    : 'border-[color:var(--color-border)]/85 bg-[#f3ebe1]/97 dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-elevated)]/94';

  const allNav: NavItem[] = [
    { href: '#features', label: copy.topNav.features },
    { href: '#how-it-works', label: copy.topNav.howItWorks },
    { href: '#pillars', label: copy.topNav.benefits },
    { href: '#interface-showcase', label: copy.topNav.interfaceShowcase },
    { href: '#use-cases', label: copy.topNav.useCases },
    { href: '#book-demo', label: copy.topNav.bookDemo },
    { href: '#pricing', label: copy.topNav.pricing },
    { href: '#faq', label: copy.topNav.faq }
  ];

  return (
    <header
      className={`landing-reveal landing-top-bar sticky top-0 z-50 border-b transition-[background-color,backdrop-filter,border-color] duration-300 ease-out ${headerSurface}`}
    >
      <div className='mx-auto flex max-w-7xl min-w-0 items-center justify-between gap-2 px-4 py-3.5 sm:gap-3 sm:px-6 sm:py-4 lg:px-8'>
        <Link
          href={localeHomePath(locale)}
          prefetch={false}
          className='focus-ring relative z-10 shrink-0 rounded-md'
          aria-label={copy.logoAlt}
        >
          <TextLogoImg locale={locale} className='h-8 w-auto sm:h-9' />
        </Link>

        <div className='flex min-w-0 flex-1 items-center justify-end 2xl:justify-center'>
          <TopBarCompactNav items={allNav} topNav={copy.topNav} />
          <nav
            className='3xl:gap-4 hidden min-h-10 max-w-full min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 2xl:flex 2xl:gap-3 [&::-webkit-scrollbar]:hidden'
            aria-label={copy.topNav.navAriaLabel}
          >
            {allNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={navLinkClass}
                onClick={() => {
                  pushMarketingEvent('marketing_nav_click', {
                    nav_href: item.href
                  });
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className='relative z-10 flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 2xl:gap-3'>
          <div className='shrink-0 sm:mr-0.5 2xl:mx-0'>
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
        </div>
      </div>
    </header>
  );
}
