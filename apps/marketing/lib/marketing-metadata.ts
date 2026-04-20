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
  const origin = getMetadataBaseUrl();

  const pathFor = (loc: AppLocale) => {
    const parts = [loc, ...segments].join('/');
    return `/${parts}`;
  };

  const canonical = new URL(pathFor(locale), origin).toString();

  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = new URL(pathFor(loc), origin).toString();
  }
  languages['x-default'] = new URL(pathFor('en'), origin).toString();

  return {
    canonical,
    languages
  };
}

export function ogLocale(locale: AppLocale): string {
  return locale === 'ru' ? 'ru_RU' : 'en_US';
}
