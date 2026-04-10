'use client';

import { useQuery } from '@tanstack/react-query';
import type { Invoice } from '@quokkaq/shared-types';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { invoicesApi } from '@/lib/api';
import { downloadInvoicePdf } from '@/lib/invoice-pdf-download';
import { toast } from 'sonner';

export function OrganizationInvoicesContent() {
  const router = useRouter();
  const t = useTranslations('organization.invoices');
  const tDetail = useTranslations('organization.invoiceDetail');
  const tCommon = useTranslations('common');

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices-me'],
    queryFn: () => invoicesApi.getMyInvoices()
  });

  const handleDownload = async (invoice: Invoice) => {
    try {
      await downloadInvoicePdf(invoice);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      toast.error(
        tDetail('downloadPdfError', {
          message: raw,
          defaultValue: 'Could not download invoice PDF. {message}'
        })
      );
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

      <InvoiceList
        invoices={invoices || []}
        onDownload={handleDownload}
        detailBasePath='/organization/billing/invoices'
      />
    </div>
  );
}
