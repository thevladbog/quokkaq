import type { MetadataRoute } from 'next';

import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import { locales } from '@/src/messages';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getMetadataBaseUrl();
  const base = origin.origin;
  const staticSuffixes = ['', 'privacy', 'terms'];
  const entries: MetadataRoute.Sitemap = [];

  for (const loc of locales) {
    for (const suffix of staticSuffixes) {
      const pathname = suffix ? `/${loc}/${suffix}` : `/${loc}`;
      const priority = suffix === '' ? 1 : 0.5;
      entries.push({
        url: `${base}${pathname}`,
        changeFrequency:
          suffix === '' || suffix === 'privacy' || suffix === 'terms'
            ? 'monthly'
            : 'weekly',
        priority
      });
    }
  }

  return entries;
}
