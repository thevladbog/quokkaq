import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { OrganizationLoginSecurityContent } from '@/components/organization/OrganizationLoginSecurityContent';

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'organization.loginSecurity'
  });
  return {
    title: t('pageTitle'),
    description: t('pageDescription')
  };
}

export default async function OrganizationLoginSettingsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'organization.loginSecurity'
  });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='mb-2 text-3xl font-bold'>{t('pageTitle')}</h1>
        <p className='text-muted-foreground'>{t('pageDescription')}</p>
      </div>

      <Suspense fallback={<div>{tCommon('loading')}</div>}>
        <OrganizationLoginSecurityContent />
      </Suspense>
    </div>
  );
}
