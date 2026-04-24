import type { MetadataRoute } from 'next';

import { getBlogSlugs } from '@/lib/blog-posts';
import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import { locales } from '@/src/messages';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getMetadataBaseUrl();
  const base = origin.origin;
  const staticSuffixes = ['', 'privacy', 'terms', 'pricing', 'blog', 'roi'];
  const entries: MetadataRoute.Sitemap = [];

  for (const loc of locales) {
    for (const suffix of staticSuffixes) {
      const pathname = suffix ? `/${loc}/${suffix}` : `/${loc}`;
      const priority =
        suffix === ''
          ? 1
          : suffix === 'pricing'
            ? 0.8
            : suffix === 'blog' || suffix === 'roi'
              ? 0.65
              : 0.5;
      entries.push({
        url: `${base}${pathname}`,
        changeFrequency:
          suffix === '' || suffix === 'pricing' || suffix === 'blog'
            ? 'weekly'
            : 'monthly',
        priority
      });
    }
    for (const slug of getBlogSlugs(loc)) {
      entries.push({
        url: `${base}/${loc}/blog/${slug}`,
        changeFrequency: 'monthly',
        priority: 0.55
      });
    }
  }

  return entries;
}
