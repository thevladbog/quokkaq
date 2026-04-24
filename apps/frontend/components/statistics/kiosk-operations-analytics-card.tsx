'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  getGetUnitsUnitIdKioskAnalyticsQueryKey,
  getGetUnitsUnitIdKioskAnalyticsUrl,
  getUnitsUnitIdKioskAnalytics
} from '@/lib/api/generated/units';
import { authenticatedApiFetch } from '@/lib/authenticated-api-fetch';
import { triggerBlobDownload } from '@/lib/download-blob';

type Props = {
  unitId: string;
  from: string;
  to: string;
};

type KioskAnalyticsData = {
  unitId: string;
  fromUtc: string;
  toUtc: string;
  tickets: {
    created: number;
    served: number;
    noShow: number;
    abandonedVisitor: number;
  };
  telemetry: {
    sampleCount: number;
    avgRoundtripMs: number | null;
    printerErrorCount: number;
    paperOutCount: number;
  };
};

function isPlanBlocked(err: unknown): boolean {
  if (err == null) {
    return false;
  }
  const s = String((err as Error)?.message ?? err);
  return (
    s.includes('403') ||
    s.toLowerCase().includes('plan') ||
    s.toLowerCase().includes('forbidden')
  );
}

export function KioskOperationsAnalyticsCard({ unitId, from, to }: Props) {
  const t = useTranslations('statistics.kiosk_ops');
  const q = useQuery({
    queryKey: getGetUnitsUnitIdKioskAnalyticsQueryKey(unitId, { from, to }),
    queryFn: () => getUnitsUnitIdKioskAnalytics(unitId, { from, to }),
    enabled: Boolean(unitId && from && to)
  });
  const wrapped = (q as { data?: { data: unknown; status: number } }).data;
  const d =
    wrapped && wrapped.status === 200
      ? (wrapped.data as KioskAnalyticsData | null | undefined)
      : null;

  const onCsv = async () => {
    if (!unitId) {
      return;
    }
    const url = getGetUnitsUnitIdKioskAnalyticsUrl(unitId, {
      from,
      to,
      format: 'csv'
    });
    const res = await authenticatedApiFetch(url);
    if (!res.ok) {
      return;
    }
    const blob = await res.blob();
    triggerBlobDownload(blob, `kiosk-operations-${from}_to_${to}.csv`);
  };

  if (q.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Loader2 className='h-4 w-4 animate-spin' />
          {t('loading')}
        </CardContent>
      </Card>
    );
  }
  if (q.isError && isPlanBlocked(q.error)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('plan_block')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (q.isError || !d) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className='text-muted-foreground text-sm'>
          {t('error')}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-2 space-y-0'>
        <div>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('desc')}</CardDescription>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => void onCsv()}
        >
          <Download className='h-4 w-4' />
          {t('export_csv')}
        </Button>
      </CardHeader>
      <CardContent>
        <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4'>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('k_tickets')}</dt>
            <dd className='text-lg font-semibold'>{d.tickets?.created ?? 0}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('k_served')}</dt>
            <dd className='text-lg font-semibold'>{d.tickets?.served ?? 0}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('k_telemetry')}
            </dt>
            <dd className='text-lg font-semibold'>
              {d.telemetry?.sampleCount ?? 0}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('k_avg_rt')}</dt>
            <dd className='text-lg font-semibold'>
              {d.telemetry?.avgRoundtripMs != null
                ? Math.round(d.telemetry.avgRoundtripMs)
                : '—'}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
