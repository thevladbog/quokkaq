'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { useMarketingTheme } from '@/app/marketing-theme';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
};

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const controlClass =
  'focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3.5 text-sm font-medium text-[color:var(--color-text)] transition hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)] dark:bg-[color:var(--color-surface-elevated)]';

export function HomeControls({ locale, copy }: Props) {
  const { resolvedTheme, setTheme } = useMarketingTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  const other: AppLocale = locale === 'en' ? 'ru' : 'en';

  return (
    <div className='flex flex-wrap items-center justify-end gap-2 sm:gap-3'>
      <Link
        className={controlClass}
        href={`/${other}`}
        prefetch={false}
        aria-label={other === 'en' ? 'English' : 'Русский'}
      >
        {other === 'en' ? 'EN' : 'RU'}
      </Link>
      <button
        type='button'
        className={controlClass}
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
        {!mounted
          ? '…'
          : resolvedTheme === 'dark'
            ? copy.themeUseLight
            : copy.themeUseDark}
      </button>
    </div>
  );
}
