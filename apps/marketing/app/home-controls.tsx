'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { useMarketingTheme } from '@/app/marketing-theme';
import { writeStoredMarketingLocale } from '@/lib/marketing-locale-preference';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
};

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
    >
      <circle cx='12' cy='12' r='10' />
      <path d='M2 12h20' />
      <path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width='20'
      height='20'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
    >
      <path d='M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z' />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width='20'
      height='20'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
    >
      <circle cx='12' cy='12' r='4' />
      <path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' />
    </svg>
  );
}

const langPillClass =
  'focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--color-primary)]/40 bg-[color:var(--color-surface)]/85 px-3 text-sm font-medium text-[color:var(--color-text)] shadow-sm backdrop-blur-sm transition hover:border-[color:var(--color-primary)]/65 hover:bg-[color:var(--color-surface)] dark:border-[color:var(--color-primary)]/35 dark:bg-[color:var(--color-surface-elevated)]/80 dark:hover:border-[color:var(--color-primary)]/55';

const themeIconBtnClass =
  'focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-primary)]/40 bg-[color:var(--color-surface)]/85 text-[color:var(--color-text)] shadow-sm backdrop-blur-sm transition hover:border-[color:var(--color-primary)]/65 hover:bg-[color:var(--color-surface)] dark:border-[color:var(--color-primary)]/35 dark:bg-[color:var(--color-surface-elevated)]/80 dark:hover:border-[color:var(--color-primary)]/55';

export function HomeControls({ locale, copy }: Props) {
  const { resolvedTheme, setTheme } = useMarketingTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  const other: AppLocale = locale === 'en' ? 'ru' : 'en';
  const langCode = other === 'en' ? 'EN' : 'RU';

  return (
    <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
      <Link
        className={langPillClass}
        href={`/${other}`}
        prefetch={false}
        scroll={false}
        aria-label={other === 'en' ? 'English' : 'Русский'}
        onClick={() => {
          writeStoredMarketingLocale(other);
        }}
      >
        <GlobeIcon className='shrink-0 text-[color:var(--color-primary)]' />
        <span className='tabular-nums'>{langCode}</span>
      </Link>
      <button
        type='button'
        className={themeIconBtnClass}
        onClick={() =>
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
        }
        aria-label={
          !mounted
            ? copy.themeUseDark
            : resolvedTheme === 'dark'
              ? copy.themeUseLight
              : copy.themeUseDark
        }
      >
        {!mounted ? (
          <MoonIcon className='opacity-40' />
        ) : resolvedTheme === 'dark' ? (
          <SunIcon />
        ) : (
          <MoonIcon />
        )}
      </button>
    </div>
  );
}
