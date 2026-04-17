import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import { defaultLocale, locales, type Locale } from '@/i18n';

const wikiFallbackLocale: Locale = defaultLocale;

function wikiRepoRootCandidates(): string[] {
  const cwd = /* turbopackIgnore: true */ process.cwd();
  return [
    path.resolve(cwd, '..', '..', 'docs', 'wiki'),
    path.resolve(cwd, 'docs', 'wiki')
  ];
}

/** Resolves monorepo `docs/wiki` (works when Next cwd is `apps/frontend` or repo root). */
export function resolveWikiRepoRootSync(): string {
  for (const root of wikiRepoRootCandidates()) {
    if (fs.existsSync(path.join(root, 'README.md'))) {
      return root;
    }
  }
  return wikiRepoRootCandidates()[0];
}

function isSupportedWikiLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function normalizeWikiLocale(raw: string): Locale {
  return isSupportedWikiLocale(raw) ? raw : wikiFallbackLocale;
}

function isSafeSlugSegment(seg: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(seg) && seg.length > 0 && seg.length <= 120;
}

async function tryResolveMarkdownFile(
  localeDir: string,
  parts: string[]
): Promise<string | null> {
  if (parts.length === 0) {
    const p = path.join(localeDir, 'README.md');
    try {
      await fsPromises.access(p);
      return p;
    } catch {
      return null;
    }
  }
  const joined = path.join(localeDir, ...parts);
  const asMd = `${joined}.md`;
  try {
    await fsPromises.access(asMd);
    return asMd;
  } catch {
    /* directory index */
  }
  const asReadme = path.join(joined, 'README.md');
  try {
    await fsPromises.access(asReadme);
    return asReadme;
  } catch {
    return null;
  }
}

export type WikiLoadResult = {
  markdown: string;
  localeUsed: Locale;
  /** Present when `localeUsed` is the fallback translation (currently only `en` when `ru` is missing). */
  fallbackFromLocale?: Locale;
};

/**
 * Loads markdown from `docs/wiki/{locale}/...` with safe slug validation.
 * If `requestedLocale` is `ru` and the page is missing, falls back to `en` (see `docs/wiki/README.md`).
 */
export async function loadWikiPage(
  requestedLocale: string,
  slug: string[] | undefined
): Promise<WikiLoadResult | null> {
  const wikiRoot = resolveWikiRepoRootSync();
  const parts = slug ?? [];
  for (const seg of parts) {
    if (!isSafeSlugSegment(seg)) {
      return null;
    }
  }

  const requested = normalizeWikiLocale(requestedLocale);
  const order: Locale[] =
    requested === wikiFallbackLocale
      ? [wikiFallbackLocale]
      : [requested, wikiFallbackLocale];

  let fallbackFromLocale: Locale | undefined;
  for (let i = 0; i < order.length; i++) {
    const loc = order[i]!;
    const localeDir = path.join(wikiRoot, loc);
    const file = await tryResolveMarkdownFile(localeDir, parts);
    if (file) {
      if (i > 0) {
        fallbackFromLocale = requested;
      }
      const markdown = await fsPromises.readFile(file, 'utf8');
      return { markdown, localeUsed: loc, fallbackFromLocale };
    }
  }
  return null;
}
