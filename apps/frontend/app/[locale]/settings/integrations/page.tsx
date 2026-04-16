import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Loader2 } from 'lucide-react';
import { IntegrationsSettingsContent } from '@/components/settings/integrations-settings-content';

export default async function IntegrationsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.integrations' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='mb-2 text-3xl font-bold'>{t('title')}</h1>
        <p className='text-muted-foreground'>{t('description')}</p>
      </div>

      <Suspense
        fallback={
          <div className='text-muted-foreground flex items-center gap-2 py-12 text-sm'>
            <Loader2 className='h-5 w-5 animate-spin' />
            {tCommon('loading')}
          </div>
        }
      >
        <IntegrationsSettingsContent />
      </Suspense>
    </div>
  );
}
