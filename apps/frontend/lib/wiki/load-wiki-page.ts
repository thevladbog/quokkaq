import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import { defaultLocale, locales, type Locale } from '@/i18n';

const wikiFallbackLocale: Locale = defaultLocale;

function wikiContentRootCandidates(): string[] {
  const cwd = /* turbopackIgnore: true */ process.cwd();
  return [
    path.resolve(cwd, '..', '..', 'apps', 'frontend', 'content', 'wiki'),
    path.resolve(cwd, 'apps', 'frontend', 'content', 'wiki'),
    path.resolve(cwd, '..', 'frontend', 'content', 'wiki'),
    path.resolve(cwd, 'content', 'wiki')
  ];
}

/** Resolves `apps/frontend/content/wiki` (MDX operator docs for `/help`; cwd may be repo root or `apps/frontend`). */
export function resolveWikiRepoRootSync(): string {
  for (const root of wikiContentRootCandidates()) {
    if (fs.existsSync(path.join(root, 'en', 'index.mdx'))) {
      return root;
    }
  }
  return wikiContentRootCandidates()[0];
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

/** Strips leading YAML frontmatter from MDX before rendering as plain Markdown in the product app. */
export function stripYamlFrontmatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  if (match) {
    return source.slice(match[0].length);
  }
  return source;
}

async function tryResolveDocFile(
  localeDir: string,
  parts: string[]
): Promise<string | null> {
  if (parts.length === 0) {
    const indexMdx = path.join(localeDir, 'index.mdx');
    try {
      await fsPromises.access(indexMdx);
      return indexMdx;
    } catch {
      return null;
    }
  }
  const joined = path.join(localeDir, ...parts);
  const asMdx = `${joined}.mdx`;
  try {
    await fsPromises.access(asMdx);
    return asMdx;
  } catch {
    /* directory index */
  }
  const indexInDir = path.join(joined, 'index.mdx');
  try {
    await fsPromises.access(indexInDir);
    return indexInDir;
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
 * Loads markdown from `apps/frontend/content/wiki/{locale}/...` with safe slug validation.
 * If `requestedLocale` is `ru` and the page is missing, falls back to `en`.
 */
export async function loadWikiPage(
  requestedLocale: string,
  slug: string[] | undefined
): Promise<WikiLoadResult | null> {
  const contentRoot = resolveWikiRepoRootSync();
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
    const localeDir = path.join(contentRoot, loc);
    const file = await tryResolveDocFile(localeDir, parts);
    if (file) {
      if (i > 0) {
        fallbackFromLocale = requested;
      }
      const raw = await fsPromises.readFile(file, 'utf8');
      const markdown = stripYamlFrontmatter(raw);
      return { markdown, localeUsed: loc, fallbackFromLocale };
    }
  }
  return null;
}
