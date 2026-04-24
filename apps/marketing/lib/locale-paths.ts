import type { AppLocale } from '@/src/messages';

/** Avoid `` `/${locale}/...` `` in `<Link href>` — Next.js 16 treats that pattern as a dynamic App Router segment. */
export function localeHomePath(locale: AppLocale): '/en' | '/ru' {
  return locale === 'ru' ? '/ru' : '/en';
}

export function localePricingPath(
  locale: AppLocale
): '/en/pricing' | '/ru/pricing' {
  return locale === 'ru' ? '/ru/pricing' : '/en/pricing';
}

export function localePrivacyPath(
  locale: AppLocale
): '/en/privacy' | '/ru/privacy' {
  return locale === 'ru' ? '/ru/privacy' : '/en/privacy';
}

export function localeTermsPath(locale: AppLocale): '/en/terms' | '/ru/terms' {
  return locale === 'ru' ? '/ru/terms' : '/en/terms';
}

export function localeBlogPath(locale: AppLocale): '/en/blog' | '/ru/blog' {
  return locale === 'ru' ? '/ru/blog' : '/en/blog';
}

export function localeBlogPostPath(
  locale: AppLocale,
  slug: string
): `/en/blog/${string}` | `/ru/blog/${string}` {
  const enc = encodeURIComponent(slug);
  return locale === 'ru' ? `/ru/blog/${enc}` : `/en/blog/${enc}`;
}

export function localeRoiPath(locale: AppLocale): '/en/roi' | '/ru/roi' {
  return locale === 'ru' ? '/ru/roi' : '/en/roi';
}
