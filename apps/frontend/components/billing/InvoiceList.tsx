'use client';

import { Invoice } from '@quokkaq/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Receipt } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatPriceMinorUnits } from '@/lib/format-price';
import {
  formatAppDate,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';

interface InvoiceListProps {
  invoices: Invoice[];
  onDownload?: (invoiceId: string) => void;
}

export function InvoiceList({ invoices, onDownload }: InvoiceListProps) {
  const t = useTranslations('organization.invoices');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);

  const getStatusBadge = (status: string) => {
    return (
      <Badge
        variant={
          status === 'draft'
            ? 'outline'
            : status === 'open'
              ? 'secondary'
              : status === 'paid'
                ? 'default'
                : status === 'uncollectible'
                  ? 'destructive'
                  : 'outline'
        }
      >
        {t(`statuses.${status}`)}
      </Badge>
    );
  };

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
                    <span className='font-mono text-sm'>
                      #{invoice.id.slice(0, 8)}
                    </span>
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
                    {getStatusBadge(invoice.status)}
                  </td>
                  <td className='px-4 py-3 text-right'>
                    {invoice.status === 'paid' && onDownload && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => onDownload(invoice.id)}
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
