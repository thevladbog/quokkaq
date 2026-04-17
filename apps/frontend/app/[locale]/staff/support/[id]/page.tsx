'use client';

import { use } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/src/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useGetSupportReportByID } from '@/lib/api/generated/support';
import { ApiHttpError } from '@/lib/api-errors';
import { toast } from 'sonner';

function formatDate(iso: string | undefined) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function StaffSupportDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('staff.support');
  const router = useRouter();
  const q = useGetSupportReportByID(id, {
    query: { enabled: Boolean(id) }
  });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('detailCopied'));
    } catch {
      toast.error(t('detailCopyError'));
    }
  };

  if (q.isLoading) {
    return (
      <div className='flex min-h-[40vh] items-center justify-center p-4'>
        <Loader2 className='text-primary h-10 w-10 animate-spin' />
      </div>
    );
  }

  if (q.isError) {
    const err = q.error;
    if (err instanceof ApiHttpError) {
      if (err.status === 404) {
        return (
          <div className='container mx-auto max-w-2xl p-4 md:p-6'>
            <p className='text-muted-foreground'>{t('detailNotFound')}</p>
            <Button variant='outline' className='mt-4' asChild>
              <Link href='/staff/support'>{t('myReports')}</Link>
            </Button>
          </div>
        );
      }
      if (err.status === 403) {
        return (
          <div className='container mx-auto max-w-2xl p-4 md:p-6'>
            <p className='text-destructive'>{t('detailForbidden')}</p>
            <Button variant='outline' className='mt-4' asChild>
              <Link href='/staff/support'>{t('myReports')}</Link>
            </Button>
          </div>
        );
      }
    }
    return (
      <div className='container mx-auto max-w-2xl p-4 md:p-6'>
        <p className='text-destructive'>{t('detailLoadError')}</p>
        <Button variant='outline' className='mt-4' asChild>
          <Link href='/staff/support'>{t('myReports')}</Link>
        </Button>
      </div>
    );
  }

  const res = q.data;
  if (!res || res.status !== 200 || res.data == null) {
    return (
      <div className='container mx-auto max-w-2xl p-4 md:p-6'>
        <p className='text-destructive'>{t('detailLoadError')}</p>
        <Button variant='outline' className='mt-4' asChild>
          <Link href='/staff/support'>{t('myReports')}</Link>
        </Button>
      </div>
    );
  }

  const r = res.data;

  return (
    <div className='container mx-auto max-w-2xl space-y-6 p-4 md:p-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>
            {t('detailTitle')}
          </h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('detailSubtitle')}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' asChild>
            <Link href='/staff/support'>{t('myReports')}</Link>
          </Button>
          <Button variant='outline' onClick={() => router.push('/staff')}>
            {t('backToStaff')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-xl'>{r.title}</CardTitle>
          <CardDescription>
            {t('detailStatus')}: {r.planeStatus?.trim() || '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4 text-sm'>
          <dl className='grid gap-3 sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>{t('detailSeq')}</dt>
              <dd className='font-mono tabular-nums'>
                {r.planeSequenceId ?? '—'}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('detailCreated')}</dt>
              <dd>{formatDate(r.createdAt)}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('detailUpdated')}</dt>
              <dd>{formatDate(r.updatedAt)}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('detailLastSync')}</dt>
              <dd>{formatDate(r.lastSyncedAt)}</dd>
            </div>
            {r.unitId ? (
              <div className='sm:col-span-2'>
                <dt className='text-muted-foreground'>{t('detailUnitId')}</dt>
                <dd className='font-mono text-xs break-all'>{r.unitId}</dd>
              </div>
            ) : null}
            {r.traceId ? (
              <div className='sm:col-span-2'>
                <dt className='text-muted-foreground'>{t('detailTraceId')}</dt>
                <dd className='flex flex-wrap items-center gap-2'>
                  <span className='font-mono text-xs break-all'>
                    {r.traceId}
                  </span>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-7 shrink-0'
                    onClick={() => void copy(r.traceId!)}
                  >
                    {t('detailCopy')}
                  </Button>
                </dd>
              </div>
            ) : null}
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground'>
                {t('detailPlaneWorkItemId')}
              </dt>
              <dd className='flex flex-wrap items-center gap-2'>
                <span className='font-mono text-xs break-all'>
                  {r.planeWorkItemId ?? '—'}
                </span>
                {r.planeWorkItemId ? (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-7 shrink-0'
                    onClick={() => void copy(r.planeWorkItemId!)}
                  >
                    {t('detailCopy')}
                  </Button>
                ) : null}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
