import { marketingAppBaseUrl } from '@/lib/fetch-marketing-subscription-plans';
import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import type { AppLocale } from '@/src/messages';
import { messages } from '@/src/messages';

type Props = {
  locale: AppLocale;
};

export function HomePageJsonLd({ locale }: Props) {
  const origin = getMetadataBaseUrl().origin;
  const home = messages[locale].home;
  const brand = locale === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const pageUrl = `${origin}/${locale}`;
  const productUrl = marketingAppBaseUrl();

  const faqEntities = home.faq.items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer
    }
  }));

  const software: Record<string, unknown> = {
    '@type': 'SoftwareApplication',
    '@id': `${pageUrl}#software`,
    name: brand,
    description: home.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    url: productUrl ?? pageUrl,
    publisher: { '@id': `${origin}/#organization` }
  };

  const graph = [
    {
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      url: pageUrl,
      mainEntity: faqEntities
    },
    software
  ];

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
      }}
    />
  );
}
