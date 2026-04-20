/**
 * Absolute URL to the marketing site Privacy Policy for the given locale segment.
 * Uses NEXT_PUBLIC_MARKETING_URL (see `.env.example`); falls back to local marketing dev port.
 */
export function marketingPrivacyPolicyUrl(locale: string): string {
  const raw = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  let origin: string;
  if (raw) {
    try {
      const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
      u.hash = '';
      u.search = '';
      u.pathname = '';
      origin = u.origin;
    } catch {
      origin = 'http://localhost:3010';
    }
  } else {
    origin = 'http://localhost:3010';
  }
  const loc = locale === 'ru' ? 'ru' : 'en';
  return `${origin.replace(/\/$/, '')}/${loc}/privacy`;
}
