import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BlogMarkdown } from '@/components/landing/blog-markdown';
import { LandingFooterCta } from '@/components/landing/landing-footer-cta';
import { LandingTopBar } from '@/components/landing/landing-top-bar';
import { getBlogPost, getBlogSlugs } from '@/lib/blog-posts';
import { marketingAppBaseUrl } from '@/lib/fetch-marketing-subscription-plans';
import {
  buildLocaleAlternates,
  marketingCanonicalUrl,
  ogLocale
} from '@/lib/marketing-metadata';
import { localeBlogPath } from '@/lib/locale-paths';
import { isAppLocale, locales, messages } from '@/src/messages';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  const out: { locale: string; slug: string }[] = [];
  for (const loc of locales) {
    for (const slug of getBlogSlugs(loc)) {
      out.push({ locale: loc, slug });
    }
  }
  return out;
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isAppLocale(raw)) {
    return {};
  }
  const post = getBlogPost(raw, slug);
  if (!post) {
    return {};
  }
  const brand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const alternates = buildLocaleAlternates(raw, ['blog', slug]);
  const canonicalUrl = marketingCanonicalUrl(raw, ['blog', slug]);

  return {
    title: { absolute: `${post.title} | ${brand}` },
    description: post.description,
    alternates,
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      siteName: brand,
      locale: ogLocale(raw),
      alternateLocale: [raw === 'en' ? 'ru_RU' : 'en_US'],
      url: canonicalUrl,
      images: [{ url: `/${raw}/opengraph-image`, width: 1200, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [`/${raw}/opengraph-image`]
    }
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale: raw, slug } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const post = getBlogPost(raw, slug);
  if (!post) {
    notFound();
  }

  const t = messages[raw];
  const appBaseUrl = marketingAppBaseUrl();
  const dateFmt = new Intl.DateTimeFormat(raw === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className='landing-page flex min-h-dvh flex-col'>
      <LandingTopBar copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
      <main className='relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip py-16 sm:py-20'>
        <article className='mx-auto max-w-3xl px-4 sm:px-6 lg:px-8'>
          <Link
            href={localeBlogPath(raw)}
            prefetch={false}
            className='focus-ring text-sm font-semibold text-[color:var(--color-primary)] underline-offset-2 hover:underline'
          >
            ← {t.blog.postBackToBlog}
          </Link>
          <header className='mt-8'>
            <p className='text-xs font-medium tracking-wide text-[color:var(--color-text-muted)] uppercase'>
              {t.blog.publishedPrefix}{' '}
              <time dateTime={post.date}>
                {dateFmt.format(new Date(post.date))}
              </time>
            </p>
            <h1 className='font-display mt-3 text-4xl font-bold tracking-tight text-[color:var(--color-text)]'>
              {post.title}
            </h1>
            <p className='mt-4 text-lg text-[color:var(--color-text-muted)]'>
              {post.description}
            </p>
          </header>
          <div className='mt-12'>
            <BlogMarkdown markdown={post.body} />
          </div>
        </article>
      </main>
      <LandingFooterCta copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
    </div>
  );
}
