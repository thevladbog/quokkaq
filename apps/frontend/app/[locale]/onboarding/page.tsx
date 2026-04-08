import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { OnboardingWizard } from './OnboardingWizard';

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'onboarding' });
  return {
    title: t('title'),
    description: t('description')
  };
}

export default function OnboardingPage() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100'>
      <Suspense
        fallback={
          <div className='flex h-screen items-center justify-center'>
            Загрузка...
          </div>
        }
      >
        <OnboardingWizard />
      </Suspense>
    </div>
  );
}
