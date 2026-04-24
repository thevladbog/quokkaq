'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';

import {
  COOKIE_CONSENT_MAX_AGE_SEC,
  COOKIE_CONSENT_NAME,
  parseConsentFromRawCookieHeader,
  serializeConsent,
  type StoredConsentV1
} from '@/lib/cookie-consent';
import { registerCookieConsentOpener } from '@/lib/cookie-consent-open';
import { localePrivacyPath } from '@/lib/locale-paths';
import type { AppLocale } from '@/src/messages';
import { messages } from '@/src/messages';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let consentDefaultPushed = false;
let gtmScriptInjected = false;

function getGtmId(): string | undefined {
  return process.env.NEXT_PUBLIC_GTM_ID?.trim() || undefined;
}

function initDataLayerAndDefaultConsent() {
  if (typeof window === 'undefined') {
    return;
  }
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      /* eslint-disable prefer-rest-params -- align with Google's gtag(): dataLayer.push(arguments) */
      window.dataLayer.push(arguments);
    };
  }
  if (consentDefaultPushed) {
    return;
  }
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
  consentDefaultPushed = true;
}

function consentUpdateAllGranted() {
  window.gtag?.('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });
}

function injectGtm(gtmId: string) {
  if (typeof document === 'undefined' || gtmScriptInjected) {
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    'gtm.start': new Date().getTime(),
    event: 'gtm.js'
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(s);
  gtmScriptInjected = true;
}

function readConsentCookie(): StoredConsentV1 | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return parseConsentFromRawCookieHeader(document.cookie);
}

function writeConsentCookie(state: StoredConsentV1) {
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:'
      ? ';Secure'
      : '';
  const body = encodeURIComponent(serializeConsent(state));
  document.cookie = `${COOKIE_CONSENT_NAME}=${body};path=/;max-age=${COOKIE_CONSENT_MAX_AGE_SEC};SameSite=Lax${secure}`;
}

type CookieConsentProps = {
  /**
   * Not named `locale` — Next.js 16 + RSC can mis-handle a prop called `locale` together with
   * `next/link` and surface bogus `href` values like `/[locale]/privacy`.
   */
  appLocale: AppLocale;
};

export function CookieConsentAndGtm({ appLocale }: CookieConsentProps) {
  const t = messages[appLocale].cookieConsent;
  const privacyHref = localePrivacyPath(appLocale);
  const gtmId = getGtmId();

  const [visible, setVisible] = useState(false);

  const applyGranted = useCallback(() => {
    if (!gtmId) {
      return;
    }
    consentUpdateAllGranted();
    injectGtm(gtmId);
  }, [gtmId]);

  useEffect(() => {
    if (!gtmId) {
      return;
    }
    initDataLayerAndDefaultConsent();
    const stored = readConsentCookie();
    startTransition(() => {
      if (stored) {
        if (stored.analytics) {
          applyGranted();
        }
        setVisible(false);
      } else {
        setVisible(true);
      }
    });
  }, [gtmId, applyGranted]);

  useEffect(() => {
    if (!gtmId) {
      return;
    }
    registerCookieConsentOpener(() => {
      startTransition(() => setVisible(true));
    });
    return () => registerCookieConsentOpener(null);
  }, [gtmId]);

  const onAccept = () => {
    writeConsentCookie({ v: 1, analytics: true });
    applyGranted();
    setVisible(false);
  };

  const onReject = () => {
    writeConsentCookie({ v: 1, analytics: false });
    setVisible(false);
  };

  if (!gtmId || !visible) {
    return null;
  }

  return (
    <section
      aria-labelledby='cookie-consent-title'
      className='fixed right-0 bottom-0 left-0 z-[200] border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]/98 p-4 shadow-[0_-8px_32px_rgb(0_0_0/0.12)] backdrop-blur-md sm:p-5 dark:bg-[color:var(--color-surface-elevated)]/95'
    >
      <div className='mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6'>
        <div className='min-w-0 flex-1'>
          <h2
            id='cookie-consent-title'
            className='font-display text-lg font-semibold tracking-tight text-[color:var(--color-text)]'
          >
            {t.title}
          </h2>
          <p className='mt-2 text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
            {t.description}{' '}
            <a
              href={privacyHref}
              className='font-medium text-[color:var(--color-primary)] underline-offset-2 hover:underline'
            >
              {t.privacyLinkLabel}
            </a>
          </p>
        </div>
        <div className='flex shrink-0 flex-wrap items-center gap-2 sm:justify-end'>
          <button
            type='button'
            onClick={onReject}
            className='focus-ring rounded-xl border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--color-text)] transition hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]'
          >
            {t.rejectNonEssential}
          </button>
          <button
            type='button'
            onClick={onAccept}
            className='focus-ring rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[color:var(--color-primary)]/25 transition hover:bg-[color:var(--color-primary-hover)]'
          >
            {t.acceptAll}
          </button>
        </div>
      </div>
    </section>
  );
}
