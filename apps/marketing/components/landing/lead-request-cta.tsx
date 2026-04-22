'use client';

import { useState } from 'react';

import { pushMarketingEvent } from '@/lib/marketing-analytics';
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
  /** month | annual — passed to the lead API when set. */
  billingPeriod?: string;
  className?: string;
  children: React.ReactNode;
  onOpen?: () => void;
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
  billingPeriod,
  className,
  onOpen,
  children
}: Props) {
  const [open, setOpen] = useState(false);

  if (!appBaseUrl) {
    return (
      <a
        href='mailto:sales@quokkaq.com'
        className={className}
        onClick={() => {
          pushMarketingEvent('marketing_lead_open', {
            source: `${source}_mailto`,
            plan_code: planCode?.trim() ?? '',
            billing_period: billingPeriod?.trim() || 'month'
          });
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <>
      <button
        type='button'
        className={className}
        onClick={() => {
          setOpen(true);
          pushMarketingEvent('marketing_lead_open', {
            source,
            plan_code: planCode?.trim() ?? '',
            billing_period: billingPeriod?.trim() || 'month'
          });
          onOpen?.();
        }}
      >
        {children}
      </button>
      <LeadRequestModal
        open={open}
        onClose={() => setOpen(false)}
        locale={locale}
        source={source}
        planCode={planCode}
        billingPeriod={billingPeriod}
        lead={lead}
      />
    </>
  );
}
