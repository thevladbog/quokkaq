import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import type { AppLocale } from '@/src/messages';

type Props = {
  locale: AppLocale;
};

export function MarketingJsonLd({ locale }: Props) {
  const origin = getMetadataBaseUrl().origin;

  const name = locale === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name,
      url: origin,
      logo: `${origin}/quokka-logo.svg`
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name,
      url: origin,
      publisher: { '@id': `${origin}/#organization` }
    }
  ];

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': graph
        })
      }}
    />
  );
}
