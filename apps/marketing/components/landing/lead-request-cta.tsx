'use client';

import { useState } from 'react';

import { LeadRequestModal } from '@/components/landing/lead-request-modal';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  /** Stable id for Tracker (source field). */
  source: string;
  lead: HomeMessages['leadForm'];
  appBaseUrl: string | null;
  /** When set (e.g. pricing card), sent as context. */
  planCode?: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Opens the lead request modal when `appBaseUrl` is set; otherwise renders children as mailto link wrapper is not used — parent passes mailto for no-app case.
 */
export function LeadRequestCta({
  locale,
  source,
  lead,
  appBaseUrl,
  planCode,
  className,
  children
}: Props) {
  const [open, setOpen] = useState(false);

  if (!appBaseUrl) {
    return (
      <a href='mailto:sales@quokkaq.com' className={className}>
        {children}
      </a>
    );
  }

  return (
    <>
      <button type='button' className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <LeadRequestModal
        open={open}
        onClose={() => setOpen(false)}
        locale={locale}
        source={source}
        planCode={planCode}
        lead={lead}
      />
    </>
  );
}
