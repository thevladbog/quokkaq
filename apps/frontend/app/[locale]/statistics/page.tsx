'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode
} from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  Sector
} from 'recharts';
import { formatInTimeZone } from 'date-fns-tz';
import { enUS, ru } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import type { User } from '@quokkaq/shared-types';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { DatePickerSingleOrRange } from '@/components/ui/date-picker-single-or-range';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  PermAccessStatsSubdivision,
  PermAccessStatsZone,
  PermAccessSurveyResponses,
  PermStatisticsRead,
  userHasCanonicalUnitPermission,
  userHasCanonicalUnitPermissionInAnyUnit,
  userUnitPermissionMatches
} from '@/lib/permission-variants';
import { isTenantAdminUser } from '@/lib/tenant-admin-access';
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
import {
  useGetUnitStatisticsTimeseries,
  useGetUnitStatisticsSlaDeviations,
  useGetUnitStatisticsLoad,
  useGetUnitStatisticsUtilization,
  useGetUnitStatisticsSurveyScores,
  useGetUnitStatisticsTicketsByService,
  useGetUnitStatisticsSlaSummary,
  useGetUnitStatisticsSlaHeatmap,
  useGetUnitStatisticsStaffPerformanceList,
  useGetUnitStatisticsStaffPerformanceDetail,
  useGetUnitStatisticsStaffingForecast,
  useGetUnitStatisticsAnomalyAlerts
} from '@/lib/api/generated/statistics';
import { SLAHeatmapChart } from '@/components/statistics/SLAHeatmapChart';
import {
  StaffLeaderboard,
  type StaffSortField
} from '@/components/statistics/StaffLeaderboard';
import { StaffOperatorDetailCard } from '@/components/statistics/StaffOperatorDetailCard';
import { StaffingForecastPanel } from '@/components/statistics/StaffingForecastPanel';
import { useGetUnitsUnitIdShiftActivityActors } from '@/lib/api/generated/shift';
import { useGetUnitsUnitIdServices } from '@/lib/api/generated/services';
import { isApiHttpError } from '@/lib/api-errors';
import { normalizeChildUnitsQueryData } from '@/lib/child-units-query';
import {
  getUnitByID,
  useGetUnitByID,
  useGetUnitsUnitIdChildUnits,
  type ModelsService,
  type ModelsUnit
} from '@/lib/api/generated/units';
import {
  useListDefinitions,
  type ModelsSurveyDefinition
} from '@/lib/api/generated/surveys';
import {
  formatStatisticsAsOfLine,
  formatStatisticsChartAxisLabel,
  formatStatisticsTooltipLabel
} from '@/lib/statistics-chart-dates';
import {
  buildSurveyScoreChartRows,
  buildWaitTimeseriesChartRows,
  computeSurveyScoreYDomain
} from '@/lib/statistics-chart-series';
import {
  pickGuestSurveyLabelForLocale,
  unwrapGuestSurveyQuestionsJson
} from '@/lib/guest-survey-blocks';
import { cn } from '@/lib/utils';
import { getUnitDisplayName } from '@/lib/unit-display';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  downloadStatisticsCSV,
  type StatisticsExportData,
  type StatisticsExportFilters
} from '@/lib/statistics-csv-export';
import { statisticsExportApi } from '@/lib/api';
import {
  parseFilenameFromContentDisposition,
  triggerBlobDownload
} from '@/lib/download-blob';

/** "Today" for statistics date params; must match subdivision calendar (backend buckets). */
function defaultDateRange(timezone?: string | null) {
  const tz = (timezone && timezone.trim()) || 'UTC';
  const today = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
  return { from: today, to: today };
}

/** Props passed to Recharts <Pie shape={…}> (not exported from recharts types in all versions). */
type StatisticsPieSectorProps = {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
  cornerRadius?: number;
  index?: number;
  isActive?: boolean;
};

const PieWithSectorShape = Pie as ComponentType<
  ComponentProps<typeof Pie> & {
    shape?: (props: StatisticsPieSectorProps) => React.ReactNode;
  }
>;

function flattenLeafServices(services: ModelsService[]): ModelsService[] {
  const out: ModelsService[] = [];
  for (const s of services) {
    if (s.isLeaf) {
      out.push(s);
    }
    if (s.children?.length) {
      out.push(...flattenLeafServices(s.children));
    }
  }
  return out;
}

function StatisticsDonutActiveShape(props: StatisticsPieSectorProps) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
    props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={Number(outerRadius ?? 0) + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        className='stroke-background'
        strokeWidth={2}
      />
    </g>
  );
}

type TicketsPieSliceRow = {
  serviceId: string;
  name: string;
  value: number;
  fill: string;
};

/** Pie tooltip: Recharts uses dataKey `value`, so default ChartConfig lookup fails; use row name + fill. */
function TicketsByServiceChartTooltip({
  active,
  payload,
  locale
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload;
  if (raw == null || typeof raw !== 'object') return null;
  const row = raw as TicketsPieSliceRow;
  if (typeof row.value !== 'number') return null;

  return (
    <div className='border-border/50 bg-background grid max-w-xs min-w-[10rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl'>
      <div className='flex w-full items-center justify-between gap-3 leading-none'>
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <div
            className='box-border h-2.5 w-2.5 shrink-0 rounded-[2px] border border-solid'
            style={{
              backgroundColor: row.fill,
              borderColor: row.fill
            }}
          />
          <span className='text-muted-foreground truncate'>{row.name}</span>
        </div>
        <span className='text-foreground shrink-0 font-mono text-[0.8125rem] font-medium tabular-nums'>
          {row.value.toLocaleString(locale)}
        </span>
      </div>
    </div>
  );
}

/** Numeric guest-survey questions (same kinds as backend rollup). */
function listNumericSurveyQuestions(
  questions: ModelsSurveyDefinition['questions'],
  locale: string
): { id: string; label: string }[] {
  if (questions == null) return [];
  const { blocksArray } = unwrapGuestSurveyQuestionsJson(questions);
  const out: { id: string; label: string }[] = [];
  for (const el of blocksArray) {
    if (!el || typeof el !== 'object') continue;
    const m = el as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (!id) continue;
    const typ = String(m.type ?? '')
      .toLowerCase()
      .trim();
    if (!['stars', 'rating', 'nps', 'number', 'scale'].includes(typ)) continue;
    const fromLocalized = pickGuestSurveyLabelForLocale(m.label, locale);
    const fromTitle = typeof m.title === 'string' ? m.title.trim() : '';
    const label = (fromLocalized || fromTitle || id).trim() || id;
    out.push({ id, label });
  }
  return out;
}

function buildSubdivisionOptions(
  assignableIds: string[],
  unitById: Map<string, ModelsUnit>,
  locale: string
): { id: string; name: string }[] {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const uid of assignableIds) {
    const u = unitById.get(uid);
    if (!u?.id) continue;
    let subId: string;
    let subName: string;
    if (u.kind === 'subdivision') {
      subId = u.id;
      subName = getUnitDisplayName(u, locale).trim() || u.id;
    } else if (u.kind === 'service_zone' && u.parentId?.trim()) {
      subId = u.parentId.trim();
      const p = unitById.get(subId);
      subName = (p ? getUnitDisplayName(p, locale) : '').trim() || subId;
    } else {
      continue;
    }
    if (!seen.has(subId)) {
      seen.add(subId);
      out.push({ id: subId, name: subName });
    }
  }
  out.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
  return out;
}

/** Matches backend UserCanViewSurveyScoreAggregates: survey responses, branch statistics, or elevated access. */
function userCanViewSurveyScoreStatistics(
  u: User | null,
  subdivisionId: string
): boolean {
  if (!u || !subdivisionId) return false;
  if (isTenantAdminUser(u)) return true;
  return !!u.units?.some(
    (unit) =>
      unit.unitId === subdivisionId &&
      (unit.permissions ?? []).some(
        (p) =>
          userUnitPermissionMatches([p], PermAccessSurveyResponses) ||
          userUnitPermissionMatches([p], PermAccessStatsSubdivision) ||
          userUnitPermissionMatches([p], PermStatisticsRead)
      )
  );
}

export default function StatisticsPage() {
  const appLocale = useLocale();
  const dateLocale = appLocale.toLowerCase().startsWith('ru') ? ru : enUS;
  const t = useTranslations('statistics');
  const { activeUnitId, assignableUnitIds } = useActiveUnit();
  const { user } = useAuthContext();
  const [{ from, to }, setRange] = useState<{ from: string; to?: string }>(() =>
    defaultDateRange('UTC')
  );
  const [manualSubdivisionId, setManualSubdivisionId] = useState<string | null>(
    null
  );
  const prevDateRangeSigRef = useRef('');
  const [filterUserId, setFilterUserId] = useState('');
  const [serviceZoneId, setServiceZoneId] = useState('');
  const [surveyDefinitionId, setSurveyDefinitionId] = useState('');
  const [surveyQuestionId, setSurveyQuestionId] = useState('');
  const [slaDisplayMode, setSlaDisplayMode] = useState<'percent' | 'count'>(
    'percent'
  );
  const [staffSortBy, setStaffSortBy] =
    useState<StaffSortField>('ticketsCompleted');
  const [staffSelectedUserId, setStaffSelectedUserId] = useState('');
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const [forecastTargetDate, setForecastTargetDate] = useState(tomorrow);
  const [forecastSlaPct, setForecastSlaPct] = useState(90);
  const [forecastMaxWait, setForecastMaxWait] = useState(5);

  const unitQuery = useGetUnitByID(activeUnitId ?? '', {
    query: { enabled: Boolean(activeUnitId) }
  });
  const activeUnit =
    unitQuery.data?.status === 200 ? unitQuery.data.data : undefined;

  // Statistics APIs expect the subdivision (branch) id in the path. Do not block all
  // queries until GET /units/:id returns: use activeUnitId immediately, then switch
  // to parentId once we know the context is a service_zone (avoids empty page while
  // the unit request is slow).
  const { contextResolvedSubdivisionId, statsResolutionBlocked } =
    useMemo(() => {
      if (!activeUnitId) {
        return {
          contextResolvedSubdivisionId: '',
          statsResolutionBlocked: false
        };
      }
      if (!activeUnit) {
        return {
          contextResolvedSubdivisionId: activeUnitId,
          statsResolutionBlocked: false
        };
      }
      if (activeUnit.kind === 'service_zone') {
        const parent = activeUnit.parentId?.trim();
        if (!parent) {
          return {
            contextResolvedSubdivisionId: '',
            statsResolutionBlocked: true
          };
        }
        return {
          contextResolvedSubdivisionId: parent,
          statsResolutionBlocked: false
        };
      }
      return {
        contextResolvedSubdivisionId: activeUnitId,
        statsResolutionBlocked: false
      };
    }, [activeUnitId, activeUnit]);

  useEffect(() => {
    // Defer reset out of the effect body to satisfy react-hooks/set-state-in-effect (microtask is async vs React).
    queueMicrotask(() => {
      setManualSubdivisionId(null);
    });
  }, [contextResolvedSubdivisionId]);

  const assignableSorted = useMemo(
    () => [...assignableUnitIds].sort(),
    [assignableUnitIds]
  );

  const wave1Queries = useQueries({
    queries: assignableSorted.map((id) => ({
      queryKey: ['statistics', 'assignable-unit', id],
      queryFn: async () => {
        const r = await getUnitByID(id);
        if (r.status !== 200) return undefined;
        return r.data;
      },
      enabled: Boolean(id),
      staleTime: 60_000
    }))
  });

  const wave1Units = useMemo(
    () =>
      wave1Queries
        .map((q) => q.data)
        .filter((u): u is ModelsUnit => Boolean(u?.id)),
    [wave1Queries]
  );

  const extraParentIds = useMemo(() => {
    const assign = new Set(assignableUnitIds);
    const out: string[] = [];
    for (const u of wave1Units) {
      if (u.kind === 'service_zone' && u.parentId?.trim()) {
        const p = u.parentId.trim();
        if (!assign.has(p)) out.push(p);
      }
    }
    return [...new Set(out)];
  }, [wave1Units, assignableUnitIds]);

  const wave2Queries = useQueries({
    queries: extraParentIds.map((id) => ({
      queryKey: ['statistics', 'parent-unit', id],
      queryFn: async () => {
        const r = await getUnitByID(id);
        if (r.status !== 200) return undefined;
        return r.data;
      },
      enabled: Boolean(id) && extraParentIds.length > 0,
      staleTime: 60_000
    }))
  });

  const wave2Units = useMemo(
    () =>
      wave2Queries
        .map((q) => q.data)
        .filter((u): u is ModelsUnit => Boolean(u?.id)),
    [wave2Queries]
  );

  const unitById = useMemo(() => {
    const m = new Map<string, ModelsUnit>();
    for (const u of [...wave1Units, ...wave2Units]) {
      if (u.id) m.set(u.id, u);
    }
    return m;
  }, [wave1Units, wave2Units]);

  const subdivisionOptions = useMemo(
    () => buildSubdivisionOptions(assignableUnitIds, unitById, appLocale),
    [assignableUnitIds, unitById, appLocale]
  );

  const statsSubdivisionId =
    manualSubdivisionId ?? contextResolvedSubdivisionId ?? '';

  const statisticsBucketTimezone = useMemo(() => {
    if (!statsSubdivisionId) return 'UTC';
    const u = unitById.get(statsSubdivisionId);
    if (u?.timezone?.trim()) return u.timezone.trim();
    if (activeUnit?.id === statsSubdivisionId && activeUnit.timezone?.trim()) {
      return activeUnit.timezone.trim();
    }
    return 'UTC';
  }, [statsSubdivisionId, unitById, activeUnit]);

  const dateRangeSig =
    statsSubdivisionId !== ''
      ? `${statsSubdivisionId}\x1e${statisticsBucketTimezone}`
      : '';

  useEffect(() => {
    if (!dateRangeSig) return;
    if (prevDateRangeSigRef.current === dateRangeSig) return;
    prevDateRangeSigRef.current = dateRangeSig;
    queueMicrotask(() => {
      setRange(defaultDateRange(statisticsBucketTimezone));
    });
  }, [dateRangeSig, statisticsBucketTimezone]);

  const childZonesQuery = useGetUnitsUnitIdChildUnits(statsSubdivisionId, {
    query: { enabled: Boolean(statsSubdivisionId) }
  });
  const zoneOptions = useMemo(() => {
    const raw = normalizeChildUnitsQueryData(childZonesQuery.data);
    return raw.filter((u) => u.kind === 'service_zone');
  }, [childZonesQuery.data]);

  const serviceZoneParam = useMemo(() => {
    const z = serviceZoneId.trim();
    if (!z) return undefined;
    if (!zoneOptions.some((o) => o.id === z)) return undefined;
    return z;
  }, [serviceZoneId, zoneOptions]);

  const isExpanded = useMemo(() => {
    if (!user) return false;
    if (isTenantAdminUser(user)) return true;
    if (userHasCanonicalUnitPermissionInAnyUnit(user, PermStatisticsRead)) {
      return true;
    }
    if (!statsSubdivisionId) return false;
    const subPerms = user.permissions?.[statsSubdivisionId] ?? [];
    if (userUnitPermissionMatches(subPerms, PermAccessStatsSubdivision)) {
      return true;
    }
    for (const z of zoneOptions) {
      const zid = z.id?.trim();
      if (
        zid &&
        userHasCanonicalUnitPermission(user, zid, PermAccessStatsZone)
      ) {
        return true;
      }
    }
    return false;
  }, [user, statsSubdivisionId, zoneOptions]);

  const actorsQuery = useGetUnitsUnitIdShiftActivityActors(statsSubdivisionId, {
    query: {
      enabled: Boolean(statsSubdivisionId && isExpanded),
      staleTime: 60_000
    }
  });

  const operatorComboboxOptions: ComboboxOption[] = useMemo(() => {
    const items =
      actorsQuery.data?.status === 200
        ? (actorsQuery.data.data.items ?? [])
        : [];
    return items.flatMap((a) => {
      const uid = (a.userId ?? '').trim();
      if (!uid) return [];
      const label = (a.name ?? '').trim() || uid;
      const parts = label.split(/\s+/).filter(Boolean);
      return [
        {
          value: uid,
          label,
          keywords: [uid, ...parts]
        }
      ];
    });
  }, [actorsQuery.data]);

  const userIdParam = useMemo(() => {
    const u = filterUserId.trim();
    if (!u) return undefined;
    if (!isExpanded) return undefined;
    return u;
  }, [filterUserId, isExpanded]);

  const utilizationOperatorId = useMemo(
    () => (filterUserId.trim() || user?.id || '').trim(),
    [filterUserId, user?.id]
  );

  const rangeComplete = Boolean(to?.trim());
  const dateToForApi =
    rangeComplete && to != null && to.trim() !== '' ? to.trim() : from;
  const statsEnabled = Boolean(statsSubdivisionId && rangeComplete);

  const tsQuery = useGetUnitStatisticsTimeseries(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      metric: 'wait_time',
      userId: userIdParam,
      serviceZoneId: serviceZoneParam
    },
    { query: { enabled: statsEnabled } }
  );

  const slaQuery = useGetUnitStatisticsSlaDeviations(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      userId: userIdParam,
      serviceZoneId: serviceZoneParam
    },
    { query: { enabled: statsEnabled } }
  );

  const loadQuery = useGetUnitStatisticsLoad(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      userId: userIdParam,
      serviceZoneId: serviceZoneParam
    },
    { query: { enabled: statsEnabled } }
  );

  const ticketsByServiceQuery = useGetUnitStatisticsTicketsByService(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      userId: userIdParam,
      serviceZoneId: serviceZoneParam
    },
    { query: { enabled: statsEnabled } }
  );

  const [slaSummaryServiceId, setSlaSummaryServiceId] = useState('');
  const slaSummaryQuery = useGetUnitStatisticsSlaSummary(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      userId: userIdParam,
      serviceZoneId: serviceZoneParam,
      serviceId: slaSummaryServiceId.trim() || undefined
    },
    { query: { enabled: statsEnabled } }
  );

  const servicesListQuery = useGetUnitsUnitIdServices(statsSubdivisionId, {
    query: { enabled: statsEnabled }
  });

  const [donutSelectedServiceId, setDonutSelectedServiceId] = useState<
    string | null
  >(null);

  const canSurveyScores = userCanViewSurveyScoreStatistics(
    user,
    statsSubdivisionId
  );
  const surveyDefsQuery = useListDefinitions(statsSubdivisionId, {
    query: { enabled: statsEnabled && canSurveyScores }
  });
  const surveyDefinitions =
    surveyDefsQuery.data?.status === 200 ? surveyDefsQuery.data.data : [];

  const numericQuestionsForSelectedSurvey = useMemo(() => {
    const sid = surveyDefinitionId.trim();
    if (!sid) return [];
    const defs =
      surveyDefsQuery.data?.status === 200 ? surveyDefsQuery.data.data : [];
    const def = defs.find((d) => d.id === sid);
    return listNumericSurveyQuestions(def?.questions, appLocale);
  }, [surveyDefinitionId, surveyDefsQuery.data, appLocale]);

  const surveyQuery = useGetUnitStatisticsSurveyScores(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      surveyId: surveyDefinitionId.trim() || undefined,
      questionIds:
        surveyDefinitionId.trim() && surveyQuestionId.trim()
          ? [surveyQuestionId.trim()]
          : undefined
    },
    {
      query: {
        enabled: statsEnabled && canSurveyScores,
        staleTime: 0,
        refetchOnWindowFocus: true
      }
    }
  );

  const tsStatsBody =
    tsQuery.data?.status === 200 ? tsQuery.data.data : undefined;
  const loadStatsBody =
    loadQuery.data?.status === 200 ? loadQuery.data.data : undefined;
  const slaStatsBody =
    slaQuery.data?.status === 200 ? slaQuery.data.data : undefined;

  const [slaHeatmapType, setSlaHeatmapType] = useState<'wait' | 'service'>(
    'wait'
  );
  const slaHeatmapEnabled = statsEnabled && slaStatsBody?.granularity === 'day';
  const slaHeatmapQuery = useGetUnitStatisticsSlaHeatmap(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      type: slaHeatmapType,
      userId: userIdParam,
      serviceZoneId: serviceZoneParam
    },
    { query: { enabled: slaHeatmapEnabled } }
  );
  const slaHeatmapBody =
    slaHeatmapQuery.data?.status === 200
      ? slaHeatmapQuery.data.data
      : undefined;

  const surveyStatsBody =
    surveyQuery.data?.status === 200 ? surveyQuery.data.data : undefined;

  const utilizationQuery = useGetUnitStatisticsUtilization(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      userId: utilizationOperatorId
    },
    {
      query: {
        enabled: Boolean(
          statsSubdivisionId && utilizationOperatorId && isExpanded
        )
      }
    }
  );

  const staffPerformanceListQuery = useGetUnitStatisticsStaffPerformanceList(
    statsSubdivisionId,
    {
      dateFrom: from,
      dateTo: dateToForApi,
      sort: staffSortBy,
      order: 'desc'
    },
    {
      query: {
        enabled: Boolean(
          statsSubdivisionId && isExpanded && from && dateToForApi
        )
      }
    }
  );

  const staffDetailQuery = useGetUnitStatisticsStaffPerformanceDetail(
    statsSubdivisionId,
    staffSelectedUserId,
    {
      dateFrom: from,
      dateTo: dateToForApi
    },
    {
      query: {
        enabled: Boolean(
          statsSubdivisionId && staffSelectedUserId && isExpanded
        )
      }
    }
  );

  const staffingForecastQuery = useGetUnitStatisticsStaffingForecast(
    statsSubdivisionId,
    {
      targetDate: forecastTargetDate,
      targetSlaPct: forecastSlaPct,
      targetMaxWaitMin: forecastMaxWait,
      lookbackWeeks: 4
    },
    {
      query: {
        enabled: Boolean(statsSubdivisionId && isExpanded)
      }
    }
  );

  const anomalyAlertsQuery = useGetUnitStatisticsAnomalyAlerts(
    statsSubdivisionId,
    { limit: 50 },
    {
      query: {
        enabled: Boolean(statsSubdivisionId && isExpanded)
      }
    }
  );

  const waitData = useMemo(
    () =>
      buildWaitTimeseriesChartRows(
        tsStatsBody?.points,
        tsStatsBody?.granularity
      ),
    [tsStatsBody]
  );

  const loadData = useMemo(() => {
    const pts =
      loadQuery.data?.status === 200 ? (loadQuery.data.data.points ?? []) : [];
    return pts.map((p) => {
      const noShow = p.noShowCount ?? 0;
      // API ticketsCompleted includes no_show; for a stacked bar the segments must be disjoint.
      const completed = Math.max(0, (p.ticketsCompleted ?? 0) - noShow);
      return {
        date: p.date,
        created: p.ticketsCreated,
        completed,
        noShow
      };
    });
  }, [loadQuery.data]);

  const slaChart = useMemo(() => {
    const body = slaQuery.data?.status === 200 ? slaQuery.data.data : undefined;
    const pts = body?.points ?? [];
    let sumTot = 0;
    let sumMet = 0;
    let sumSvcTot = 0;
    let sumSvcMet = 0;
    for (const p of pts) {
      sumTot += p.slaWaitTotal ?? 0;
      sumMet += p.slaWaitMet ?? 0;
      sumSvcTot += p.slaServiceTotal ?? 0;
      sumSvcMet += p.slaServiceMet ?? 0;
    }
    const overallPct = sumTot > 0 ? (100 * sumMet) / sumTot : 0;
    const overallSvcPct = sumSvcTot > 0 ? (100 * sumSvcMet) / sumSvcTot : null;

    if (slaDisplayMode === 'percent') {
      const data = pts.map((p) => {
        const svcTot = p.slaServiceTotal ?? 0;
        const svcMet = p.slaServiceMet ?? 0;
        return {
          date: p.date ?? '',
          within: Math.round((p.withinPct ?? 0) * 10) / 10,
          breach: Math.round((p.breachPct ?? 0) * 10) / 10,
          svcPct:
            svcTot > 0
              ? Math.round(((100 * svcMet) / svcTot) * 10) / 10
              : undefined
        };
      });
      return {
        data,
        yDomain: [0, 100] as [number, number],
        sumTot,
        overallPct,
        sumSvcTot,
        sumSvcMet,
        overallSvcPct
      };
    }

    const data = pts.map((p) => {
      const met = p.slaWaitMet ?? 0;
      const tot = p.slaWaitTotal ?? 0;
      const breach = Math.max(0, tot - met);
      return {
        date: p.date ?? '',
        within: met,
        breach,
        svcPct: undefined as number | undefined
      };
    });
    const maxStack = data.reduce((m, d) => Math.max(m, d.within + d.breach), 0);
    const yMax = maxStack <= 0 ? 1 : Math.ceil(maxStack * 1.05);
    return {
      data,
      yDomain: [0, yMax] as [number, number],
      sumTot,
      overallPct,
      sumSvcTot,
      sumSvcMet,
      overallSvcPct
    };
  }, [slaQuery.data, slaDisplayMode]);

  const surveyChartData = useMemo(
    () =>
      buildSurveyScoreChartRows(
        surveyStatsBody?.points,
        surveyStatsBody?.mode,
        surveyStatsBody?.granularity
      ),
    [surveyStatsBody]
  );

  const surveyScoreYDomain = useMemo(
    (): [number, number] =>
      computeSurveyScoreYDomain(
        surveyStatsBody?.points,
        surveyStatsBody?.mode,
        surveyStatsBody?.granularity
      ),
    [surveyStatsBody]
  );

  const utilChartData = useMemo(() => {
    const uBody =
      utilizationQuery.data?.status === 200
        ? utilizationQuery.data.data
        : undefined;
    const pts = uBody?.points ?? [];
    return pts.map((p) => ({
      date: p.date,
      util:
        p.utilizationPct != null && Number.isFinite(p.utilizationPct)
          ? Math.round(p.utilizationPct * 10) / 10
          : null,
      servingMin: Math.round((p.servingMinutes ?? 0) * 10) / 10,
      idleMin: Math.round((p.idleMinutes ?? 0) * 10) / 10
    }));
  }, [utilizationQuery.data]);

  const utilizationAxisHourly = useMemo(
    () =>
      utilizationQuery.data?.status === 200 &&
      utilizationQuery.data.data.granularity === 'hour',
    [utilizationQuery.data]
  );

  const formatUtilizationDateTick = useMemo(() => {
    return (value: string | number) =>
      formatStatisticsChartAxisLabel(value, {
        hourly: Boolean(utilizationAxisHourly),
        locale: dateLocale
      });
  }, [utilizationAxisHourly, dateLocale]);

  const formatUtilizationTooltipLabel = useMemo(() => {
    return (value: string | number) =>
      formatStatisticsTooltipLabel(value, {
        hourly: Boolean(utilizationAxisHourly),
        locale: dateLocale
      });
  }, [utilizationAxisHourly, dateLocale]);

  const hourlyStatsAxis = useMemo(() => {
    const isHour = (g: string | undefined) => g === 'hour';
    return (
      isHour(tsStatsBody?.granularity) ||
      isHour(loadStatsBody?.granularity) ||
      isHour(slaStatsBody?.granularity) ||
      isHour(surveyStatsBody?.granularity)
    );
  }, [
    tsStatsBody?.granularity,
    loadStatsBody?.granularity,
    slaStatsBody?.granularity,
    surveyStatsBody?.granularity
  ]);

  /** Same series as API (`wait`); no interpolation so empty hours stay gaps, not filled from neighbors. */
  const waitChartData = useMemo(
    () => waitData.map((d) => ({ ...d, waitDisplay: d.wait })),
    [waitData]
  );

  const formatStatsDateTick = useMemo(() => {
    return (value: string | number) =>
      formatStatisticsChartAxisLabel(value, {
        hourly: hourlyStatsAxis,
        locale: dateLocale
      });
  }, [hourlyStatsAxis, dateLocale]);

  const formatStatsTooltipLabel = useMemo(() => {
    return (label: ReactNode): ReactNode => {
      const value =
        typeof label === 'string' || typeof label === 'number'
          ? label
          : String(label ?? '');
      return formatStatisticsTooltipLabel(value, {
        hourly: hourlyStatsAxis,
        locale: dateLocale
      });
    };
  }, [hourlyStatsAxis, dateLocale]);

  const formatWaitServiceTooltipValue = useMemo(
    () => (value: unknown, name: unknown, item: unknown) => {
      const key = (item as { dataKey?: string })?.dataKey;
      const payload = (
        item as {
          payload?: {
            wait?: number | null;
            service?: number | null;
          };
        }
      )?.payload;
      if (key !== 'wait' && key !== 'waitDisplay' && key !== 'service') {
        return [value, name] as [ReactNode, ReactNode];
      }
      const minutesRaw =
        key === 'service'
          ? (payload?.service ?? value)
          : (payload?.wait ?? value);
      if (
        minutesRaw == null ||
        typeof minutesRaw !== 'number' ||
        !Number.isFinite(minutesRaw)
      ) {
        return [value, name] as [ReactNode, ReactNode];
      }
      const totalSec = Math.round(minutesRaw * 60);
      const minutesPart = Math.floor(totalSec / 60);
      const secondsPart = totalSec % 60;
      return [
        t('tooltip_duration_min_sec', {
          minutes: minutesPart,
          seconds: secondsPart
        }),
        name
      ] as [ReactNode, ReactNode];
    },
    [t]
  );

  const formatLoadTooltipValue = useMemo(
    () => (value: unknown, name: unknown, item: unknown) => {
      const key = (item as { dataKey?: string })?.dataKey;
      if (
        (key === 'created' || key === 'completed' || key === 'noShow') &&
        typeof value === 'number' &&
        Number.isFinite(value)
      ) {
        return [String(Math.round(value)), name] as [ReactNode, ReactNode];
      }
      return [value, name] as [ReactNode, ReactNode];
    },
    []
  );

  const formatSlaTooltipValue = useMemo(
    () => (value: unknown, name: unknown) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return [value, name] as [ReactNode, ReactNode];
      }
      if (slaDisplayMode === 'percent') {
        return [`${value.toFixed(1)}%`, name] as [ReactNode, ReactNode];
      }
      return [String(Math.round(value)), name] as [ReactNode, ReactNode];
    },
    [slaDisplayMode]
  );

  const formatScoreTooltipValue = useMemo(
    () => (value: unknown, name: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return [value.toFixed(2), name] as [ReactNode, ReactNode];
      }
      return [value, name] as [ReactNode, ReactNode];
    },
    []
  );

  const waitServiceChartConfig = useMemo(
    () =>
      ({
        waitDisplay: {
          label: t('legend_wait_min'),
          color: 'var(--primary)'
        },
        service: {
          label: t('legend_service_min'),
          color: 'var(--chart-2)'
        }
      }) satisfies ChartConfig,
    [t]
  );

  const loadChartConfig = useMemo(
    () =>
      ({
        created: { label: t('legend_created'), color: 'var(--primary)' },
        completed: { label: t('legend_completed'), color: 'var(--chart-2)' },
        noShow: { label: t('legend_no_show'), color: 'var(--chart-4)' }
      }) satisfies ChartConfig,
    [t]
  );

  const surveyChartConfig = useMemo(() => {
    const mode =
      surveyQuery.data?.status === 200 ? surveyQuery.data.data.mode : undefined;
    return {
      score: {
        label:
          mode === 'questions'
            ? t('legend_score_native')
            : t('legend_score_norm5'),
        color: 'var(--primary)'
      }
    } satisfies ChartConfig;
  }, [t, surveyQuery.data]);

  const slaChartConfig = useMemo(
    () =>
      ({
        within: { label: t('legend_sla_wait_within'), color: '#94a3b8' },
        breach: {
          label: t('legend_sla_wait_breach'),
          color: 'var(--destructive)'
        },
        svcPct: { label: t('legend_sla_service_pct'), color: 'var(--chart-2)' }
      }) satisfies ChartConfig,
    [t]
  );

  const utilizationChartConfig = useMemo(
    () =>
      ({
        util: {
          label: t('legend_utilization_pct'),
          color: 'var(--chart-3)'
        }
      }) satisfies ChartConfig,
    [t]
  );

  const ticketsPieSlices = useMemo(() => {
    const items =
      ticketsByServiceQuery.data?.status === 200
        ? (ticketsByServiceQuery.data.data.items ?? [])
        : [];
    return items.map((it, i) => {
      const sid = (it.serviceId ?? '').trim();
      const name = (it.serviceName ?? sid).trim() || sid || '—';
      return {
        serviceId: sid,
        name,
        value: it.count ?? 0,
        fill: `var(--chart-${(i % 5) + 1})`
      };
    });
  }, [ticketsByServiceQuery.data]);

  const ticketsPieChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    ticketsPieSlices.forEach((d, i) => {
      cfg[d.serviceId] = {
        label: d.name,
        color: `var(--chart-${(i % 5) + 1})`
      };
    });
    return cfg;
  }, [ticketsPieSlices]);

  /** Selection only from the select; null = all services (no highlighted slice). */
  const donutSelectionResolved = useMemo(() => {
    if (donutSelectedServiceId == null) return null;
    return ticketsPieSlices.some((s) => s.serviceId === donutSelectedServiceId)
      ? donutSelectedServiceId
      : null;
  }, [donutSelectedServiceId, ticketsPieSlices]);

  const donutActiveIndex = useMemo(() => {
    if (donutSelectionResolved == null || ticketsPieSlices.length === 0) {
      return undefined;
    }
    const idx = ticketsPieSlices.findIndex(
      (s) => s.serviceId === donutSelectionResolved
    );
    return idx >= 0 ? idx : undefined;
  }, [donutSelectionResolved, ticketsPieSlices]);

  const ticketsByServiceBody =
    ticketsByServiceQuery.data?.status === 200
      ? ticketsByServiceQuery.data.data
      : undefined;
  const ticketsDonutTotal = ticketsByServiceBody?.total ?? 0;

  const ticketsDonutCenterValue = useMemo(() => {
    if (donutSelectionResolved == null) return ticketsDonutTotal;
    const row = ticketsPieSlices.find(
      (s) => s.serviceId === donutSelectionResolved
    );
    return row?.value ?? 0;
  }, [donutSelectionResolved, ticketsDonutTotal, ticketsPieSlices]);

  const donutComboboxOptions = useMemo((): ComboboxOption[] => {
    const allLabel = t('chart_sla_radial_all_services');
    return [
      {
        value: '__all__',
        label: allLabel,
        keywords: [allLabel, 'all', '__all__']
      },
      ...ticketsPieSlices.map((s) => ({
        value: s.serviceId,
        label: s.name,
        keywords: [s.serviceId, s.name],
        swatchColor: s.fill
      }))
    ];
  }, [ticketsPieSlices, t]);

  const slaSummaryBody =
    slaSummaryQuery.data?.status === 200
      ? slaSummaryQuery.data.data
      : undefined;

  const radialSlaRow = useMemo(() => {
    const d = slaSummaryBody;
    const met = d?.slaWaitMet ?? 0;
    const tot = d?.slaWaitTotal ?? 0;
    const within = d?.withinPct ?? 0;
    const breach = d?.breachPct ?? 0;
    return {
      key: 'sla',
      within: tot > 0 ? Math.round(within * 10) / 10 : 0,
      breach: tot > 0 ? Math.round(breach * 10) / 10 : 0,
      withinPct: within,
      tot,
      met
    };
  }, [slaSummaryBody]);

  /** Semi-circle gauge as Pie slices (within first from startAngle) — avoids Recharts 3 stacked RadialBar angle mismatch. */
  const slaGaugePieData = useMemo(
    () => [
      {
        seriesId: 'within' as const,
        name: t('legend_sla_within'),
        value: radialSlaRow.within,
        fill: 'var(--color-within)'
      },
      {
        seriesId: 'breach' as const,
        name: t('legend_sla_breach'),
        value: radialSlaRow.breach,
        fill: 'var(--color-breach)'
      }
    ],
    [radialSlaRow.breach, radialSlaRow.within, t]
  );

  const radialSlaChartConfig = useMemo(
    () =>
      ({
        within: {
          label: t('legend_sla_within'),
          color: '#94a3b8'
        },
        breach: {
          label: t('legend_sla_breach'),
          color: 'var(--destructive)'
        }
      }) satisfies ChartConfig,
    [t]
  );

  const slaRadialServiceOptions = useMemo(() => {
    const tree =
      servicesListQuery.data?.status === 200 ? servicesListQuery.data.data : [];
    const leaves = flattenLeafServices(tree);
    const opts: { id: string; name: string }[] = [
      { id: '__all__', name: t('chart_sla_radial_all_services') }
    ];
    const seen = new Set<string>();
    for (const s of leaves) {
      const id = (s.id ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      opts.push({ id, name: (s.name ?? id).trim() || id });
    }
    return opts;
  }, [servicesListQuery.data, t]);

  const slaComboboxOptions = useMemo(
    (): ComboboxOption[] =>
      slaRadialServiceOptions.map((o) => ({
        value: o.id,
        label: o.name,
        keywords: [o.id, o.name]
      })),
    [slaRadialServiceOptions]
  );

  const computedAt =
    tsStatsBody?.computedAt ??
    slaStatsBody?.computedAt ??
    loadStatsBody?.computedAt;

  const handleExportCSV = () => {
    const exportData: StatisticsExportData = {
      timeseries: tsStatsBody,
      load: loadStatsBody,
      slaDeviations: slaStatsBody,
      slaSummary: slaSummaryBody,
      ticketsByService: ticketsByServiceBody,
      surveyScores: canSurveyScores ? surveyStatsBody : null,
      utilization:
        isExpanded && utilizationQuery.data?.status === 200
          ? utilizationQuery.data.data
          : null
    };

    const subdivisionUnit = unitById.get(statsSubdivisionId);
    const subdivisionLabel = subdivisionUnit
      ? getUnitDisplayName(subdivisionUnit, appLocale)
      : undefined;

    const zoneUnit = serviceZoneParam
      ? zoneOptions.find((z) => z.id === serviceZoneParam)
      : undefined;
    const zoneLabel = zoneUnit
      ? getUnitDisplayName(zoneUnit, appLocale)
      : undefined;

    const operatorLabel = filterUserId
      ? operatorComboboxOptions.find((o) => o.value === filterUserId)?.label
      : undefined;

    const filters: StatisticsExportFilters = {
      dateFrom: from,
      dateTo: dateToForApi,
      subdivisionName: subdivisionLabel,
      zoneName: zoneLabel,
      operatorName: operatorLabel
    };

    downloadStatisticsCSV(exportData, filters, t, subdivisionLabel);
  };

  const [pdfExporting, setPdfExporting] = useState(false);

  const handleExportPDF = async () => {
    if (!statsSubdivisionId || pdfExporting) return;
    setPdfExporting(true);
    try {
      const { blob, contentDisposition } =
        await statisticsExportApi.downloadPDF(statsSubdivisionId, {
          dateFrom: from,
          dateTo: dateToForApi,
          userId: userIdParam,
          serviceZoneId: serviceZoneParam || undefined
        });
      const fromHeader =
        parseFilenameFromContentDisposition(contentDisposition);
      const filename = fromHeader ?? `statistics_${from}_${dateToForApi}.pdf`;
      triggerBlobDownload(blob, filename);
    } catch (error) {
      logger.error('Statistics PDF export failed', error);
      toast.error(t('export_pdf_error'));
    } finally {
      setPdfExporting(false);
    }
  };

  const hasAnyExportData =
    Boolean(tsStatsBody?.points?.length) ||
    Boolean(loadStatsBody?.points?.length) ||
    Boolean(slaStatsBody?.points?.length) ||
    Boolean(ticketsByServiceBody?.items?.length) ||
    Boolean(surveyStatsBody?.points?.length) ||
    Boolean(slaSummaryBody?.slaWaitTotal) ||
    (utilizationQuery.data?.status === 200 &&
      Boolean(utilizationQuery.data.data?.points?.length));

  const showZoneFilter = zoneOptions.length > 0;
  const showSubdivisionFilter = subdivisionOptions.length > 0;

  return (
    <div className='container mx-auto flex-1 space-y-6 p-4'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('title')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{t('subtitle')}</p>
          {computedAt && (
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('as_of', {
                time: formatStatisticsAsOfLine(computedAt, dateLocale)
              })}
            </p>
          )}
        </div>
        {statsSubdivisionId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm' disabled={!hasAnyExportData}>
                <Download className='mr-2 h-4 w-4' />
                {t('export_button')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileSpreadsheet className='mr-2 h-4 w-4' />
                {t('export_csv')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportPDF}
                disabled={pdfExporting}
              >
                <FileText className='mr-2 h-4 w-4' />
                {t('export_pdf')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!activeUnitId ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('no_unit_title')}</CardTitle>
            <CardDescription>{t('no_unit_hint')}</CardDescription>
          </CardHeader>
        </Card>
      ) : unitQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('error')}</CardTitle>
            <CardDescription>{t('no_unit_hint')}</CardDescription>
          </CardHeader>
        </Card>
      ) : statsResolutionBlocked ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('unit_parent_missing_title')}</CardTitle>
            <CardDescription>{t('unit_parent_missing_hint')}</CardDescription>
          </CardHeader>
        </Card>
      ) : !statsSubdivisionId ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('loading')}</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className='flex w-full justify-end'>
            <div className='inline-flex max-w-full flex-wrap items-end gap-4'>
              <div className='shrink-0 space-y-2'>
                <Label>{t('filter_date')}</Label>
                <DatePickerSingleOrRange
                  from={from}
                  to={to}
                  onRangeChange={(nextFrom, nextTo) =>
                    setRange({ from: nextFrom, to: nextTo })
                  }
                  labels={{
                    openCalendar: t('open_calendar'),
                    rangeAwaitingEnd: t('date_range_awaiting_end')
                  }}
                  className='w-[280px] max-w-full'
                />
              </div>
              {showSubdivisionFilter && (
                <div className='w-fit max-w-full shrink-0 space-y-2'>
                  <Label>{t('filter_subdivision')}</Label>
                  <Select
                    value={statsSubdivisionId}
                    onValueChange={(id) => setManualSubdivisionId(id)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('subdivision_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {subdivisionOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showZoneFilter && (
                <div className='w-fit max-w-full shrink-0 space-y-2'>
                  <Label>{t('filter_zone')}</Label>
                  <Select
                    value={serviceZoneParam ? serviceZoneParam : '__all__'}
                    onValueChange={(v) =>
                      setServiceZoneId(v === '__all__' ? '' : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__all__'>{t('zone_all')}</SelectItem>
                      {zoneOptions
                        .filter((z): z is typeof z & { id: string } =>
                          Boolean(z.id?.trim())
                        )
                        .map((z) => (
                          <SelectItem key={z.id} value={z.id}>
                            {getUnitDisplayName(z, appLocale)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isExpanded && (
                <div className='w-fit max-w-full shrink-0 space-y-2'>
                  <Label htmlFor='operator-combobox'>{t('filter_user')}</Label>
                  <Combobox
                    options={operatorComboboxOptions}
                    value={filterUserId}
                    onChange={setFilterUserId}
                    placeholder={t('filter_user_all')}
                    searchPlaceholder={t('filter_user_placeholder')}
                    emptyText={t('filter_operator_empty')}
                    disabled={actorsQuery.isLoading}
                    id='operator-combobox'
                  />
                </div>
              )}
            </div>
          </div>

          <div className='grid gap-6 lg:grid-cols-2'>
            <Card>
              <CardHeader className='flex flex-row flex-nowrap items-center justify-between gap-4 space-y-0'>
                <div className='min-w-0 flex-1 space-y-1 pr-2'>
                  <CardTitle>{t('chart_tickets_by_service')}</CardTitle>
                  <CardDescription>
                    {t('chart_tickets_by_service_hint')}
                  </CardDescription>
                </div>
                {ticketsPieSlices.length > 0 ? (
                  <div className='shrink-0'>
                    <Combobox
                      options={donutComboboxOptions}
                      value={donutSelectionResolved ?? '__all__'}
                      onChange={(v) =>
                        setDonutSelectedServiceId(
                          v === '__all__' || v === '' ? null : v
                        )
                      }
                      placeholder={t('chart_sla_radial_all_services')}
                      searchPlaceholder={t('chart_service_combobox_search')}
                      emptyText={t('chart_service_combobox_empty')}
                      className='w-[min(240px,calc(100vw-2.5rem))]'
                      allowClear={false}
                      popoverAlign='end'
                    />
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className='flex flex-col items-center pb-0'>
                {ticketsByServiceQuery.isLoading ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('loading')}
                  </p>
                ) : ticketsByServiceQuery.isError ? (
                  <p className='text-destructive text-sm'>{t('error')}</p>
                ) : ticketsPieSlices.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('chart_tickets_by_service_empty')}
                  </p>
                ) : (
                  <div className='relative mx-auto aspect-square w-full max-w-[280px]'>
                    <ChartContainer
                      config={ticketsPieChartConfig}
                      className='h-full w-full'
                    >
                      <PieChart>
                        <ChartTooltip
                          content={(props) => (
                            <TicketsByServiceChartTooltip
                              {...props}
                              locale={appLocale}
                            />
                          )}
                        />
                        <PieWithSectorShape
                          data={ticketsPieSlices}
                          dataKey='value'
                          nameKey='name'
                          innerRadius='58%'
                          outerRadius='78%'
                          strokeWidth={2}
                          cursor='default'
                          shape={(sectorProps: StatisticsPieSectorProps) => {
                            const highlighted =
                              donutActiveIndex !== undefined &&
                              sectorProps.index === donutActiveIndex;
                            if (highlighted || sectorProps.isActive) {
                              return (
                                <StatisticsDonutActiveShape {...sectorProps} />
                              );
                            }
                            const {
                              cx,
                              cy,
                              innerRadius,
                              outerRadius,
                              startAngle,
                              endAngle,
                              fill,
                              cornerRadius
                            } = sectorProps;
                            return (
                              <Sector
                                cx={cx}
                                cy={cy}
                                innerRadius={innerRadius}
                                outerRadius={outerRadius}
                                startAngle={startAngle}
                                endAngle={endAngle}
                                fill={fill}
                                cornerRadius={cornerRadius}
                                className='stroke-background'
                                strokeWidth={2}
                              />
                            );
                          }}
                        >
                          {ticketsPieSlices.map((s) => (
                            <Cell key={s.serviceId} fill={s.fill} />
                          ))}
                        </PieWithSectorShape>
                      </PieChart>
                    </ChartContainer>
                    <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
                      <span className='text-3xl font-bold tabular-nums'>
                        {ticketsDonutCenterValue.toLocaleString(appLocale)}
                      </span>
                      <span className='text-muted-foreground mt-1 max-w-[10rem] text-center text-xs'>
                        {t('chart_tickets_by_service_center')}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row flex-nowrap items-center justify-between gap-4 space-y-0'>
                <div className='min-w-0 flex-1 space-y-1 pr-2'>
                  <CardTitle>{t('chart_sla_radial')}</CardTitle>
                  <CardDescription>
                    {t('chart_sla_radial_hint')}
                  </CardDescription>
                </div>
                <div className='shrink-0'>
                  <Combobox
                    options={slaComboboxOptions}
                    value={
                      slaSummaryServiceId.trim()
                        ? slaSummaryServiceId
                        : '__all__'
                    }
                    onChange={(v) =>
                      setSlaSummaryServiceId(
                        v === '__all__' || v === '' ? '' : v
                      )
                    }
                    placeholder={t('chart_sla_radial_all_services')}
                    searchPlaceholder={t('chart_service_combobox_search')}
                    emptyText={t('chart_service_combobox_empty')}
                    className='w-[min(240px,calc(100vw-2.5rem))]'
                    allowClear={false}
                    popoverAlign='end'
                  />
                </div>
              </CardHeader>
              <CardContent className='flex flex-col items-center pb-0'>
                {slaSummaryQuery.isLoading ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('loading')}
                  </p>
                ) : slaSummaryQuery.isError ? (
                  <p className='text-destructive text-sm'>{t('error')}</p>
                ) : radialSlaRow.tot <= 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('chart_sla_radial_empty')}
                  </p>
                ) : (
                  <div className='relative mx-auto aspect-square w-full max-w-[320px]'>
                    <ChartContainer
                      config={radialSlaChartConfig}
                      className='h-full w-full'
                    >
                      <PieChart
                        margin={{ top: 20, right: 0, bottom: 12, left: 0 }}
                      >
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              hideLabel
                              formatter={(value, _name, item) => {
                                const seriesId = (
                                  item?.payload as {
                                    seriesId?: string;
                                  }
                                )?.seriesId;
                                const actualPct =
                                  seriesId === 'within'
                                    ? radialSlaRow.within
                                    : seriesId === 'breach'
                                      ? radialSlaRow.breach
                                      : typeof value === 'number'
                                        ? value
                                        : 0;
                                return `${actualPct.toLocaleString(appLocale, {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1
                                })}%`;
                              }}
                            />
                          }
                        />
                        <Pie
                          data={slaGaugePieData}
                          dataKey='value'
                          nameKey='name'
                          startAngle={180}
                          endAngle={0}
                          innerRadius='62%'
                          outerRadius='88%'
                          stroke='transparent'
                          strokeWidth={0}
                          isAnimationActive={false}
                        >
                          {slaGaugePieData.map((row) => (
                            <Cell key={row.seriesId} fill={row.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
                      <span className='text-3xl font-bold tabular-nums'>
                        {`${radialSlaRow.withinPct.toLocaleString(appLocale, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1
                        })}%`}
                      </span>
                      <span className='text-muted-foreground mt-1 max-w-[12rem] text-center text-sm'>
                        {t('chart_sla_radial_center')}
                      </span>
                    </div>
                  </div>
                )}
                {/* Service-time SLA summary — from the same GetSlaSummary query (respects service filter) */}
                {!slaSummaryQuery.isLoading && !slaSummaryQuery.isError && (
                  <div className='border-border mt-4 w-full border-t pt-3'>
                    <p className='text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase'>
                      {t('sla_service_summary_label')}
                    </p>
                    {(() => {
                      const svcTot = slaSummaryBody?.slaServiceTotal ?? 0;
                      const svcMet = slaSummaryBody?.slaServiceMet ?? 0;
                      const svcPct =
                        svcTot > 0
                          ? ((100 * svcMet) / svcTot).toLocaleString(
                              appLocale,
                              {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1
                              }
                            )
                          : null;
                      return svcTot > 0 ? (
                        <p className='text-foreground text-sm font-medium'>
                          {t('sla_service_met_of_total', {
                            met: svcMet,
                            total: svcTot,
                            pct: svcPct ?? '—'
                          })}
                        </p>
                      ) : (
                        <p className='text-muted-foreground text-sm'>
                          {t('sla_service_no_data')}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-6 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('chart_wait_service')}</CardTitle>
                <CardDescription>
                  {t('chart_wait_service_hint')}
                </CardDescription>
              </CardHeader>
              <CardContent className='h-[320px]'>
                {tsQuery.isLoading ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('loading')}
                  </p>
                ) : tsQuery.isError ? (
                  <p className='text-destructive text-sm'>{t('error')}</p>
                ) : (
                  <ChartContainer
                    config={waitServiceChartConfig}
                    className='h-full w-full'
                  >
                    {hourlyStatsAxis ? (
                      <ComposedChart data={waitChartData}>
                        <defs>
                          <linearGradient
                            id='waitFillHourly'
                            x1='0'
                            y1='0'
                            x2='0'
                            y2='1'
                          >
                            <stop
                              offset='0%'
                              stopColor='var(--color-waitDisplay)'
                              stopOpacity={0.4}
                            />
                            <stop
                              offset='100%'
                              stopColor='var(--color-waitDisplay)'
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray='3 3'
                          className='stroke-muted'
                        />
                        <XAxis
                          dataKey='date'
                          tick={{ fontSize: 11 }}
                          tickFormatter={formatStatsDateTick}
                          interval={1}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          formatter={formatWaitServiceTooltipValue}
                          labelFormatter={formatStatsTooltipLabel}
                        />
                        <Area
                          type='monotone'
                          dataKey='waitDisplay'
                          name={t('legend_wait_min')}
                          stroke='var(--color-waitDisplay)'
                          fill='url(#waitFillHourly)'
                          strokeWidth={2}
                          connectNulls={false}
                          baseValue={0}
                          isAnimationActive={false}
                        />
                        <Line
                          type='monotone'
                          dataKey='service'
                          name={t('legend_service_min')}
                          stroke='var(--color-service)'
                          strokeWidth={2}
                          dot={false}
                          connectNulls={false}
                        />
                      </ComposedChart>
                    ) : (
                      <AreaChart data={waitChartData}>
                        <defs>
                          <linearGradient
                            id='waitFill'
                            x1='0'
                            y1='0'
                            x2='0'
                            y2='1'
                          >
                            <stop
                              offset='0%'
                              stopColor='var(--color-waitDisplay)'
                              stopOpacity={0.35}
                            />
                            <stop
                              offset='100%'
                              stopColor='var(--color-waitDisplay)'
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray='3 3'
                          className='stroke-muted'
                        />
                        <XAxis
                          dataKey='date'
                          tick={{ fontSize: 11 }}
                          tickFormatter={formatStatsDateTick}
                          interval={0}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          formatter={formatWaitServiceTooltipValue}
                          labelFormatter={formatStatsTooltipLabel}
                        />
                        <Area
                          type='monotone'
                          dataKey='waitDisplay'
                          name={t('legend_wait_min')}
                          stroke='var(--color-waitDisplay)'
                          fill='url(#waitFill)'
                          strokeWidth={2}
                          connectNulls={false}
                          baseValue={0}
                        />
                        <Area
                          type='monotone'
                          dataKey='service'
                          name={t('legend_service_min')}
                          stroke='var(--color-service)'
                          fill='none'
                          strokeWidth={2}
                          connectNulls={false}
                          baseValue={0}
                        />
                      </AreaChart>
                    )}
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('chart_volume')}</CardTitle>
                <CardDescription>{t('chart_load_hint')}</CardDescription>
              </CardHeader>
              <CardContent className='h-[320px]'>
                {loadQuery.isLoading ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('loading')}
                  </p>
                ) : loadQuery.isError ? (
                  <p className='text-destructive text-sm'>{t('error')}</p>
                ) : (
                  <ChartContainer
                    config={loadChartConfig}
                    className='h-full w-full'
                  >
                    <BarChart data={loadData}>
                      <CartesianGrid
                        strokeDasharray='3 3'
                        className='stroke-muted'
                      />
                      <XAxis
                        dataKey='date'
                        tick={{ fontSize: 11 }}
                        tickFormatter={formatStatsDateTick}
                        interval={hourlyStatsAxis ? 1 : 0}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={formatLoadTooltipValue}
                        labelFormatter={formatStatsTooltipLabel}
                      />
                      <Legend />
                      <Bar
                        dataKey='created'
                        name={t('legend_created')}
                        fill='var(--color-created)'
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey='completed'
                        name={t('legend_completed')}
                        fill='var(--color-completed)'
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey='noShow'
                        name={t('legend_no_show')}
                        fill='var(--color-noShow)'
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {canSurveyScores && (
              <Card className='lg:col-span-2'>
                <CardHeader>
                  <CardTitle>{t('chart_survey')}</CardTitle>
                  <CardDescription>{t('chart_survey_hint')}</CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {surveyDefinitions.length > 0 && (
                    <div className='flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:items-end'>
                      <div className='min-w-0 flex-1 space-y-2'>
                        <Label>{t('filter_survey')}</Label>
                        <Select
                          value={surveyDefinitionId || '__all__'}
                          onValueChange={(v) => {
                            setSurveyDefinitionId(v === '__all__' ? '' : v);
                            setSurveyQuestionId('');
                          }}
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='__all__'>
                              {t('survey_filter_all')}
                            </SelectItem>
                            {surveyDefinitions
                              .filter((d) => Boolean(d.id?.trim()))
                              .map((d) => (
                                <SelectItem key={d.id} value={d.id!}>
                                  {d.title ?? d.id}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {surveyDefinitionId.trim() &&
                        numericQuestionsForSelectedSurvey.length > 0 && (
                          <div className='min-w-0 flex-1 space-y-2'>
                            <Label>{t('filter_survey_question')}</Label>
                            <Select
                              value={surveyQuestionId || '__all__'}
                              onValueChange={(v) =>
                                setSurveyQuestionId(v === '__all__' ? '' : v)
                              }
                            >
                              <SelectTrigger className='w-full'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='__all__'>
                                  {t('survey_question_all')}
                                </SelectItem>
                                {numericQuestionsForSelectedSurvey.map((q) => (
                                  <SelectItem key={q.id} value={q.id}>
                                    {q.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                    </div>
                  )}
                  <div className='h-[280px]'>
                    {surveyQuery.isLoading ? (
                      <p className='text-muted-foreground text-sm'>
                        {t('loading')}
                      </p>
                    ) : surveyQuery.isError ? (
                      <p className='text-destructive text-sm'>{t('error')}</p>
                    ) : (
                      <ChartContainer
                        config={surveyChartConfig}
                        className='h-full w-full'
                      >
                        <LineChart data={surveyChartData}>
                          <CartesianGrid
                            strokeDasharray='3 3'
                            className='stroke-muted'
                          />
                          <XAxis
                            dataKey='date'
                            tick={{ fontSize: 11 }}
                            tickFormatter={formatStatsDateTick}
                            interval={hourlyStatsAxis ? 1 : 0}
                          />
                          <YAxis
                            domain={surveyScoreYDomain}
                            tick={{ fontSize: 11 }}
                          />
                          <ChartTooltip
                            content={<ChartTooltipContent />}
                            formatter={formatScoreTooltipValue}
                            labelFormatter={formatStatsTooltipLabel}
                          />
                          <Legend />
                          <Line
                            type='monotone'
                            dataKey='score'
                            name={
                              surveyStatsBody?.mode === 'questions'
                                ? t('legend_score_native')
                                : t('legend_score_norm5')
                            }
                            stroke='var(--color-score)'
                            strokeWidth={2}
                            dot={false}
                            connectNulls={false}
                          />
                        </LineChart>
                      </ChartContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className='gap-0 overflow-hidden pt-0 pb-6 lg:col-span-2'>
              <CardHeader className='gap-0 border-b p-0 !pb-0'>
                <div className='grid w-full min-w-0 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch'>
                  <div className='flex min-w-0 flex-col justify-start gap-1.5 px-6 py-5'>
                    <CardTitle>{t('chart_sla_deviations')}</CardTitle>
                    <CardDescription>
                      {t('chart_sla_deviations_hint')}
                    </CardDescription>
                  </div>
                  {!(slaQuery.isLoading || slaQuery.isError) && (
                    <div
                      className={cn(
                        'border-border flex min-h-0 w-full min-w-0 items-stretch border-t',
                        'sm:h-full sm:max-w-md sm:shrink-0 sm:border-t-0 sm:border-l'
                      )}
                    >
                      <button
                        type='button'
                        onClick={() => setSlaDisplayMode('count')}
                        className={cn(
                          'border-border flex min-h-0 flex-1 flex-col justify-center gap-0.5 border-r px-4 py-0 text-left transition-colors sm:h-full sm:min-h-0 sm:px-6 sm:py-0',
                          slaDisplayMode === 'count'
                            ? 'bg-muted/60'
                            : 'hover:bg-muted/40'
                        )}
                      >
                        <span className='text-muted-foreground text-xs font-medium'>
                          {t('sla_mode_count')}
                        </span>
                        <span className='text-2xl leading-none font-bold tabular-nums'>
                          {slaChart.sumTot.toLocaleString(appLocale)}
                        </span>
                      </button>
                      <button
                        type='button'
                        onClick={() => setSlaDisplayMode('percent')}
                        className={cn(
                          'flex min-h-0 flex-1 flex-col justify-center gap-0.5 px-4 py-0 text-left transition-colors sm:h-full sm:min-h-0 sm:px-6 sm:py-0',
                          slaDisplayMode === 'percent'
                            ? 'bg-muted/60'
                            : 'hover:bg-muted/40'
                        )}
                      >
                        <span className='text-muted-foreground text-xs font-medium'>
                          {t('sla_mode_percent')}
                        </span>
                        <span className='text-2xl leading-none font-bold tabular-nums'>
                          {slaChart.overallPct.toFixed(1)}%
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>
              {/* Multi-day: heatmap toggle */}
              {slaHeatmapEnabled &&
                !(slaQuery.isLoading || slaQuery.isError) && (
                  <div className='border-border flex gap-0 border-b'>
                    <button
                      type='button'
                      onClick={() => setSlaHeatmapType('wait')}
                      className={cn(
                        'border-border flex-1 border-r px-4 py-2.5 text-center text-sm font-medium transition-colors',
                        slaHeatmapType === 'wait'
                          ? 'bg-muted/60'
                          : 'hover:bg-muted/40'
                      )}
                    >
                      {t('sla_heatmap_toggle_wait')}
                    </button>
                    <button
                      type='button'
                      onClick={() => setSlaHeatmapType('service')}
                      className={cn(
                        'flex-1 px-4 py-2.5 text-center text-sm font-medium transition-colors',
                        slaHeatmapType === 'service'
                          ? 'bg-muted/60'
                          : 'hover:bg-muted/40'
                      )}
                    >
                      {t('sla_heatmap_toggle_service')}
                    </button>
                  </div>
                )}
              <CardContent className={slaHeatmapEnabled ? 'py-4' : 'h-[320px]'}>
                {slaQuery.isLoading ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('loading')}
                  </p>
                ) : slaQuery.isError ? (
                  <p className='text-destructive text-sm'>{t('error')}</p>
                ) : slaHeatmapEnabled ? (
                  /* Multi-day view → heatmap */
                  slaHeatmapQuery.isLoading ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('loading')}
                    </p>
                  ) : slaHeatmapQuery.isError ? (
                    <p className='text-destructive text-sm'>{t('error')}</p>
                  ) : !slaHeatmapBody?.cells?.length ? (
                    <p className='text-muted-foreground text-sm'>
                      {slaHeatmapType === 'service'
                        ? t('sla_heatmap_no_service_limit')
                        : t('sla_heatmap_no_data')}
                    </p>
                  ) : (
                    <SLAHeatmapChart
                      cells={slaHeatmapBody.cells}
                      dateFrom={from}
                      dateTo={dateToForApi}
                    />
                  )
                ) : (
                  /* Single-day view → existing bar chart */
                  <ChartContainer
                    config={slaChartConfig}
                    className='h-full w-full'
                  >
                    <ComposedChart data={slaChart.data}>
                      <CartesianGrid
                        strokeDasharray='3 3'
                        className='stroke-muted'
                      />
                      <XAxis
                        dataKey='date'
                        tick={{ fontSize: 11 }}
                        tickFormatter={formatStatsDateTick}
                        interval={hourlyStatsAxis ? 1 : 0}
                      />
                      <YAxis
                        domain={slaChart.yDomain}
                        tick={{ fontSize: 11 }}
                        allowDecimals={slaDisplayMode === 'percent'}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            footer={
                              slaDisplayMode === 'count'
                                ? ({ payload: tipPayload }) => {
                                    const tipRow = tipPayload?.[0]?.payload as
                                      | {
                                          within?: number;
                                          breach?: number;
                                        }
                                      | undefined;
                                    if (!tipRow) return null;
                                    const total = Math.round(
                                      (Number(tipRow.within) || 0) +
                                        (Number(tipRow.breach) || 0)
                                    );
                                    return (
                                      <div className='flex w-full justify-between gap-4 leading-none'>
                                        <span className='text-muted-foreground'>
                                          {t('tooltip_total')}
                                        </span>
                                        <span className='text-foreground font-mono font-medium tabular-nums'>
                                          {total}
                                        </span>
                                      </div>
                                    );
                                  }
                                : undefined
                            }
                          />
                        }
                        formatter={formatSlaTooltipValue}
                        labelFormatter={formatStatsTooltipLabel}
                      />
                      <Legend />
                      <Bar
                        dataKey='within'
                        name={
                          slaDisplayMode === 'percent'
                            ? `${t('legend_sla_wait_within')}, %`
                            : t('legend_sla_wait_within')
                        }
                        stackId='sla'
                        fill='#94a3b8'
                      />
                      <Bar
                        dataKey='breach'
                        name={
                          slaDisplayMode === 'percent'
                            ? `${t('legend_sla_wait_breach')}, %`
                            : t('legend_sla_wait_breach')
                        }
                        stackId='sla'
                        fill='var(--color-breach)'
                      />
                      {slaDisplayMode === 'percent' &&
                        slaChart.sumSvcTot > 0 && (
                          <Line
                            dataKey='svcPct'
                            name={t('legend_sla_service_pct')}
                            type='monotone'
                            stroke='var(--color-svcPct)'
                            strokeWidth={2}
                            dot={false}
                            connectNulls={false}
                          />
                        )}
                    </ComposedChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {isExpanded && (
              <Card className='lg:col-span-2'>
                <CardHeader>
                  <CardTitle>{t('chart_utilization')}</CardTitle>
                  <CardDescription>
                    {t('chart_utilization_hint')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='h-[300px]'>
                  {utilizationQuery.isLoading ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('loading')}
                    </p>
                  ) : utilizationQuery.isError ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('utilization_unavailable')}
                    </p>
                  ) : (
                    <ChartContainer
                      config={utilizationChartConfig}
                      className='h-full w-full'
                    >
                      <LineChart data={utilChartData}>
                        <CartesianGrid
                          strokeDasharray='3 3'
                          className='stroke-muted'
                        />
                        <XAxis
                          dataKey='date'
                          tick={{ fontSize: 11 }}
                          tickFormatter={formatUtilizationDateTick}
                          interval={utilizationAxisHourly ? 1 : 0}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(v) =>
                                formatUtilizationTooltipLabel(v)
                              }
                              formatter={(value) => {
                                if (
                                  typeof value === 'number' &&
                                  Number.isFinite(value)
                                ) {
                                  return `${value}%`;
                                }
                                return '—';
                              }}
                              footer={({ payload: tipPayload }) => {
                                const row = tipPayload?.[0]?.payload as
                                  | {
                                      servingMin?: number;
                                      idleMin?: number;
                                    }
                                  | undefined;
                                if (!row) return null;
                                const fmtMin = (n: number | undefined) =>
                                  n != null && Number.isFinite(n)
                                    ? `${n} ${t('minutes_short')}`
                                    : '—';
                                return (
                                  <div className='grid gap-1.5'>
                                    <div className='flex w-full justify-between gap-4'>
                                      <span className='text-muted-foreground'>
                                        {t('utilization_metric_serving')}
                                      </span>
                                      <span className='text-foreground font-mono font-medium tabular-nums'>
                                        {fmtMin(row.servingMin)}
                                      </span>
                                    </div>
                                    <div className='flex w-full justify-between gap-4'>
                                      <span className='text-muted-foreground'>
                                        {t('utilization_metric_idle')}
                                      </span>
                                      <span className='text-foreground font-mono font-medium tabular-nums'>
                                        {fmtMin(row.idleMin)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type='monotone'
                          dataKey='util'
                          name={t('legend_utilization_pct')}
                          stroke='var(--color-util)'
                          strokeWidth={2}
                          dot={false}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Staff Performance section (expanded scope only) */}
          {isExpanded && (
            <div className='space-y-6 pt-2'>
              <Card className='lg:col-span-3'>
                <CardHeader>
                  <CardTitle>{t('staff_performance_title')}</CardTitle>
                  <CardDescription>
                    {t('staff_performance_hint')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {staffPerformanceListQuery.isLoading ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('loading')}
                    </p>
                  ) : staffPerformanceListQuery.isError ? (
                    <p className='text-destructive text-sm'>{t('error')}</p>
                  ) : (
                    <StaffLeaderboard
                      items={
                        staffPerformanceListQuery.data?.status === 200
                          ? (staffPerformanceListQuery.data.data.items ?? [])
                          : []
                      }
                      selectedUserId={staffSelectedUserId}
                      onSelectUser={(uid) =>
                        setStaffSelectedUserId((prev) =>
                          prev === uid ? '' : uid
                        )
                      }
                      sortBy={staffSortBy}
                      onSortChange={setStaffSortBy}
                    />
                  )}
                </CardContent>
              </Card>

              {staffSelectedUserId && (
                <div>
                  {staffDetailQuery.isLoading ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('loading')}
                    </p>
                  ) : staffDetailQuery.isError ? (
                    <p className='text-destructive text-sm'>{t('error')}</p>
                  ) : staffDetailQuery.data?.status === 200 ? (
                    <StaffOperatorDetailCard
                      data={staffDetailQuery.data.data}
                    />
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Staffing Forecast section (expanded scope only) */}
          {isExpanded && (
            <div className='pt-2'>
              <Card className='lg:col-span-3'>
                <CardHeader>
                  <CardTitle>{t('staffing_forecast_title')}</CardTitle>
                  <CardDescription>
                    {t('staffing_forecast_hint')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {staffingForecastQuery.isLoading ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('loading')}
                    </p>
                  ) : staffingForecastQuery.isError ? (
                    isApiHttpError(staffingForecastQuery.error) &&
                    staffingForecastQuery.error.status === 422 ? (
                      <p className='text-muted-foreground text-sm'>
                        {t('sf_no_data')}
                      </p>
                    ) : (
                      <p className='text-destructive text-sm'>{t('error')}</p>
                    )
                  ) : staffingForecastQuery.data?.status === 200 ? (
                    <StaffingForecastPanel
                      data={staffingForecastQuery.data.data}
                      targetDate={forecastTargetDate}
                      targetSlaPct={forecastSlaPct}
                      targetMaxWaitMin={forecastMaxWait}
                      onParamsChange={(p) => {
                        if (p.targetDate) setForecastTargetDate(p.targetDate);
                        if (p.targetSlaPct != null)
                          setForecastSlaPct(p.targetSlaPct);
                        if (p.targetMaxWaitMin != null)
                          setForecastMaxWait(p.targetMaxWaitMin);
                      }}
                    />
                  ) : (
                    <p className='text-muted-foreground text-sm'>
                      {t('sf_no_data')}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className='mt-4 lg:col-span-3'>
                <CardHeader>
                  <CardTitle>{t('anomaly_signals_title')}</CardTitle>
                  <CardDescription>{t('anomaly_signals_body')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {anomalyAlertsQuery.isLoading ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('loading')}
                    </p>
                  ) : anomalyAlertsQuery.isError ? (
                    <p className='text-destructive text-sm'>{t('error')}</p>
                  ) : anomalyAlertsQuery.data?.status === 200 ? (
                    <ul className='max-h-64 space-y-3 overflow-y-auto text-sm'>
                      {(anomalyAlertsQuery.data.data.items ?? []).length ===
                      0 ? (
                        <li className='text-muted-foreground'>
                          {t('anomaly_signals_empty')}
                        </li>
                      ) : (
                        (anomalyAlertsQuery.data.data.items ?? []).map(
                          (row) => (
                            <li
                              key={row.id ?? `${row.kind}-${row.createdAt}`}
                              className='border-border border-b pb-2 last:border-0'
                            >
                              <p className='text-muted-foreground text-xs'>
                                {row.createdAt
                                  ? formatStatisticsTooltipLabel(
                                      row.createdAt,
                                      {
                                        hourly: true,
                                        locale: dateLocale
                                      }
                                    )
                                  : '—'}
                                {row.kind ? ` · ${row.kind}` : ''}
                              </p>
                              <p className='text-foreground mt-0.5'>
                                {row.message}
                              </p>
                            </li>
                          )
                        )
                      )}
                    </ul>
                  ) : (
                    <p className='text-muted-foreground text-sm'>
                      {t('anomaly_signals_unavailable')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
