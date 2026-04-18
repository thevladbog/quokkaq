import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { notFound } from 'next/navigation';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';
import { isAppLocale } from '@/src/messages';

export const generateStaticParams = generateStaticParamsFor(
  'mdxPath',
  'locale'
);

type PageProps = {
  params: Promise<{ locale: string; mdxPath?: string[] }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { locale, mdxPath } = await params;
  if (!isAppLocale(locale)) {
    return {};
  }
  const { metadata } = await importPage(mdxPath, locale);
  return metadata;
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

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent params={resolved} />
    </Wrapper>
  );
}
