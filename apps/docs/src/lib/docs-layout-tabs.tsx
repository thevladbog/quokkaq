import { type LayoutTab } from 'fumadocs-ui/layouts/shared';
import { Book, Braces } from 'lucide-react';

import type { AppLocale } from '@/lib/i18n';
import { docsPathSegment } from '@/lib/shared';

function isOpenApiPath(url: string | undefined): boolean {
  return (
    typeof url === 'string' && url.includes(`/${docsPathSegment}/api`)
  );
}

/**
 * `isLayoutTabActive` with `tab.$folder` is fragile. Omit `$folder` and
 * `urls` so Fumadocs uses `isActive(tab.url, pathname, true)` (nested
 * / prefix from that section’s entry). OpenAPI last so `findLast` wins
 * under `…/docs/api/…` vs the wider `…/docs/…` prefix.
 */
function tabToNestedEntryUrlOnly(tab: LayoutTab): LayoutTab {
  const t = { ...tab } as LayoutTab;
  delete t.$folder;
  delete t.urls;
  return t;
}

function sortLayoutTabsForNestedActive(tabs: LayoutTab[]): LayoutTab[] {
  return [...tabs].sort((a, b) => {
    const aw = a.url && isOpenApiPath(a.url) ? 1 : 0;
    const bw = b.url && isOpenApiPath(b.url) ? 1 : 0;
    return aw - bw;
  });
}

function finalizeDocsLayoutTabs(tabs: LayoutTab[]): LayoutTab[] {
  return sortLayoutTabsForNestedActive(
    tabs.map((t) => tabToNestedEntryUrlOnly(t))
  );
}

function makeDocTab(locale: AppLocale, url: string): LayoutTab {
  const isRu = locale === 'ru';
  return {
    title: isRu ? 'Документация' : 'Documentation',
    description: isRu
      ? 'Руководства, интеграции, сценарии'
      : 'Guides, integrations, and how-tos',
    url,
    unlisted: false,
    icon: <Book className='size-4' aria-hidden />
  };
}

function makeOpenApiTab(locale: AppLocale, url: string): LayoutTab {
  const isRu = locale === 'ru';
  return {
    title: 'OpenAPI',
    description: isRu
      ? 'Справочник REST API (схема)'
      : 'REST API reference (schema)',
    url,
    unlisted: false,
    icon: <Braces className='size-4' aria-hidden />
  };
}

/**
 * Layout switcher tabs. **Do not** derive these from the client RSC
 * `getPageTree` payload: root flags and shape can be unreliable after
 * serialization. Entry URLs are computed in `app/[locale]/docs/layout` from
 * `source.getPages` on the server.
 */
export function getDocsSidebarTabs(
  locale: AppLocale,
  docEntryUrl: string,
  openApiEntryUrl: string | undefined
): LayoutTab[] {
  if (openApiEntryUrl) {
    return finalizeDocsLayoutTabs([
      makeDocTab(locale, docEntryUrl),
      makeOpenApiTab(locale, openApiEntryUrl)
    ]);
  }
  return finalizeDocsLayoutTabs([makeDocTab(locale, docEntryUrl)]);
}
