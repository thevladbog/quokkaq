'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getGetPlatformInvoicesQueryKey,
  getPlatformInvoices,
  patchPlatformInvoicesId
} from '@/lib/api/generated/platform';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Link } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { formatPriceMinorUnits } from '@/lib/format-price';
import {
  formatAppDateTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';

const INV_STATUSES = [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible'
] as const;

function invoiceStatusLabel(
  tOrgInv: ReturnType<typeof useTranslations<'organization.invoices'>>,
  status: string
) {
  return tOrgInv(`statuses.${status}`, { defaultValue: status });
}

export default function PlatformInvoicesPage() {
  const t = useTranslations('platform.invoices');
  const tOrgInv = useTranslations('organization.invoices');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');

  const invoiceListParams = {
    companyId: companyFilter.trim() || undefined,
    limit: 100
  };

  const { data, isLoading } = useQuery({
    queryKey: getGetPlatformInvoicesQueryKey(invoiceListParams),
    queryFn: async () => (await getPlatformInvoices(invoiceListParams)).data
  });

  const patch = useMutation({
    mutationFn: ({
      id,
      status
    }: {
      id: string;
      status: (typeof INV_STATUSES)[number];
    }) => patchPlatformInvoicesId(id, { status }),
    onSuccess: () => {
      toast.success(
        t('toastStatusUpdated', { defaultValue: 'Invoice status updated.' })
      );
      void qc.invalidateQueries({
        queryKey: getGetPlatformInvoicesQueryKey()
      });
    },
    onError: (err) => {
      const raw = err instanceof Error ? err.message : String(err);
      toast.error(
        t('toastStatusError', {
          message: raw,
          defaultValue: raw
        }),
        { duration: 6000 }
      );
    }
  });

  return (
    <div>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
        <h1 className='text-3xl font-bold'>
          {t('title', { defaultValue: 'Invoices' })}
        </h1>
        <Button asChild>
          <Link href='/platform/invoices/new'>
            {t('newInvoice', { defaultValue: 'New invoice' })}
          </Link>
        </Button>
      </div>
      <div className='mb-4 flex max-w-xl flex-wrap gap-2'>
        <Input
          placeholder={t('companyIdFilter', {
            defaultValue: 'Filter by company ID (optional)'
          })}
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className='font-mono text-sm'
        />
        <Button variant='secondary' onClick={() => setCompanyFilter('')}>
          {t('clear', { defaultValue: 'Clear' })}
        </Button>
      </div>

      {isLoading && (
        <div className='flex justify-center py-12'>
          <Spinner className='h-8 w-8' />
        </div>
      )}

      {data && (data.items ?? []).length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('documentNumber', { defaultValue: 'Document №' })}
              </TableHead>
              <TableHead>{t('id', { defaultValue: 'ID' })}</TableHead>
              <TableHead>{t('company', { defaultValue: 'Company' })}</TableHead>
              <TableHead>{t('amount', { defaultValue: 'Amount' })}</TableHead>
              <TableHead>{t('status', { defaultValue: 'Status' })}</TableHead>
              <TableHead>{t('due', { defaultValue: 'Due' })}</TableHead>
              <TableHead>{t('actions', { defaultValue: 'Actions' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data.items ?? [])
              .filter((inv): inv is typeof inv & { id: string } =>
                Boolean(inv.id?.trim())
              )
              .map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className='font-mono text-xs'>
                    {inv.documentNumber?.trim() ? (
                      <Link
                        href={`/platform/invoices/${inv.id}`}
                        className='text-primary underline'
                      >
                        {inv.documentNumber}
                      </Link>
                    ) : (
                      <Link
                        href={`/platform/invoices/${inv.id}`}
                        className='text-primary underline'
                      >
                        {t('draft', { defaultValue: 'Draft' })}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    <Link
                      href={`/platform/invoices/${inv.id}`}
                      className='text-primary underline'
                    >
                      {inv.id.slice(0, 8)}…
                    </Link>
                  </TableCell>
                  <TableCell>
                    {inv.companyId ? (
                      <Link
                        href={`/platform/companies/${inv.companyId}`}
                        className='text-primary font-mono text-xs underline'
                      >
                        {inv.companyId.slice(0, 8)}…
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className='font-medium'>
                    {formatPriceMinorUnits(
                      inv.amount ?? 0,
                      inv.currency || 'RUB',
                      intlLocale
                    )}
                  </TableCell>
                  <TableCell>
                    {invoiceStatusLabel(tOrgInv, inv.status ?? 'draft')}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {formatAppDateTime(inv.dueDate, intlLocale)}
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <Select
                        value={inv.status ?? 'draft'}
                        onValueChange={(v) =>
                          patch.mutate({
                            id: inv.id,
                            status: v as (typeof INV_STATUSES)[number]
                          })
                        }
                      >
                        <SelectTrigger className='h-8 max-w-[220px] min-w-[10rem]'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INV_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {invoiceStatusLabel(tOrgInv, s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
