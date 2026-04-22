import type { MetadataRoute } from 'next';

import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import { locales } from '@/src/messages';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getMetadataBaseUrl();
  const base = origin.origin;
  const staticSuffixes = ['', 'privacy', 'terms', 'pricing'];
  const entries: MetadataRoute.Sitemap = [];

  for (const loc of locales) {
    for (const suffix of staticSuffixes) {
      const pathname = suffix ? `/${loc}/${suffix}` : `/${loc}`;
      const priority =
        suffix === '' ? 1 : suffix === 'pricing' ? 0.8 : 0.5;
      entries.push({
        url: `${base}${pathname}`,
        changeFrequency: suffix === '' || suffix === 'pricing' ? 'weekly' : 'monthly',
        priority
      });
    }
  }

  return entries;
}
