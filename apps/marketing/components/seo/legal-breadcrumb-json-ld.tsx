import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import type { AppLocale } from '@/src/messages';

const homeLabel: Record<AppLocale, string> = {
  en: 'Home',
  ru: 'Главная'
};

type Props = {
  locale: AppLocale;
  pageTitle: string;
  pathSegment: 'privacy' | 'terms';
};

export function LegalBreadcrumbJsonLd({ locale, pageTitle, pathSegment }: Props) {
  const origin = getMetadataBaseUrl().origin;
  const pageUrl = `${origin}/${locale}/${pathSegment}`;

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: homeLabel[locale],
        item: `${origin}/${locale}`
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: pageTitle,
        item: pageUrl
      }
    ]
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
