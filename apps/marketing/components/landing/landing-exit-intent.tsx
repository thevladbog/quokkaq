'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';

import { parseConsentFromRawCookieHeader } from '@/lib/cookie-consent';
import { localeHomePath } from '@/lib/locale-paths';
import type { AppLocale, ExitIntentMessages } from '@/src/messages';

const SESSION_KEY = 'quokkaq_marketing_exit_intent_v1';

function getGtmId(): string | undefined {
  return process.env.NEXT_PUBLIC_GTM_ID?.trim() || undefined;
}

type Props = {
  locale: AppLocale;
  copy: ExitIntentMessages;
};

/**
 * Shown at most once per session, desktop only, only after analytics cookies are accepted.
 */
export function LandingExitIntent({ locale, copy }: Props) {
  const gtmId = getGtmId();
  const titleId = useId();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!gtmId || typeof window === 'undefined') {
      return;
    }

    const consent = parseConsentFromRawCookieHeader(document.cookie);
    if (!consent?.analytics) {
      return;
    }

    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        return;
      }
    } catch {
      return;
    }

    const mq = window.matchMedia('(min-width: 1024px)');
    if (!mq.matches) {
      return;
    }

    const maybeOpen = (e: MouseEvent) => {
      if (e.clientY > 8) {
        return;
      }
      try {
        if (sessionStorage.getItem(SESSION_KEY)) {
          return;
        }
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        return;
      }
      setOpen(true);
    };

    document.documentElement.addEventListener('mouseleave', maybeOpen, true);
    return () =>
      document.documentElement.removeEventListener(
        'mouseleave',
        maybeOpen,
        true
      );
  }, [gtmId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const demoHref = `${localeHomePath(locale)}#book-demo`;
  const mailto = `mailto:sales@quokkaq.com?subject=${encodeURIComponent(copy.mailtoSubject)}`;

  return (
    <div
      className='fixed inset-0 z-[160] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center'
      role='presentation'
      onClick={close}
    >
      <div
        role='dialog'
        aria-modal
        aria-labelledby={titleId}
        className='w-full max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-2xl dark:bg-[color:var(--color-surface-elevated)]'
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          className='font-display text-xl font-bold tracking-tight text-[color:var(--color-text)]'
        >
          {copy.title}
        </h2>
        <p className='mt-3 text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
          {copy.body}
        </p>
        <div className='mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
          <Link
            href={demoHref}
            prefetch={false}
            className='focus-ring inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md shadow-[color:var(--color-primary)]/25 transition hover:bg-[color:var(--color-primary-hover)]'
          >
            {copy.bookDemoCta}
          </Link>
          <a
            href={mailto}
            className='focus-ring inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-2.5 text-center text-sm font-semibold text-[color:var(--color-text)] transition hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)] dark:bg-[color:var(--color-surface-elevated)]'
          >
            {copy.emailSalesCta}
          </a>
        </div>
        <button
          type='button'
          onClick={close}
          className='focus-ring mt-4 w-full rounded-lg py-2 text-sm font-medium text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-elevated)]'
        >
          {copy.dismiss}
        </button>
      </div>
    </div>
  );
}
