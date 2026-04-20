/**
 * Canonical origin for the marketing site (metadata, OG, sitemap, robots).
 * Set NEXT_PUBLIC_MARKETING_SITE_URL in production (no trailing slash), e.g. https://quokkaq.com
 */
export function getMarketingSiteOrigin(): URL | null {
  const raw = process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(
        raw.startsWith('//')
          ? `https:${raw}`
          : raw.includes('://')
            ? raw
            : `https://${raw}`
      );
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return null;
      }
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
 * In development, falls back to http://localhost:3010 when unset. In production, requires
 * `NEXT_PUBLIC_MARKETING_SITE_URL` or `VERCEL_URL` so canonical URLs are never published as localhost.
 */
export function getMetadataBaseUrl(): URL {
  const origin = getMarketingSiteOrigin();
  if (origin) {
    return origin;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Marketing site origin is not configured: set NEXT_PUBLIC_MARKETING_SITE_URL (or deploy on Vercel so VERCEL_URL is set).'
    );
  }
  return new URL('http://localhost:3010');
}
