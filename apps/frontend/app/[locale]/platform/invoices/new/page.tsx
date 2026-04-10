'use client';

import { PlatformInvoiceDraftForm } from '@/components/platform/PlatformInvoiceDraftForm';
import { Button } from '@/components/ui/button';
import { Link } from '@/src/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

export default function PlatformNewInvoicePage() {
  const t = useTranslations('platform.invoiceDraft');
  const sp = useSearchParams();
  const defaultCompanyId = useMemo(
    () => sp.get('companyId')?.trim() ?? '',
    [sp]
  );

  return (
    <div>
      <div className='mb-6'>
        <Button variant='ghost' size='sm' asChild>
          <Link href='/platform/invoices'>{t('backToList')}</Link>
        </Button>
      </div>
      <h1 className='mb-6 text-3xl font-bold'>
        {t.has('newTitle') ? t('newTitle') : 'New invoice (draft)'}
      </h1>
      <PlatformInvoiceDraftForm defaultCompanyId={defaultCompanyId} />
    </div>
  );
}
