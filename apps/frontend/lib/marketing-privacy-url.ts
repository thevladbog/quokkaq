/**
 * Absolute URL to the marketing site Privacy Policy for the given locale segment.
 * Uses `NEXT_PUBLIC_MARKETING_SITE_URL`, with legacy fallback `NEXT_PUBLIC_MARKETING_URL`.
 */
function resolveMarketingOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_MARKETING_URL?.trim();

  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.APP_ENV === 'production';

  if (!raw) {
    if (isProd) {
      throw new Error(
        'Marketing site URL is not configured: set NEXT_PUBLIC_MARKETING_SITE_URL (preferred) or NEXT_PUBLIC_MARKETING_URL for marketingPrivacyPolicyUrl().'
      );
    }
    console.warn(
      '[marketingPrivacyPolicyUrl] NEXT_PUBLIC_MARKETING_SITE_URL / NEXT_PUBLIC_MARKETING_URL unset; using http://localhost:3010'
    );
    return 'http://localhost:3010';
  }

  try {
    const u = new URL(
      raw.startsWith('//')
        ? `https:${raw}`
        : raw.includes('://')
          ? raw
          : `https://${raw}`
    );
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error(`unsupported protocol ${u.protocol}`);
    }
    u.hash = '';
    u.search = '';
    u.pathname = '';
    return u.origin;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (isProd) {
      throw new Error(
        `Invalid NEXT_PUBLIC_MARKETING_SITE_URL / NEXT_PUBLIC_MARKETING_URL: "${raw}" (${detail})`
      );
    }
    console.warn(
      `[marketingPrivacyPolicyUrl] invalid marketing URL "${raw}": ${detail}; using http://localhost:3010`
    );
    return 'http://localhost:3010';
  }
}

export function marketingPrivacyPolicyUrl(locale: string): string {
  const origin = resolveMarketingOrigin().replace(/\/$/, '');
  const loc = locale === 'ru' ? 'ru' : 'en';
  return `${origin}/${loc}/privacy`;
}
