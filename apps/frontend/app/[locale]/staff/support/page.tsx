'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import SupportReportDialog from '@/components/staff/SupportReportDialog';
import { useListSupportReports } from '@/lib/api/generated/support';

function formatDate(iso: string | undefined) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function StaffSupportPage() {
  const t = useTranslations('staff.support');
  const listQ = useListSupportReports();

  const rows = listQ.data?.status === 200 ? (listQ.data.data ?? []) : [];

  return (
    <div className='container mx-auto max-w-5xl space-y-6 p-4 md:p-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>
            {t('pageTitle')}
          </h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('pageSubtitle')}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <SupportReportDialog />
          <Button variant='outline' asChild>
            <Link href='/staff'>{t('backToStaff')}</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('myReports')}</CardTitle>
          <CardDescription>
            {listQ.isError ? t('loadError') : null}
          </CardDescription>
        </CardHeader>
        <CardContent className='px-0 sm:px-6'>
          {listQ.isLoading ? (
            <div className='flex justify-center py-12'>
              <Loader2 className='text-primary h-10 w-10 animate-spin' />
            </div>
          ) : listQ.isError ? null : rows.length === 0 ? (
            <p className='text-muted-foreground px-4 py-8 text-center text-sm'>
              {t('empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-16'>{t('colSeq')}</TableHead>
                  <TableHead>{t('colTitle')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead className='text-right'>
                    {t('colCreated')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className='hover:bg-muted/50'>
                    <TableCell className='text-muted-foreground tabular-nums'>
                      {r.planeSequenceId ?? '—'}
                    </TableCell>
                    <TableCell className='font-medium'>
                      <Link
                        href={`/staff/support/${r.id}`}
                        className='text-primary hover:underline'
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell>{r.planeStatus?.trim() || '—'}</TableCell>
                    <TableCell className='text-muted-foreground text-right text-sm'>
                      {formatDate(r.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
