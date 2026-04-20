'use client';

import { openCookieConsentPreferences } from '@/lib/cookie-consent-open';

type Props = {
  label: string;
  className?: string;
};

/** Footer / legal: reopen the cookie banner when GTM is configured (`NEXT_PUBLIC_GTM_ID`). */
export function CookieSettingsButton({ label, className }: Props) {
  if (!process.env.NEXT_PUBLIC_GTM_ID?.trim()) {
    return null;
  }
  return (
    <button
      type='button'
      onClick={() => openCookieConsentPreferences()}
      className={className}
    >
      {label}
    </button>
  );
}
