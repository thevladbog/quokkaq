import { safeJsonLdStringify } from '@/lib/safe-json-ld';
import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import type { AppLocale } from '@/src/messages';
import { messages } from '@/src/messages';

type Props = {
  locale: AppLocale;
};

/**
 * Breadcrumb + WebPage for the standalone pricing URL (SEO).
 */
export function PricingPageJsonLd({ locale }: Props) {
  const origin = getMetadataBaseUrl().origin;
  const home = messages[locale].home;
  const brand = locale === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const pagePath = `/${locale}/pricing`;
  const pageUrl = `${origin}${pagePath}`;

  const graph = [
    {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: brand,
          item: `${origin}/${locale}`
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: home.pricing.heading,
          item: pageUrl
        }
      ]
    },
    {
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      name: home.pricing.heading,
      description: home.pricing.subheading,
      isPartOf: { '@id': `${origin}/#website` },
      url: pageUrl
    }
  ];

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{
        __html: safeJsonLdStringify({
          '@context': 'https://schema.org',
          '@graph': graph
        })
      }}
    />
  );
}
