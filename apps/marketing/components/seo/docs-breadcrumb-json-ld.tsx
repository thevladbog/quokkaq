import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import type { AppLocale } from '@/src/messages';

const docsIndexLabel: Record<AppLocale, string> = {
  en: 'Documentation',
  ru: 'Документация'
};

const homeLabel: Record<AppLocale, string> = {
  en: 'Home',
  ru: 'Главная'
};

type Props = {
  locale: AppLocale;
  /** Leaf page title (from MDX metadata). */
  pageTitle: string;
  /** Segments under /docs (e.g. ['guide'] for /en/docs/guide). Empty for docs index. */
  mdxPath?: string[];
};

export function DocsBreadcrumbJsonLd({ locale, pageTitle, mdxPath }: Props) {
  const origin = getMetadataBaseUrl().origin;

  const items: Array<{ name: string; url: string }> = [
    { name: homeLabel[locale], url: `${origin}/${locale}` },
    { name: docsIndexLabel[locale], url: `${origin}/${locale}/docs` }
  ];

  if (mdxPath && mdxPath.length > 0) {
    items.push({
      name: pageTitle,
      url: `${origin}/${locale}/docs/${mdxPath.join('/')}`
    });
  }

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${origin}/${locale}/docs${mdxPath?.length ? `/${mdxPath.join('/')}` : ''}#breadcrumb`,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url
    }))
  };

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', ...breadcrumb })
      }}
    />
  );
}
