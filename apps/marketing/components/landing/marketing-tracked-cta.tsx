'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { pushMarketingEvent } from '@/lib/marketing-analytics';

type LinkHref = ComponentProps<typeof Link>['href'];

/** Serializes `Link` `href` for analytics (string or UrlObject with query + hash). */
function linkHrefToCtaString(href: LinkHref): string {
  if (typeof href === 'string') {
    return href;
  }
  if (href == null || typeof href !== 'object') {
    return '';
  }
  const o = href as {
    pathname?: string;
    query?: Record<string, string | string[] | undefined> | string;
    hash?: string;
    search?: string;
  };
  let out = o.pathname ?? '';
  if (o.search) {
    out += o.search.startsWith('?') ? o.search : `?${o.search}`;
  } else if (o.query && typeof o.query === 'object') {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(o.query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          usp.append(k, String(item));
        }
      } else {
        usp.set(k, String(v));
      }
    }
    const q = usp.toString();
    if (q) {
      out += out.includes('?') ? `&${q}` : `?${q}`;
    }
  } else if (typeof o.query === 'string' && o.query) {
    out += o.query.startsWith('?') ? o.query : `?${o.query}`;
  }
  if (o.hash) {
    out += o.hash.startsWith('#') ? o.hash : `#${o.hash}`;
  }
  return out;
}

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
        pushMarketingEvent('marketing_cta_click', {
          cta_id: ctaId,
          cta_href: linkHrefToCtaString(href)
        });
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
