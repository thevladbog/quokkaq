import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { OrganizationUsageContent } from './OrganizationUsageContent';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organization.usage' });
  return {
    title: t('title'),
    description: t('description')
  };
}

export default async function OrganizationUsagePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organization.usage' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-gray-600">{t('description')}</p>
      </div>

      <Suspense fallback={<div>{tCommon('loading')}</div>}>
        <OrganizationUsageContent />
      </Suspense>
    </div>
  );
}
