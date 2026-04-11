'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invoice, SaasVendor } from '@quokkaq/shared-types';
import { InvoiceDocumentLinesAndTotals } from '@/components/billing/InvoiceDocumentLinesAndTotals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { invoicesApi } from '@/lib/api';
import {
  downloadInvoicePdf,
  invoicePdfDownloadErrorToastMessage
} from '@/lib/invoice-pdf-download';
import { logger } from '@/lib/logger';
import { pickDefaultPaymentAccount } from '@/lib/default-payment-account';
import { formatAppDate, intlLocaleFromAppLocale } from '@/lib/format-datetime';
import { cn } from '@/lib/utils';
import {
  MissingInvoiceDocumentNumberError,
  ruBankPaymentPurposeFromInvoice
} from '@/lib/invoice-payment-purpose-ru';
import { buildRuBankQrSt00012Payload } from '@/lib/ru-bank-qr-st00012';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useRouter } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner';

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false });

function legalAddressLine(
  cp: SaasVendor['counterparty'] | null | undefined
): string | null {
  const legal = cp?.addresses?.legal;
  if (!legal) return null;
  const line = [legal.postalCode?.trim(), legal.unrestricted?.trim()]
    .filter(Boolean)
    .join(', ');
  return line || null;
}

function invoiceStatusChipClass(status: Invoice['status']): string {
  switch (status) {
    case 'paid':
      return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-900 dark:text-emerald-200';
    case 'open':
      return 'border-amber-500/40 bg-amber-500/12 text-amber-950 dark:text-amber-100';
    case 'void':
      return 'border-muted-foreground/30 bg-muted text-muted-foreground';
    case 'uncollectible':
      return 'border-destructive/40 bg-destructive/10 text-destructive';
    case 'draft':
    default:
      return 'border-transparent bg-secondary text-secondary-foreground';
  }
}

async function fetchSaaSVendor(): Promise<SaasVendor | null> {
  return invoicesApi.getSaaSVendor();
}

export function OrganizationInvoiceDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const t = useTranslations('organization.invoices');
  const tDetail = useTranslations('organization.invoiceDetail');
  const tDraft = useTranslations('platform.invoiceDraft');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const qc = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const {
    data: inv,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['invoice-me', id],
    queryFn: () => invoicesApi.getMyInvoiceById(id),
    enabled: !!id
  });

  const {
    data: vendor,
    isLoading: vendorLoading,
    isError: vendorQueryError
  } = useQuery({
    queryKey: ['invoice-saas-vendor'],
    queryFn: fetchSaaSVendor,
    staleTime: 5 * 60 * 1000
  });

  const onDownloadPdf = async () => {
    if (!inv) return;
    try {
      setPdfBusy(true);
      await downloadInvoicePdf(inv);
    } catch (error) {
      logger.error('downloadInvoicePdf failed', error);
      toast.error(
        invoicePdfDownloadErrorToastMessage(error, tDetail('downloadPdfError'))
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const payMut = useMutation({
    mutationFn: () => invoicesApi.requestYooKassaPaymentLink(id),
    onSuccess: (data) => {
      setLinkError(null);
      void qc.invalidateQueries({ queryKey: ['invoice-me', id] });
      if (typeof window !== 'undefined' && data.confirmationUrl) {
        window.open(data.confirmationUrl, '_blank', 'noopener,noreferrer');
      }
    },
    onError: (e: Error) => {
      logger.error('requestYooKassaPaymentLink failed', e);
      setLinkError(tDetail('payLinkErrorGeneric'));
    }
  });

  const defaultAccount = useMemo(
    () => pickDefaultPaymentAccount(vendor?.paymentAccounts),
    [vendor?.paymentAccounts]
  );

  /** Полное/краткое наименование для поля Name в ST00012 (не отображаем в шапке поставщика). */
  const payeeLegalName = useMemo(() => {
    if (!vendor) return '';
    const cp = vendor.counterparty;
    return (cp?.fullName?.trim() ||
      cp?.shortName?.trim() ||
      vendor.name?.trim() ||
      '') as string;
  }, [vendor]);

  /** Краткое юр. наименование в карточке поставщика. */
  const supplierShortLegal = useMemo(() => {
    if (!vendor) return '';
    const cp = vendor.counterparty;
    return (cp?.shortName?.trim() || cp?.fullName?.trim() || '') as string;
  }, [vendor]);

  const paymentPurposeRu = useMemo(() => {
    if (!inv) return '';
    try {
      return ruBankPaymentPurposeFromInvoice(inv);
    } catch (e) {
      if (e instanceof MissingInvoiceDocumentNumberError) return '';
      throw e;
    }
  }, [inv]);

  const qrPayload = useMemo(() => {
    if (!inv || !vendor || !defaultAccount) return null;
    if (!paymentPurposeRu.trim()) return null;
    const cur = inv.currency?.trim().toUpperCase() || 'RUB';
    if (cur !== 'RUB') return null;
    const inn = vendor.counterparty?.inn?.replace(/\D/g, '') ?? '';
    const kpp = vendor.counterparty?.kpp?.replace(/\D/g, '') ?? '';
    const purpose = paymentPurposeRu;
    return buildRuBankQrSt00012Payload({
      name: (payeeLegalName || vendor.name || '').trim(),
      personalAcc: (defaultAccount.accountNumber ?? '').replace(/\D/g, ''),
      bankName: defaultAccount.bankName ?? '',
      bic: (defaultAccount.bic ?? '').replace(/\D/g, ''),
      correspondentAccount: (defaultAccount.correspondentAccount ?? '').replace(
        /\D/g,
        ''
      ),
      sumKopecks: inv.amount,
      purpose,
      payeeInn: inn,
      kpp: kpp || undefined
    });
  }, [inv, vendor, defaultAccount, payeeLegalName, paymentPurposeRu]);

  if (!id) return null;

  if (isLoading) {
    return <div>{tCommon('loading')}</div>;
  }

  if (isError || !inv) {
    return (
      <p className='text-destructive'>
        {tDetail('notFound', { defaultValue: 'Invoice not found.' })}
      </p>
    );
  }

  const canRequestYoo =
    inv.allowYookassaPaymentLink === true && inv.status === 'open';
  const showPayButton = canRequestYoo && !inv.yookassaConfirmationUrl;
  const showExistingLink =
    canRequestYoo && !!inv.yookassaConfirmationUrl?.trim();

  const showPaymentStubNoVendor = vendor === null && !vendorLoading;
  const showPaymentStubNoDefault =
    vendor != null && !defaultAccount && !vendorLoading;

  const documentNumberDisplay =
    inv.documentNumber?.trim() || `…${inv.id.slice(0, 8)}`;
  const issueDateSource = inv.issuedAt ?? inv.createdAt ?? null;
  const issueDateFormatted = issueDateSource
    ? formatAppDate(issueDateSource, intlLocale)
    : formatAppDate(inv.dueDate, intlLocale);
  const legalAddr = vendor ? legalAddressLine(vendor.counterparty) : null;
  const cpPhone = vendor?.counterparty?.phone?.trim();
  const cpEmail = vendor?.counterparty?.email?.trim();

  return (
    <div className='space-y-6'>
      <Button
        variant='ghost'
        onClick={() => router.push('/settings/organization/billing/invoices')}
      >
        <ArrowLeft className='mr-2 h-4 w-4' />
        {t('backToBilling')}
      </Button>

      <div className='space-y-5'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>
            {tDetail('metaTitle', { defaultValue: 'Invoice' })}
          </h1>
          <p className='text-muted-foreground mt-1 text-sm sm:text-base'>
            {tDetail('invoiceNumberDateLine', {
              documentNumber: documentNumberDisplay,
              issueDate: issueDateFormatted
            })}
          </p>
          <div className='mt-3 flex flex-wrap items-center gap-x-3 gap-y-2'>
            <Badge
              variant='outline'
              className={cn(
                'rounded-md border px-2.5 py-1 font-medium',
                invoiceStatusChipClass(inv.status)
              )}
            >
              {t(`statuses.${inv.status}`, { defaultValue: inv.status })}
            </Badge>
            <span className='text-muted-foreground text-sm'>
              <span className='text-foreground font-medium'>
                {tDetail('dueLabel', { defaultValue: 'Due' })}
              </span>
              {': '}
              {formatAppDate(inv.dueDate, intlLocale)}
            </span>
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
              {tDetail('downloadPdf', {
                defaultValue: 'Download invoice PDF'
              })}
            </Button>
          </div>
        </div>

        {vendorLoading ? (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <Spinner className='h-4 w-4' />
            {tCommon('loading')}
          </div>
        ) : null}

        {vendorQueryError ? (
          <p className='text-destructive text-sm'>
            {tDetail('vendorLoadError', {
              defaultValue: 'Could not load payment details.'
            })}
          </p>
        ) : null}

        {vendor && !vendorLoading ? (
          <div className='flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-4'>
            <div className='bg-muted/30 min-w-0 flex-1 space-y-3 rounded-lg border p-4'>
              <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                {tDetail('supplierSection', { defaultValue: 'Supplier' })}
              </p>
              {supplierShortLegal ? (
                <p className='text-foreground font-medium'>
                  {supplierShortLegal}
                </p>
              ) : (
                <p className='text-muted-foreground text-sm'>—</p>
              )}
              {vendor.counterparty?.inn?.trim() ? (
                <p className='text-sm'>
                  <span className='text-muted-foreground'>
                    {tDetail('inn', { defaultValue: 'INN' })}:{' '}
                  </span>
                  <span className='font-mono'>
                    {vendor.counterparty.inn.trim()}
                  </span>
                </p>
              ) : null}
              {vendor.counterparty?.kpp?.trim() ? (
                <p className='text-sm'>
                  <span className='text-muted-foreground'>
                    {tDetail('kpp', { defaultValue: 'KPP' })}:{' '}
                  </span>
                  <span className='font-mono'>
                    {vendor.counterparty.kpp.trim()}
                  </span>
                </p>
              ) : null}
              {legalAddr ? (
                <p className='text-sm'>
                  <span className='text-muted-foreground'>
                    {tDetail('addressLegal', {
                      defaultValue: 'Legal address'
                    })}
                    :{' '}
                  </span>
                  <span className='text-foreground'>{legalAddr}</span>
                </p>
              ) : null}
              {cpPhone ? (
                <p className='text-sm'>
                  <span className='text-muted-foreground'>
                    {tDetail('phoneShort', { defaultValue: 'Phone' })}:{' '}
                  </span>
                  <span className='text-foreground font-mono'>{cpPhone}</span>
                </p>
              ) : null}
              {cpEmail ? (
                <p className='text-sm'>
                  <span className='text-muted-foreground'>
                    {tDetail('emailShort', { defaultValue: 'Email' })}:{' '}
                  </span>
                  <a
                    href={`mailto:${cpEmail}`}
                    className='text-primary font-mono text-xs break-all underline-offset-2 hover:underline'
                  >
                    {cpEmail}
                  </a>
                </p>
              ) : null}
            </div>

            {defaultAccount ? (
              <div className='bg-muted/30 min-w-0 flex-1 space-y-3 rounded-lg border p-4 text-sm'>
                <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {tDetail('bankSection', { defaultValue: 'Bank details' })}
                </p>
                <p className='text-foreground font-medium'>
                  {defaultAccount.bankName?.trim() || '—'}
                </p>
                <dl className='text-muted-foreground space-y-3'>
                  <div>
                    <dt className='text-xs'>
                      {tDetail('bic', { defaultValue: 'BIC' })}
                    </dt>
                    <dd className='text-foreground font-mono text-sm break-all'>
                      {defaultAccount.bic?.trim() || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs'>
                      {tDetail('correspondentAccount', {
                        defaultValue: 'Correspondent account'
                      })}
                    </dt>
                    <dd className='text-foreground font-mono text-sm break-all'>
                      {defaultAccount.correspondentAccount?.trim() || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs'>
                      {tDetail('settlementAccount', {
                        defaultValue: 'Settlement account'
                      })}
                    </dt>
                    <dd className='text-foreground font-mono text-sm break-all'>
                      {defaultAccount.accountNumber?.trim() || '—'}
                    </dd>
                  </div>
                </dl>
                <p className='text-foreground border-border/60 border-t pt-3 text-sm'>
                  <span className='text-muted-foreground'>
                    {tDetail('paymentPurposeLabel', {
                      defaultValue: 'Payment purpose'
                    })}
                    :{' '}
                  </span>
                  {paymentPurposeRu}
                </p>
              </div>
            ) : null}

            {qrPayload ? (
              <div className='bg-muted/20 flex w-full shrink-0 flex-col items-center justify-center gap-2 rounded-lg border p-4 lg:w-auto lg:max-w-[14rem] lg:justify-start'>
                <div className='bg-white p-2'>
                  <QRCode value={qrPayload} size={160} />
                </div>
                <p className='text-muted-foreground max-w-[12rem] text-center text-xs'>
                  {tDetail('qrCaption', {
                    defaultValue: 'Scan to pay via bank app (Russia)'
                  })}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {(showPaymentStubNoVendor || showPaymentStubNoDefault) &&
        !vendorLoading ? (
          <div className='bg-muted/50 text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
            {showPaymentStubNoVendor
              ? tDetail('vendorNotConfigured', {
                  defaultValue:
                    'Contact your administrator to configure payment details.'
                })
              : tDetail('contactAdminPaymentSetup', {
                  defaultValue:
                    'Contact your administrator to set a default bank account for invoices.'
                })}
          </div>
        ) : null}

        {(showPayButton || showExistingLink) && (
          <div className='bg-muted/50 space-y-2 rounded-lg border p-4'>
            <p className='text-sm font-medium'>
              {tDetail('yookassaSection', {
                defaultValue: 'Online payment (YooKassa)'
              })}
            </p>
            {showPayButton && (
              <Button
                type='button'
                disabled={payMut.isPending}
                onClick={() => payMut.mutate()}
              >
                {payMut.isPending && <Spinner className='mr-2 h-4 w-4' />}
                {tDetail('getPaymentLink', {
                  defaultValue: 'Get payment link'
                })}
              </Button>
            )}
            {showExistingLink && inv.yookassaConfirmationUrl && (
              <div className='text-sm'>
                <p className='text-muted-foreground mb-1'>
                  {tDetail('paymentLinkReady', {
                    defaultValue: 'Payment page'
                  })}
                </p>
                <a
                  href={inv.yookassaConfirmationUrl}
                  className='text-primary break-all underline'
                  target='_blank'
                  rel='noreferrer'
                >
                  {inv.yookassaConfirmationUrl}
                </a>
              </div>
            )}
            {linkError && (
              <p className='text-destructive text-sm'>{linkError}</p>
            )}
          </div>
        )}
      </div>

      <InvoiceDocumentLinesAndTotals
        inv={inv}
        intlLocale={intlLocale}
        t={tDetail}
        tDraft={tDraft}
      />
    </div>
  );
}
