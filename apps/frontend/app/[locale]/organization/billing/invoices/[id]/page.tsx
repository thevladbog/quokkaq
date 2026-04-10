import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { OrganizationInvoiceDetailContent } from './OrganizationInvoiceDetailContent';

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'organization.invoiceDetail'
  });
  return {
    title: t('metaTitle', { defaultValue: 'Invoice' }),
    description: t('metaDescription', { defaultValue: 'Invoice details' })
  };
}

export default async function OrganizationInvoiceDetailPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className='container mx-auto px-4 py-8'>
      <Suspense fallback={<div>{tCommon('loading')}</div>}>
        <OrganizationInvoiceDetailContent />
      </Suspense>
    </div>
  );
}
