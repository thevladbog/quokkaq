'use client';

import { Invoice } from '@quokkaq/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { Download, Receipt } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatPriceMinorUnits } from '@/lib/format-price';
import { formatAppDate, intlLocaleFromAppLocale } from '@/lib/format-datetime';
import { Link } from '@/src/i18n/navigation';

function invoiceAllowsPdfDownload(status: string): boolean {
  return (
    status === 'open' ||
    status === 'paid' ||
    status === 'uncollectible' ||
    status === 'void'
  );
}

interface InvoiceListProps {
  invoices: Invoice[];
  onDownload?: (invoice: Invoice) => void;
  /** Path without locale prefix and without leading slash, e.g. `settings/organization/billing/invoices` */
  detailBasePath?: string;
}

export function InvoiceList({
  invoices,
  onDownload,
  detailBasePath
}: InvoiceListProps) {
  const t = useTranslations('organization.invoices');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);

  const getPaymentProviderLabel = (provider: string) => {
    return t(`providers.${provider}`);
  };

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-12'>
          <Receipt className='mb-4 h-12 w-12 text-gray-400' />
          <p className='text-gray-500'>{t('noInvoices')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Receipt className='h-5 w-5' />
          {t('title')}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead>
              <tr className='border-b'>
                <th className='px-4 py-3 text-left text-sm font-medium text-gray-600'>
                  {t('invoice')}
                </th>
                <th className='px-4 py-3 text-left text-sm font-medium text-gray-600'>
                  {t('date')}
                </th>
                <th className='px-4 py-3 text-left text-sm font-medium text-gray-600'>
                  {t('amount')}
                </th>
                <th className='px-4 py-3 text-left text-sm font-medium text-gray-600'>
                  {t('paymentMethod')}
                </th>
                <th className='px-4 py-3 text-left text-sm font-medium text-gray-600'>
                  {t('status')}
                </th>
                <th className='px-4 py-3 text-right text-sm font-medium text-gray-600'>
                  {t('actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className='border-b last:border-0 hover:bg-gray-50'
                >
                  <td className='px-4 py-3'>
                    {detailBasePath ? (
                      <Link
                        href={`${detailBasePath}/${invoice.id}`}
                        className='text-primary font-mono text-sm underline'
                      >
                        {invoice.documentNumber?.trim()
                          ? invoice.documentNumber
                          : `#${invoice.id.slice(0, 8)}…`}
                      </Link>
                    ) : (
                      <span className='font-mono text-sm'>
                        {invoice.documentNumber?.trim()
                          ? invoice.documentNumber
                          : `#${invoice.id.slice(0, 8)}…`}
                      </span>
                    )}
                  </td>
                  <td className='px-4 py-3 text-sm'>
                    {formatAppDate(
                      invoice.paidAt ?? invoice.dueDate,
                      intlLocale,
                      'medium'
                    )}
                  </td>
                  <td className='px-4 py-3 font-medium'>
                    {formatPriceMinorUnits(
                      invoice.amount,
                      invoice.currency || 'RUB',
                      intlLocale
                    )}
                  </td>
                  <td className='px-4 py-3 text-sm'>
                    {invoice.paymentProvider &&
                      getPaymentProviderLabel(invoice.paymentProvider)}
                  </td>
                  <td className='px-4 py-3'>
                    <InvoiceStatusBadge
                      status={invoice.status}
                      label={t(`statuses.${invoice.status}`)}
                    />
                  </td>
                  <td className='px-4 py-3 text-right'>
                    {invoiceAllowsPdfDownload(invoice.status) && onDownload && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => onDownload(invoice)}
                      >
                        <Download className='mr-1 h-4 w-4' />
                        {t('download')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
