import type { Metadata } from 'next';

import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import type { AppLocale } from '@/src/messages';
import { locales } from '@/src/messages';

/** Absolute canonical URL; `segments` are path parts after /[locale]/ (e.g. [], ['privacy'], ['docs', 'foo']). */
export function marketingCanonicalUrl(
  locale: AppLocale,
  segments: string[]
): string {
  const origin = getMetadataBaseUrl();
  const pathFor = (loc: AppLocale) => {
    const parts = [loc, ...segments].join('/');
    return `/${parts}`;
  };
  return new URL(pathFor(locale), origin).toString();
}

export function buildLocaleAlternates(
  locale: AppLocale,
  segments: string[]
): Metadata['alternates'] {
  const canonical = marketingCanonicalUrl(locale, segments);

  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = marketingCanonicalUrl(loc, segments);
  }
  languages['x-default'] = marketingCanonicalUrl('en', segments);

  return {
    canonical,
    languages
  };
}

export function ogLocale(locale: AppLocale): string {
  return locale === 'ru' ? 'ru_RU' : 'en_US';
}
