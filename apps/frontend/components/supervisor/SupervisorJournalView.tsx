'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { enUS, ru } from 'date-fns/locale';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  shiftApi,
  type ShiftActivityQueryOpts,
  type UnitClient
} from '@/lib/api';
import { userSeesFullShiftJournal } from '@/lib/shift-journal-access';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { SupervisorActivityRow } from '@/components/supervisor/SupervisorActivityRow';
import {
  emptyJournalFilterState,
  SupervisorJournalFiltersBar,
  type JournalFilterState
} from '@/components/supervisor/SupervisorJournalFiltersBar';
import { Link } from '@/src/i18n/navigation';

const PAGE_SIZE_OPTIONS = [20, 40, 60, 100] as const;

function buildActivityOpts(
  f: JournalFilterState,
  pageSize: number,
  cursor?: string
): ShiftActivityQueryOpts {
  const o: ShiftActivityQueryOpts = { limit: pageSize, cursor };
  const c = f.counterId.trim();
  if (c) o.counterId = c;
  const u = f.userId.trim();
  if (u) o.userId = u;
  const cl = f.clientId.trim();
  if (cl) o.clientId = cl;
  const tk = f.ticket.trim();
  if (tk) o.ticket = tk;
  const q = f.q.trim();
  if (q) o.q = q;
  if (f.weekdays.length > 0) {
    o.weekdays = [...f.weekdays].sort((a, b) => a - b);
  }
  const df = f.dateFrom.trim();
  if (df) o.dateFrom = df;
  const dto = f.dateTo.trim();
  if (dto) o.dateTo = dto;
  return o;
}

type Props = {
  /** Unit id from the URL path (dashboard unit when coming from supervisor). */
  routeUnitId: string;
};

export function SupervisorJournalView({ routeUnitId }: Props) {
  const { user } = useAuthContext();
  const searchParams = useSearchParams();
  const scopeUnitIdRaw = searchParams.get('scopeUnitId')?.trim() ?? '';
  const apiUnitId = scopeUnitIdRaw.length > 0 ? scopeUnitIdRaw : routeUnitId;

  const t = useTranslations('supervisor.dashboardUi');
  const locale = useLocale();
  const dateLocale = locale.startsWith('ru') ? ru : enUS;

  const seesFullJournal = userSeesFullShiftJournal(user, apiUnitId);
  const backHref = seesFullJournal ? `/supervisor/${routeUnitId}` : '/staff';

  const [draft, setDraft] = useState<JournalFilterState>(
    emptyJournalFilterState
  );
  const [applied, setApplied] = useState<JournalFilterState>(
    emptyJournalFilterState
  );
  const [selectedVisitor, setSelectedVisitor] = useState<UnitClient | null>(
    null
  );
  const [journalFiltersBarKey, setJournalFiltersBarKey] = useState(0);

  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(40);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([
    undefined
  ]);

  const appliedKey = useMemo(
    () => ({
      counterId: applied.counterId,
      userId: applied.userId,
      clientId: applied.clientId,
      ticket: applied.ticket,
      q: applied.q,
      weekdays: [...applied.weekdays].sort((a, b) => a - b).join(','),
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo
    }),
    [applied]
  );

  const cursorForApi = pageIndex === 0 ? undefined : pageCursors[pageIndex];

  const queryEnabled = pageIndex === 0 || Boolean(cursorForApi);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: [
      'shift-activity',
      apiUnitId,
      'journal',
      appliedKey,
      pageSize,
      pageIndex,
      cursorForApi ?? '__first__'
    ],
    queryFn: () =>
      shiftApi.getActivity(
        apiUnitId,
        buildActivityOpts(applied, pageSize, cursorForApi)
      ),
    enabled: queryEnabled
  });

  const resetPagination = () => {
    setPageIndex(0);
    setPageCursors([undefined]);
  };

  const goNextPage = () => {
    const nc = data?.nextCursor;
    if (!nc) return;
    setPageCursors((prev) => {
      const out = [...prev];
      const slot = pageIndex + 1;
      while (out.length <= slot) {
        out.push(undefined);
      }
      out[slot] = nc;
      return out;
    });
    setPageIndex((i) => i + 1);
  };

  const goPrevPage = () => {
    setPageIndex((i) => Math.max(0, i - 1));
  };

  const { data: counters = [] } = useQuery({
    queryKey: ['shift-counters', apiUnitId, 'journal-filters'],
    queryFn: () => shiftApi.getCounters(apiUnitId),
    staleTime: 60_000
  });

  const { data: actorsData } = useQuery({
    queryKey: ['shift-activity-actors', apiUnitId],
    queryFn: () => shiftApi.getActivityActors(apiUnitId),
    staleTime: 60_000
  });
  const actors = actorsData?.items ?? [];

  const rows = data?.items ?? [];

  const handleApply = () => {
    setApplied({ ...draft });
    resetPagination();
  };

  const handleReset = () => {
    setDraft(emptyJournalFilterState);
    setApplied(emptyJournalFilterState);
    setSelectedVisitor(null);
    setJournalFiltersBarKey((k) => k + 1);
    resetPagination();
  };

  return (
    <div className='container mx-auto max-w-4xl space-y-6 p-4'>
      <div>
        <Button variant='ghost' size='sm' className='mb-4 -ml-2' asChild>
          <Link href={backHref}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            {t('journalBack')}
          </Link>
        </Button>
        <h1 className='text-2xl font-bold'>{t('journalTitle')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          {seesFullJournal
            ? t('journalDescription')
            : t('journalDescriptionOwnOnly')}
        </p>
      </div>

      <SupervisorJournalFiltersBar
        key={journalFiltersBarKey}
        unitId={apiUnitId}
        draft={draft}
        onDraftChange={setDraft}
        counters={counters}
        actors={actors}
        selectedVisitor={selectedVisitor}
        onSelectedVisitorChange={setSelectedVisitor}
        onApply={handleApply}
        onReset={handleReset}
        hideOperatorFilter={!seesFullJournal}
      />

      <Card>
        <CardHeader className='space-y-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div>
              <CardTitle>{t('activityTitle')}</CardTitle>
              <CardDescription>{t('journalCardDescription')}</CardDescription>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <Label htmlFor='journal-page-size' className='whitespace-nowrap'>
                {t('journalPageSize')}
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v) as (typeof PAGE_SIZE_OPTIONS)[number]);
                  resetPagination();
                }}
              >
                <SelectTrigger id='journal-page-size' className='w-[5.5rem]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {isLoading ? (
            <div className='flex justify-center py-12'>
              <Loader2 className='text-muted-foreground h-10 w-10 animate-spin' />
            </div>
          ) : isError ? (
            <p className='text-destructive text-sm'>
              {t('activityError', { message: (error as Error)?.message ?? '' })}
            </p>
          ) : rows.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('activityEmpty')}
            </p>
          ) : (
            <>
              <ul className='divide-border divide-y rounded-lg border'>
                {rows.map((item) => (
                  <SupervisorActivityRow
                    key={item.id}
                    item={item}
                    t={t}
                    dateLocale={dateLocale}
                    timeFormat='PPpp'
                  />
                ))}
              </ul>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <p className='text-muted-foreground text-sm'>
                  {t('journalPageLabel', { page: pageIndex + 1 })}
                </p>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={pageIndex === 0 || isFetching}
                    onClick={goPrevPage}
                  >
                    {t('journalPagePrev')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={!data?.nextCursor || isFetching}
                    onClick={goNextPage}
                  >
                    {t('journalPageNext')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
