/**
 * Canonical origin for the marketing site (metadata, OG, sitemap, robots).
 * Set NEXT_PUBLIC_MARKETING_SITE_URL in production (no trailing slash), e.g. https://quokkaq.com
 */
export function getMarketingSiteOrigin(): URL | null {
  const raw = process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
      u.hash = '';
      u.search = '';
      u.pathname = '';
      return u;
    } catch {
      return null;
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    try {
      return new URL(`https://${vercel}`);
    } catch {
      return null;
    }
  }
  if (process.env.NODE_ENV === 'development') {
    return new URL('http://localhost:3010');
  }
  return null;
}

/**
 * Base URL for Next.js `metadata` / `metadataBase` when resolving relative OG/Twitter image paths.
 * Falls back to local dev origin so `next build` without env does not warn; production should set
 * `NEXT_PUBLIC_MARKETING_SITE_URL` (or rely on `VERCEL_URL`).
 */
export function getMetadataBaseUrl(): URL {
  return getMarketingSiteOrigin() ?? new URL('http://localhost:3010');
}
