'use client';

import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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

const SUPPORT_LIST_DESCRIPTION_MAX_CHARS = 100;

function formatSupportListDate(
  locale: string,
  iso: string | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return d.toISOString();
  }
}

function descriptionListPreview(
  raw: string | undefined,
  maxChars: number
): string {
  const line = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return '—';
  if (line.length <= maxChars) return line;
  return `${line.slice(0, maxChars)}…`;
}

export default function StaffSupportPage() {
  const t = useTranslations('staff.support');
  const locale = useLocale();
  const listQ = useListSupportReports();
  const dateTimeOpts: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short'
  };

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
                  <TableHead className='max-w-[11rem] min-w-0 sm:max-w-[18rem]'>
                    {t('colDescription')}
                  </TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead className='text-right whitespace-nowrap'>
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
                      {r.markedIrrelevantAt ? (
                        <span className='text-muted-foreground ml-2 text-xs font-normal'>
                          ({t('badgeIrrelevant')})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className='text-muted-foreground max-w-[11rem] min-w-0 text-sm sm:max-w-[18rem]'
                      title={
                        r.description?.trim()
                          ? r.description.replace(/\s+/g, ' ').trim()
                          : undefined
                      }
                    >
                      <span className='block truncate'>
                        {descriptionListPreview(
                          r.description,
                          SUPPORT_LIST_DESCRIPTION_MAX_CHARS
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{r.planeStatus?.trim() || '—'}</TableCell>
                    <TableCell className='text-muted-foreground text-right text-sm whitespace-nowrap'>
                      {formatSupportListDate(locale, r.createdAt, dateTimeOpts)}
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
