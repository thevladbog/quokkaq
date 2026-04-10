'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invoice } from '@quokkaq/shared-types';
import { InvoiceDocumentLinesAndTotals } from '@/components/billing/InvoiceDocumentLinesAndTotals';
import { PlatformInvoiceDraftForm } from '@/components/platform/PlatformInvoiceDraftForm';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { platformApi } from '@/lib/api';
import {
  downloadInvoicePdf,
  invoicePdfDownloadErrorToastMessage
} from '@/lib/invoice-pdf-download';
import { logger } from '@/lib/logger';
import {
  formatAppDateTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import { Link } from '@/src/i18n/navigation';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const INV_STATUSES = [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible'
] as const;

function PlatformInvoiceReadOnly({
  inv,
  intlLocale,
  t,
  tOrgInv,
  tDraft
}: {
  inv: Invoice;
  intlLocale: string;
  t: ReturnType<typeof useTranslations<'platform.invoiceDetail'>>;
  tOrgInv: ReturnType<typeof useTranslations<'organization.invoices'>>;
  tDraft: ReturnType<typeof useTranslations<'platform.invoiceDraft'>>;
}) {
  const qc = useQueryClient();
  const tInv = useTranslations('platform.invoices');
  const [pdfBusy, setPdfBusy] = useState(false);

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['platform-company', 'invoice-readonly', inv.companyId],
    queryFn: () => platformApi.getCompany(inv.companyId!),
    enabled: !!inv.companyId?.trim()
  });

  const patch = useMutation({
    mutationFn: ({ status }: { status: (typeof INV_STATUSES)[number] }) =>
      platformApi.patchInvoice(inv.id, { status }),
    onSuccess: () => {
      toast.success(
        tInv('toastStatusUpdated', {
          defaultValue: 'Invoice status updated.'
        })
      );
      void qc.invalidateQueries({ queryKey: ['platform-invoice', inv.id] });
      void qc.invalidateQueries({ queryKey: ['platform-invoices'] });
    },
    onError: (err) => {
      const raw = err instanceof Error ? err.message : String(err);
      toast.error(
        tInv('toastStatusError', {
          message: raw,
          defaultValue: raw
        }),
        { duration: 6000 }
      );
    }
  });

  const onDownloadPdf = async () => {
    try {
      setPdfBusy(true);
      await downloadInvoicePdf(inv);
    } catch (error) {
      logger.error('downloadInvoicePdf failed', error);
      toast.error(
        invoicePdfDownloadErrorToastMessage(error, t('downloadPdfError')),
        { duration: 8000 }
      );
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <p className='text-muted-foreground text-sm'>
            {t('documentNumber', { defaultValue: 'Document №' })}
          </p>
          <p className='font-mono text-lg font-semibold'>
            {inv.documentNumber?.trim() || '—'}
          </p>
        </div>
        <div className='flex flex-col items-end gap-2'>
          <div>
            <p className='text-muted-foreground mb-1 text-sm'>
              {t('status', { defaultValue: 'Status' })}
            </p>
            <Select
              value={inv.status}
              onValueChange={(v) =>
                patch.mutate({ status: v as (typeof INV_STATUSES)[number] })
              }
            >
              <SelectTrigger className='min-w-[12rem]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INV_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tOrgInv(`statuses.${s}`, { defaultValue: s })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={pdfBusy}
            onClick={() => void onDownloadPdf()}
          >
            {pdfBusy ? (
              <Spinner className='mr-2 h-4 w-4' />
            ) : (
              <Download className='mr-2 h-4 w-4' />
            )}
            {t('downloadPdf', { defaultValue: 'Download invoice PDF' })}
          </Button>
        </div>
      </div>

      <div className='grid gap-2 text-sm sm:grid-cols-2'>
        <div>
          <span className='text-muted-foreground'>
            {t('due', { defaultValue: 'Due' })}:{' '}
          </span>
          {formatAppDateTime(inv.dueDate, intlLocale)}
        </div>
        <div>
          <span className='text-muted-foreground'>
            {t('allowYookassa', { defaultValue: 'YooKassa link allowed' })}
            :{' '}
          </span>
          {inv.allowYookassaPaymentLink
            ? t('yesNo.yes', { defaultValue: 'Yes' })
            : t('yesNo.no', { defaultValue: 'No' })}
        </div>
        <div>
          <span className='text-muted-foreground'>
            {t('provisionOnPayment', { defaultValue: 'Provision on payment' })}
            :{' '}
          </span>
          {inv.provisionSubscriptionsOnPayment
            ? t('yesNo.yes', { defaultValue: 'Yes' })
            : t('yesNo.no', { defaultValue: 'No' })}
        </div>
        {inv.yookassaConfirmationUrl ? (
          <div className='sm:col-span-2'>
            <span className='text-muted-foreground'>
              {t('yookassaUrl', {
                defaultValue: 'YooKassa URL (requested by tenant)'
              })}
              :{' '}
            </span>
            <a
              href={inv.yookassaConfirmationUrl}
              className='text-primary break-all underline'
              target='_blank'
              rel='noreferrer'
            >
              {inv.yookassaConfirmationUrl}
            </a>
          </div>
        ) : null}
      </div>

      {inv.companyId?.trim() ? (
        <div className='bg-muted/30 rounded-lg border p-4'>
          <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
            {t('billTo', { defaultValue: 'Bill to' })}
          </p>
          {companyLoading ? (
            <div className='mt-2 flex justify-start'>
              <Spinner className='h-5 w-5' />
            </div>
          ) : company ? (
            <div className='mt-2 space-y-1 text-sm'>
              <p className='text-base font-medium'>{company.name}</p>
              {company.counterparty?.shortName?.trim() ||
              company.counterparty?.fullName?.trim() ? (
                <p className='text-muted-foreground'>
                  {company.counterparty?.shortName?.trim() ||
                    company.counterparty?.fullName?.trim()}
                </p>
              ) : null}
              {company.counterparty?.inn?.trim() ? (
                <p>
                  <span className='text-muted-foreground'>
                    {t('inn', { defaultValue: 'INN' })}:{' '}
                  </span>
                  <span className='font-mono'>
                    {company.counterparty.inn.trim()}
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <p className='text-muted-foreground mt-2 font-mono text-sm'>
              {inv.companyId}
            </p>
          )}
        </div>
      ) : null}

      <InvoiceDocumentLinesAndTotals
        inv={inv}
        intlLocale={intlLocale}
        t={t}
        tDraft={tDraft}
      />
    </div>
  );
}

export default function PlatformInvoiceDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const t = useTranslations('platform.invoiceDetail');
  const tOrgInv = useTranslations('organization.invoices');
  const tDraft = useTranslations('platform.invoiceDraft');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);

  const {
    data: inv,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['platform-invoice', id],
    queryFn: () => platformApi.getPlatformInvoice(id),
    enabled: !!id
  });

  if (!id) return null;

  if (isLoading) {
    return (
      <div className='flex justify-center py-16'>
        <Spinner className='h-10 w-10' />
      </div>
    );
  }

  if (isError || !inv) {
    return (
      <p className='text-destructive'>
        {t('notFound', { defaultValue: 'Invoice not found.' })}
      </p>
    );
  }

  return (
    <div>
      <div className='mb-6 flex flex-wrap items-center gap-2'>
        <Button variant='ghost' size='sm' asChild>
          <Link href='/platform/invoices'>{tDraft('backToList')}</Link>
        </Button>
        {inv.companyId ? (
          <Button variant='ghost' size='sm' asChild>
            <Link href={`/platform/companies/${inv.companyId}`}>
              {t('openCompany', { defaultValue: 'Company' })}
            </Link>
          </Button>
        ) : null}
      </div>
      <h1 className='mb-6 text-3xl font-bold'>
        {t('title', { defaultValue: 'Invoice' })}
      </h1>
      {inv.status === 'draft' ? (
        <PlatformInvoiceDraftForm
          key={`${inv.id}-${inv.updatedAt ?? inv.createdAt ?? '0'}`}
          initialInvoice={inv}
        />
      ) : (
        <PlatformInvoiceReadOnly
          inv={inv}
          intlLocale={intlLocale}
          t={t}
          tOrgInv={tOrgInv}
          tDraft={tDraft}
        />
      )}
    </div>
  );
}
