import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OrganizationBillingContent } from './OrganizationBillingContent';

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'organization.billing'
  });
  return {
    title: t('title'),
    description: t('description')
  };
}

export default async function OrganizationBillingPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'organization.billing'
  });
  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='mb-2 text-3xl font-bold'>{t('title')}</h1>
        <p className='text-gray-600'>{t('description')}</p>
      </div>

      <OrganizationBillingContent />
    </div>
  );
}
