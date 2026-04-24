import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LandingFooterCta } from '@/components/landing/landing-footer-cta';
import { LandingTopBar } from '@/components/landing/landing-top-bar';
import { getBlogPostsMeta } from '@/lib/blog-posts';
import {
  buildLocaleAlternates,
  marketingCanonicalUrl,
  ogLocale
} from '@/lib/marketing-metadata';
import { localeBlogPostPath } from '@/lib/locale-paths';
import { marketingAppBaseUrl } from '@/lib/fetch-marketing-subscription-plans';
import { isAppLocale, messages } from '@/src/messages';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    return {};
  }
  const b = messages[raw].blog;
  const brand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const alternates = buildLocaleAlternates(raw, ['blog']);
  const canonicalUrl = marketingCanonicalUrl(raw, ['blog']);

  return {
    title: { absolute: `${b.metaTitle} | ${brand}` },
    description: b.metaDescription,
    alternates,
    openGraph: {
      type: 'website',
      title: b.metaTitle,
      description: b.metaDescription,
      siteName: brand,
      locale: ogLocale(raw),
      alternateLocale: [raw === 'en' ? 'ru_RU' : 'en_US'],
      url: canonicalUrl,
      images: [{ url: `/${raw}/opengraph-image`, width: 1200, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title: b.metaTitle,
      description: b.metaDescription,
      images: [`/${raw}/opengraph-image`]
    }
  };
}

export default async function BlogIndexPage({ params }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const t = messages[raw];
  const posts = getBlogPostsMeta(raw);
  const appBaseUrl = marketingAppBaseUrl();
  const dateFmt = new Intl.DateTimeFormat(raw === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className='landing-page flex min-h-dvh flex-col'>
      <LandingTopBar copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
      <main className='relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip py-16 sm:py-20'>
        <div className='mx-auto max-w-3xl px-4 sm:px-6 lg:px-8'>
          <h1 className='font-display text-4xl font-bold tracking-tight text-[color:var(--color-text)]'>
            {t.blog.listHeading}
          </h1>
          <p className='mt-4 text-lg text-[color:var(--color-text-muted)]'>
            {t.blog.listSubheading}
          </p>

          {posts.length === 0 ? (
            <p className='mt-12 text-[color:var(--color-text-muted)]'>
              {t.blog.listEmpty}
            </p>
          ) : (
            <ul className='mt-12 space-y-8'>
              {posts.map((post) => (
                <li key={post.slug}>
                  <article className='rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm transition hover:border-[color:var(--color-primary)]/40 dark:bg-[color:var(--color-surface-elevated)]'>
                    <p className='text-xs font-medium tracking-wide text-[color:var(--color-text-muted)] uppercase'>
                      {t.blog.publishedPrefix}{' '}
                      <time dateTime={post.date}>
                        {dateFmt.format(new Date(post.date))}
                      </time>
                    </p>
                    <h2 className='font-display mt-2 text-2xl font-semibold text-[color:var(--color-text)]'>
                      <Link
                        href={localeBlogPostPath(raw, post.slug)}
                        prefetch={false}
                        className='focus-ring rounded-sm hover:text-[color:var(--color-primary)]'
                      >
                        {post.title}
                      </Link>
                    </h2>
                    <p className='mt-2 text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
                      {post.description}
                    </p>
                    <Link
                      href={localeBlogPostPath(raw, post.slug)}
                      prefetch={false}
                      className='focus-ring mt-4 inline-flex text-sm font-semibold text-[color:var(--color-primary)] underline-offset-2 hover:underline'
                    >
                      {t.blog.readMore} →
                    </Link>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <LandingFooterCta copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
    </div>
  );
}
