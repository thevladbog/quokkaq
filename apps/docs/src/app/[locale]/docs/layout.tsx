import type { ReactNode } from 'react';
import type { Root } from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { isAppLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import { BrandedDocsLayout } from '@/components/branded-docs-layout';

export default async function Layout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const pageTree = source.getPageTree(raw);
  const { data: tree } = (await source.serializePageTree(
    pageTree
  )) as { data: Root };
  const pages = source.getPages(raw);
  const nonOpenApi = pages.filter((p) => p.type !== 'openapi');
  const docEntryUrl = nonOpenApi.length
    ? [...nonOpenApi].sort(
        (a, b) => a.url.length - b.url.length
      )[0]!.url
    : `/${raw}/docs`;
  const openApi = pages
    .filter((p) => p.type === 'openapi')
    .map((p) => p.url);
  const openApiEntryUrl = openApi.length
    ? [...openApi].sort((a, b) => a.length - b.length)[0]!
    : undefined;
  return (
    <BrandedDocsLayout
      docEntryUrl={docEntryUrl}
      openApiEntryUrl={openApiEntryUrl}
      locale={raw}
      tree={tree}
      tabMode='auto'
      {...baseOptions(raw)}
    >
      {children}
    </BrandedDocsLayout>
  );
}
