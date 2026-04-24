import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import matter from 'gray-matter';

import type { AppLocale } from '@/src/messages';

const BLOG_ROOT = join(process.cwd(), 'content', 'blog');

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
};

export type BlogPost = BlogPostMeta & { body: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function listSlugsForLocale(locale: AppLocale): string[] {
  const dir = join(BLOG_ROOT, locale);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/i, ''))
    .filter((slug) => SLUG_RE.test(slug));
}

export function getBlogSlugs(locale: AppLocale): string[] {
  return listSlugsForLocale(locale);
}

export function getBlogPost(locale: AppLocale, slug: string): BlogPost | null {
  if (!SLUG_RE.test(slug)) {
    return null;
  }
  const file = join(BLOG_ROOT, locale, `${slug}.md`);
  if (!existsSync(file)) {
    return null;
  }
  const raw = readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  if (
    typeof data.title !== 'string' ||
    typeof data.description !== 'string' ||
    typeof data.date !== 'string'
  ) {
    return null;
  }
  return {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    body: content.trim()
  };
}

export function getBlogPostsMeta(locale: AppLocale): BlogPostMeta[] {
  return listSlugsForLocale(locale)
    .map((slug) => {
      const post = getBlogPost(locale, slug);
      if (!post) {
        return null;
      }
      return {
        slug: post.slug,
        title: post.title,
        description: post.description,
        date: post.date
      };
    })
    .filter((p): p is BlogPostMeta => p != null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
