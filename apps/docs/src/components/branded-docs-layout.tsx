'use client';

import { useMemo, type PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';
import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/docs';
import { getDocsSidebarTabs } from '@/lib/docs-layout-tabs';
import { slicePageTreeToActiveLayoutRoot } from '@/lib/docs-page-tree-slice';
import type { AppLocale } from '@/lib/i18n';

type Props = PropsWithChildren<
  Omit<DocsLayoutProps, 'tabs'> & {
    /** From `getPages` (shortest mdx page URL) or `/${locale}/docs` */
    docEntryUrl: string;
    /** From `getPages` (shortest OpenAPI page URL) when the spec is loaded */
    openApiEntryUrl: string | undefined;
    locale: AppLocale;
  }
>;

/**
 * Tabs are built from server-derived entry URLs, not from `getPageTree` on
 * the client (RSC payload can be incomplete for `getLayoutTabs`).
 */
export function BrandedDocsLayout({
  docEntryUrl,
  openApiEntryUrl,
  locale,
  tree,
  children,
  tabMode = 'auto',
  ...rest
}: Props) {
  const pathname = usePathname() ?? '';
  const treeForLayout = useMemo(
    () => slicePageTreeToActiveLayoutRoot(tree, pathname),
    [pathname, tree]
  );
  const tabs = useMemo(
    () => getDocsSidebarTabs(locale, docEntryUrl, openApiEntryUrl),
    [docEntryUrl, locale, openApiEntryUrl]
  );
  return (
    <DocsLayout tree={treeForLayout} tabMode={tabMode} tabs={tabs} {...rest}>
      {children}
    </DocsLayout>
  );
}
