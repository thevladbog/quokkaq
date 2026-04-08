'use client';

import { Invoice } from '@quokkaq/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useTranslations } from 'next-intl';

interface InvoiceListProps {
  invoices: Invoice[];
  onDownload?: (invoiceId: string) => void;
}

export function InvoiceList({ invoices, onDownload }: InvoiceListProps) {
  const t = useTranslations('organization.invoices');
  
  const getStatusBadge = (status: string) => {
    return <Badge variant={
      status === 'draft' ? 'outline' :
      status === 'open' ? 'secondary' :
      status === 'paid' ? 'default' :
      status === 'uncollectible' ? 'destructive' : 'outline'
    }>{t(`statuses.${status}`)}</Badge>;
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency
    }).format(price / 100);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd MMM yyyy', { locale: ru });
  };

  const getPaymentProviderLabel = (provider: string) => {
    return t(`providers.${provider}`);
  };

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Receipt className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500">{t('noInvoices')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          {t('title')}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-medium text-sm text-gray-600">{t('invoice')}</th>
                <th className="text-left py-3 px-4 font-medium text-sm text-gray-600">{t('date')}</th>
                <th className="text-left py-3 px-4 font-medium text-sm text-gray-600">{t('amount')}</th>
                <th className="text-left py-3 px-4 font-medium text-sm text-gray-600">{t('paymentMethod')}</th>
                <th className="text-left py-3 px-4 font-medium text-sm text-gray-600">{t('status')}</th>
                <th className="text-right py-3 px-4 font-medium text-sm text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <span className="font-mono text-sm">
                      #{invoice.id.slice(0, 8)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {invoice.paidAt 
                      ? formatDate(invoice.paidAt) 
                      : formatDate(invoice.dueDate)
                    }
                  </td>
                  <td className="py-3 px-4 font-medium">
                    {formatPrice(invoice.amount, invoice.currency)}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {invoice.paymentProvider && getPaymentProviderLabel(invoice.paymentProvider)}
                  </td>
                  <td className="py-3 px-4">
                    {getStatusBadge(invoice.status)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {invoice.status === 'paid' && onDownload && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownload(invoice.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
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
