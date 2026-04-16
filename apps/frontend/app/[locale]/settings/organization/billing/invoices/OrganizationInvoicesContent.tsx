'use client';

import { useQuery } from '@tanstack/react-query';
import type { Invoice } from '@quokkaq/shared-types';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { getGetInvoicesMeQueryKey } from '@/lib/api/generated/tenant-billing';
import { invoicesApi } from '@/lib/api';
import {
  downloadInvoicePdf,
  invoicePdfDownloadErrorToastMessage
} from '@/lib/invoice-pdf-download';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

export function OrganizationInvoicesContent() {
  const router = useRouter();
  const t = useTranslations('organization.invoices');
  const tDetail = useTranslations('organization.invoiceDetail');
  const tCommon = useTranslations('common');

  const { data: invoices, isLoading } = useQuery({
    queryKey: getGetInvoicesMeQueryKey(),
    queryFn: () => invoicesApi.getMyInvoices()
  });

  const handleDownload = async (invoice: Invoice) => {
    try {
      await downloadInvoicePdf(invoice);
    } catch (error) {
      logger.error('downloadInvoicePdf failed', error);
      toast.error(
        invoicePdfDownloadErrorToastMessage(error, tDetail('downloadPdfError'))
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
        onClick={() => router.push('/settings/organization/billing')}
      >
        <ArrowLeft className='mr-2 h-4 w-4' />
        {t('backToBilling')}
      </Button>

      <InvoiceList
        invoices={invoices || []}
        onDownload={handleDownload}
        detailBasePath='settings/organization/billing/invoices'
      />
    </div>
  );
}
