import type { Metadata } from 'next';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { notFound } from 'next/navigation';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';
import {
  buildLocaleAlternates,
  marketingCanonicalUrl,
  ogLocale
} from '@/lib/marketing-metadata';
import { DocsBreadcrumbJsonLd } from '@/components/seo/docs-breadcrumb-json-ld';
import { isAppLocale } from '@/src/messages';

export const generateStaticParams = generateStaticParamsFor(
  'mdxPath',
  'locale'
);

type PageProps = {
  params: Promise<{ locale: string; mdxPath?: string[] }>;
};

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { locale, mdxPath } = await params;
  if (!isAppLocale(locale)) {
    return {};
  }
  const { metadata } = await importPage(mdxPath, locale);
  const docSegments = ['docs', ...(mdxPath ?? [])];
  const alternates = buildLocaleAlternates(locale, docSegments);
  const canonicalUrl = marketingCanonicalUrl(locale, docSegments);
  const brand = locale === 'ru' ? 'КвоккаКю' : 'QuokkaQ';

  const metaTitle = metadata.title;
  const resolvedTitle =
    typeof metaTitle === 'string'
      ? metaTitle
      : metaTitle &&
          typeof metaTitle === 'object' &&
          metaTitle !== null &&
          'default' in metaTitle
        ? String((metaTitle as { default: string }).default)
        : brand;

  const resolvedDescription =
    typeof metadata.description === 'string' ? metadata.description : '';

  const openGraph = {
    ...metadata.openGraph,
    type: 'website',
    title: resolvedTitle,
    description: resolvedDescription,
    siteName: brand,
    locale: ogLocale(locale),
    alternateLocale: [locale === 'en' ? 'ru_RU' : 'en_US'],
    url: canonicalUrl,
    images: [{ url: `/${locale}/opengraph-image`, width: 1200, height: 630 }]
  } as Metadata['openGraph'];

  return {
    ...metadata,
    alternates,
    openGraph,
    twitter: {
      ...metadata.twitter,
      card: 'summary_large_image',
      title: resolvedTitle,
      description: resolvedDescription,
      images: [`/${locale}/opengraph-image`]
    }
  };
}

export default async function MdxPage({ params }: PageProps) {
  const resolved = await params;
  if (!isAppLocale(resolved.locale)) {
    notFound();
  }

  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode
  } = await importPage(resolved.mdxPath, resolved.locale);

  const Wrapper = getMDXComponents({}).wrapper;

  const metaTitle = metadata.title;
  const resolvedTitle =
    typeof metaTitle === 'string'
      ? metaTitle
      : metaTitle &&
          typeof metaTitle === 'object' &&
          metaTitle !== null &&
          'default' in metaTitle
        ? String((metaTitle as { default: string }).default)
        : resolved.locale === 'ru'
          ? 'КвоккаКю'
          : 'QuokkaQ';

  return (
    <>
      <DocsBreadcrumbJsonLd
        locale={resolved.locale}
        mdxPath={resolved.mdxPath}
        pageTitle={resolvedTitle}
      />
      <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
        <MDXContent params={resolved} />
      </Wrapper>
    </>
  );
}
