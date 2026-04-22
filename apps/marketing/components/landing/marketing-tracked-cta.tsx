'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { pushMarketingEvent } from '@/lib/marketing-analytics';

type TrackedAProps = ComponentProps<'a'> & {
  ctaId: string;
};

export function MarketingTrackedCtaA({
  ctaId,
  onClick,
  className,
  children,
  href,
  ...rest
}: TrackedAProps) {
  return (
    <a
      {...rest}
      href={href}
      className={className}
      onClick={(e) => {
        pushMarketingEvent('marketing_cta_click', {
          cta_id: ctaId,
          cta_href: String(href ?? '')
        });
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}

type TrackedLinkProps = ComponentProps<typeof Link> & {
  ctaId: string;
};

export function MarketingTrackedCtaLink({
  ctaId,
  onClick,
  className,
  children,
  href,
  ...rest
}: TrackedLinkProps) {
  return (
    <Link
      {...rest}
      href={href}
      className={className}
      onClick={(e) => {
        const ctaPath =
          typeof href === 'string'
            ? href
            : (href as { pathname?: string }).pathname;
        pushMarketingEvent('marketing_cta_click', {
          cta_id: ctaId,
          cta_href: ctaPath != null ? String(ctaPath) : ''
        });
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
