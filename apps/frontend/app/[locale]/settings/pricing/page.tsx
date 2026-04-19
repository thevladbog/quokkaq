import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TenantPricingPlansContent } from '@/components/billing/TenantPricingPlansContent';

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'organization.pricing'
  });
  return {
    title: t('title'),
    description: t('description')
  };
}

export default async function PricingSettingsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'organization.pricing'
  });
  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-4'>
        <h1 className='mb-1.5 text-3xl font-bold'>{t('title')}</h1>
        <p className='text-muted-foreground text-sm leading-snug'>
          {t('description')}
        </p>
      </div>

      <TenantPricingPlansContent />
    </div>
  );
}
