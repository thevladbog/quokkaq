'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  countersApi,
  shiftApi,
  unitsApi,
  type Counter,
  type Unit
} from '@/lib/api';
import { useAuthContext } from '@/contexts/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Loader2, Search, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type WorkstationRow = {
  counter: Counter;
  workplaceUnit: Unit;
  zoneFilterKey: string;
  zoneLabel: string;
};

async function loadUnitsWithAncestors(
  seedIds: string[]
): Promise<Map<string, Unit>> {
  const map = new Map<string, Unit>();
  let pending = [...new Set(seedIds.filter(Boolean))];
  let guard = 0;
  while (pending.length > 0 && guard < 20) {
    guard += 1;
    const batch = pending.filter((id) => !map.has(id));
    pending = [];
    if (batch.length === 0) break;
    const results = await Promise.all(
      batch.map((id) => unitsApi.getById(id).catch(() => null))
    );
    for (const u of results) {
      if (!u) continue;
      map.set(u.id, u);
      if (u.parentId && !map.has(u.parentId)) {
        pending.push(u.parentId);
      }
    }
  }
  return map;
}

function resolveZone(
  workplaceUnit: Unit,
  unitsById: Map<string, Unit>
): { zoneFilterKey: string; zoneLabel: string } {
  let current: Unit | undefined = workplaceUnit;
  let steps = 0;
  while (current && steps < 20) {
    steps += 1;
    if (current.kind === 'service_zone') {
      return { zoneFilterKey: `sz:${current.id}`, zoneLabel: current.name };
    }
    if (current.kind === 'subdivision') {
      return { zoneFilterKey: `sd:${current.id}`, zoneLabel: current.name };
    }
    if (!current.parentId) break;
    current = unitsById.get(current.parentId);
  }
  return {
    zoneFilterKey: `u:${workplaceUnit.id}`,
    zoneLabel: workplaceUnit.name
  };
}

type Props = {
  restrictUnitId: string | null;
};

export default function StaffWorkstationDirectory({ restrictUnitId }: Props) {
  const { user, isLoading: authLoading } = useAuthContext();
  const router = useRouter();
  const t = useTranslations('staff.directory');
  const tStaff = useTranslations('staff');

  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [rows, setRows] = useState<WorkstationRow[]>([]);

  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'available' | 'occupied'
  >('all');
  const [search, setSearch] = useState('');

  const seedUnitIds = useMemo(() => {
    if (!user?.units?.length) return [];
    const ids = user.units.map((u: { unitId: string }) => u.unitId);
    if (restrictUnitId && ids.includes(restrictUnitId)) return [restrictUnitId];
    if (restrictUnitId) return [];
    return ids;
  }, [user?.units, restrictUnitId]);

  const runBootstrap = useCallback(async () => {
    if (!user?.id || seedUnitIds.length === 0) {
      setRows([]);
      setBootstrapLoading(false);
      return;
    }

    setBootstrapLoading(true);
    let navigatedAway = false;
    try {
      const unitsById = await loadUnitsWithAncestors(seedUnitIds);

      const counterLists = await Promise.all(
        seedUnitIds.map((unitId) => countersApi.getByUnitId(unitId))
      );

      const flat = counterLists.flat();
      const mine = flat.find((c) => c.assignedTo === user.id);
      if (mine) {
        router.replace(`/staff/${mine.unitId}/${mine.id}`);
        navigatedAway = true;
        return;
      }

      const built: WorkstationRow[] = [];
      for (const counter of flat) {
        const workplaceUnit = unitsById.get(counter.unitId);
        if (!workplaceUnit) continue;
        const { zoneFilterKey, zoneLabel } = resolveZone(
          workplaceUnit,
          unitsById
        );
        built.push({ counter, workplaceUnit, zoneFilterKey, zoneLabel });
      }

      setRows(built);
    } catch (e) {
      console.error(e);
      setRows([]);
      toast.error(t('loadError'));
    } finally {
      if (!navigatedAway) {
        setBootstrapLoading(false);
      }
    }
  }, [user?.id, seedUnitIds, router, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setBootstrapLoading(false);
      setRows([]);
      return;
    }
    void runBootstrap();
  }, [authLoading, user, runBootstrap]);

  const zoneOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const prev = map.get(r.zoneFilterKey);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(r.zoneFilterKey, { label: r.zoneLabel, count: 1 });
      }
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (zoneFilter !== 'all') {
      list = list.filter((r) => r.zoneFilterKey === zoneFilter);
    }
    if (statusFilter === 'available') {
      list = list.filter((r) => !r.counter.assignedTo);
    } else if (statusFilter === 'occupied') {
      list = list.filter((r) => !!r.counter.assignedTo);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const name = r.counter.name.toLowerCase();
        const zone = r.zoneLabel.toLowerCase();
        const op = (r.counter.assignedUser?.name ?? '').toLowerCase();
        return name.includes(q) || zone.includes(q) || op.includes(q);
      });
    }
    return list;
  }, [rows, zoneFilter, statusFilter, search]);

  const metrics = useMemo(() => {
    const total = filteredRows.length;
    const available = filteredRows.filter((r) => !r.counter.assignedTo).length;
    return { total, available };
  }, [filteredRows]);

  const uniqueWorkplaceIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of filteredRows) {
      s.add(r.counter.unitId);
    }
    return [...s];
  }, [filteredRows]);

  const { data: shiftDash, isLoading: shiftLoading } = useQuery({
    queryKey: ['staff-selection-shift-dashboard', uniqueWorkplaceIds[0]],
    queryFn: () => shiftApi.getDashboard(uniqueWorkplaceIds[0]!),
    enabled: uniqueWorkplaceIds.length === 1 && !!uniqueWorkplaceIds[0]
  });

  const hasMyCounterElsewhere = useMemo(
    () => rows.some((r) => r.counter.assignedTo === user?.id),
    [rows, user?.id]
  );

  const occupyMutation = useMutation({
    mutationFn: ({ counterId }: { counterId: string; unitId: string }) =>
      countersApi.occupy(counterId),
    onSuccess: (_, { counterId, unitId }) => {
      router.push(`/staff/${unitId}/${counterId}`);
    },
    onError: (error: Error) => {
      toast.error(tStaff('occupyCounterError', { message: error.message }));
    }
  });

  if (authLoading || bootstrapLoading) {
    return (
      <div className='flex min-h-[40vh] items-center justify-center'>
        <Loader2 className='text-primary h-10 w-10 animate-spin' />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (seedUnitIds.length === 0) {
    return (
      <Card>
        <CardContent className='text-muted-foreground p-8 text-center'>
          {tStaff('selectUnitNoUnits')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className='flex flex-col gap-6 lg:flex-row lg:items-start'
      data-testid='e2e-staff-workstation-directory'
    >
      <aside className='bg-card text-card-foreground w-full shrink-0 space-y-6 rounded-xl border p-4 lg:w-72'>
        <div>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
            {t('zonesTitle')}
          </p>
          <div className='flex flex-col gap-1'>
            <button
              type='button'
              onClick={() => setZoneFilter('all')}
              className={cn(
                'flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                zoneFilter === 'all'
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted/60'
              )}
            >
              <span>{t('allZones')}</span>
              <Badge variant='secondary' className='tabular-nums'>
                {rows.length}
              </Badge>
            </button>
            {zoneOptions.map((z) => (
              <button
                key={z.key}
                type='button'
                onClick={() => setZoneFilter(z.key)}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  zoneFilter === z.key
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted/60'
                )}
              >
                <span className='truncate pr-2'>{z.label}</span>
                <Badge variant='outline' className='shrink-0 tabular-nums'>
                  {z.count}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
            {t('statusTitle')}
          </p>
          <div className='flex flex-wrap gap-2'>
            {(['all', 'available', 'occupied'] as const).map((key) => (
              <Button
                key={key}
                type='button'
                size='sm'
                variant={statusFilter === key ? 'default' : 'outline'}
                onClick={() => setStatusFilter(key)}
              >
                {key === 'all'
                  ? t('statusAll')
                  : key === 'available'
                    ? t('statusAvailable')
                    : t('statusOccupied')}
              </Button>
            ))}
          </div>
        </div>

        <Card className='bg-muted/40 border-none shadow-none'>
          <CardHeader className='p-4 pb-2'>
            <CardTitle className='text-sm'>{t('insightTitle')}</CardTitle>
            <CardDescription className='text-xs'>
              {t('insightBody')}
            </CardDescription>
          </CardHeader>
        </Card>
      </aside>

      <div className='min-w-0 flex-1 space-y-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>
            {t('pageTitle')}
          </h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('pageSubtitle')}
          </p>
        </div>

        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>{t('metricTotal')}</CardDescription>
              <CardTitle className='text-3xl tabular-nums'>
                {metrics.total}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>{t('metricAvailable')}</CardDescription>
              <CardTitle className='text-3xl tabular-nums'>
                {metrics.available}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>{t('metricWait')}</CardDescription>
              <CardTitle className='text-3xl tabular-nums'>
                {uniqueWorkplaceIds.length !== 1 ? (
                  <span className='text-muted-foreground text-xl font-normal'>
                    {t('metricWaitMultiple')}
                  </span>
                ) : shiftLoading ? (
                  <Loader2 className='h-8 w-8 animate-spin' />
                ) : (
                  t('metricWaitMinutes', {
                    minutes: shiftDash?.averageWaitTimeMinutes ?? 0
                  })
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className='relative'>
          <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
          <Input
            className='pl-9'
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('searchPlaceholder')}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('tableTitle')}</CardTitle>
            <CardDescription>
              {t('tableFooter', {
                shown: filteredRows.length,
                total: rows.length,
                zones: zoneOptions.length
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className='px-0 sm:px-6'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colCounter')}</TableHead>
                  <TableHead>{t('colZone')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead>{t('colOperator')}</TableHead>
                  <TableHead className='text-right'>{t('colAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className='text-muted-foreground h-24 text-center'
                    >
                      {t('emptyTable')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => {
                    const c = r.counter;
                    const isOccupied = !!c.assignedTo;
                    const isMe = c.assignedTo === user.id;
                    const disabledOther =
                      (isOccupied && !isMe) ||
                      (!!hasMyCounterElsewhere && !isMe);

                    return (
                      <TableRow key={c.id}>
                        <TableCell className='font-medium'>{c.name}</TableCell>
                        <TableCell>{r.zoneLabel}</TableCell>
                        <TableCell>
                          {isOccupied ? (
                            <Badge variant={isMe ? 'default' : 'secondary'}>
                              {isMe
                                ? t('statusBadgeYou')
                                : t('statusBadgeOccupied')}
                            </Badge>
                          ) : (
                            <Badge
                              variant='outline'
                              className='border-green-600/40 text-green-700 dark:text-green-400'
                            >
                              {t('statusBadgeFree')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isOccupied ? (
                            <span className='flex items-center gap-2 text-sm'>
                              <UserIcon className='h-4 w-4 shrink-0 opacity-70' />
                              {isMe
                                ? tStaff('you')
                                : (c.assignedUser?.name ??
                                  tStaff('occupiedUnknown'))}
                            </span>
                          ) : (
                            <span className='text-muted-foreground text-sm'>
                              {t('unassigned')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          {isMe ? (
                            <Button
                              size='sm'
                              onClick={() =>
                                router.push(`/staff/${c.unitId}/${c.id}`)
                              }
                            >
                              {t('actionContinue')}
                            </Button>
                          ) : (
                            <Button
                              size='sm'
                              variant={isOccupied ? 'outline' : 'default'}
                              disabled={
                                disabledOther || occupyMutation.isPending
                              }
                              onClick={() => {
                                if (!isOccupied && !hasMyCounterElsewhere) {
                                  occupyMutation.mutate({
                                    counterId: c.id,
                                    unitId: c.unitId
                                  });
                                }
                              }}
                            >
                              {isOccupied
                                ? t('actionInUse')
                                : t('actionSelect')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
