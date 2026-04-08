'use client';

import { useQuery } from '@tanstack/react-query';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { invoicesApi } from '@/lib/api';

export function OrganizationInvoicesContent() {
  const router = useRouter();
  const t = useTranslations('organization.invoices');
  const tCommon = useTranslations('common');

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices-me'],
    queryFn: () => invoicesApi.getMyInvoices()
  });

  const handleDownload = async (invoiceId: string) => {
    try {
      const blob = await invoicesApi.downloadInvoice(invoiceId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download invoice:', error);
    }
  };

  if (isLoading) {
    return <div>{tCommon('loading')}</div>;
  }

  return (
    <div className='space-y-6'>
      <Button
        variant='ghost'
        onClick={() => router.push('/organization/billing')}
      >
        <ArrowLeft className='mr-2 h-4 w-4' />
        {t('backToBilling')}
      </Button>

      <InvoiceList invoices={invoices || []} onDownload={handleDownload} />
    </div>
  );
}
