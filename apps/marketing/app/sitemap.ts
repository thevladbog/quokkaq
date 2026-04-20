import fs from 'node:fs';
import path from 'node:path';

import type { MetadataRoute } from 'next';

import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import { locales } from '@/src/messages';

/** Walks `content/{locale}` for `.mdx` files; add frontmatter to new pages so metadata stays rich. */
function collectDocPathSuffixes(): string[] {
  const root = path.join(process.cwd(), 'content');
  const suffixes = new Set<string>();

  for (const loc of locales) {
    const dir = path.join(root, loc);
    if (!fs.existsSync(dir)) {
      continue;
    }

    const walk = (currentDir: string, rel: string[]) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(currentDir, ent.name);
        if (ent.isDirectory()) {
          walk(full, [...rel, ent.name]);
        } else if (ent.name.endsWith('.mdx')) {
          const base = ent.name.replace(/\.mdx$/, '');
          const segments = base === 'index' ? rel : [...rel, base];
          const suffix = segments.length
            ? `docs/${segments.join('/')}`
            : 'docs';
          suffixes.add(suffix);
        }
      }
    };

    walk(dir, []);
  }

  return [...suffixes];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getMetadataBaseUrl();
  const base = origin.origin;
  const staticSuffixes = ['', 'docs', 'privacy', 'terms'];
  const docSuffixes = collectDocPathSuffixes();
  const suffixes = new Set([...staticSuffixes, ...docSuffixes]);

  const entries: MetadataRoute.Sitemap = [];

  for (const loc of locales) {
    for (const suffix of suffixes) {
      const pathname = suffix ? `/${loc}/${suffix}` : `/${loc}`;
      const priority =
        suffix === ''
          ? 1
          : suffix === 'docs' || suffix.startsWith('docs/')
            ? 0.8
            : 0.5;
      entries.push({
        url: `${base}${pathname}`,
        lastModified: new Date(),
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
