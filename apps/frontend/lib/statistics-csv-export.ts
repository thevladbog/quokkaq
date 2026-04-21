import { triggerBlobDownload } from '@/lib/download-blob';

type TimeseriesPoint = {
  date?: string;
  avgWaitMinutes?: number | null;
  avgServiceMinutes?: number | null;
  ticketsCreated?: number;
  ticketsCompleted?: number;
  noShowCount?: number;
  slaWaitMetPct?: number | null;
  slaServiceMetPct?: number | null;
};

type LoadPoint = {
  date?: string;
  ticketsCreated?: number;
  ticketsCompleted?: number;
  noShowCount?: number;
};

type SlaDeviationsPoint = {
  date?: string;
  withinPct?: number | null;
  breachPct?: number | null;
  slaWaitMet?: number;
  slaWaitTotal?: number;
  slaServiceMet?: number;
  slaServiceTotal?: number;
  slaServiceMetPct?: number;
};

type SlaSummary = {
  withinPct?: number | null;
  breachPct?: number | null;
  slaWaitMet?: number;
  slaWaitTotal?: number;
};

type TicketsByServiceItem = {
  serviceId?: string;
  serviceName?: string;
  count?: number;
};

type SurveyScorePoint = {
  date?: string;
  avgScoreNorm5?: number | null;
  questionId?: string;
  avgScoreNative?: number | null;
};

type UtilizationPoint = {
  date?: string;
  servingMinutes?: number | null;
  idleMinutes?: number | null;
  utilizationPct?: number | null;
};

export type StatisticsExportData = {
  timeseries?: { points?: TimeseriesPoint[] } | null;
  load?: { points?: LoadPoint[] } | null;
  slaDeviations?: { points?: SlaDeviationsPoint[] } | null;
  slaSummary?: SlaSummary | null;
  ticketsByService?: {
    items?: TicketsByServiceItem[];
    total?: number;
  } | null;
  surveyScores?: { points?: SurveyScorePoint[] } | null;
  utilization?: { points?: UtilizationPoint[] } | null;
};

export type StatisticsExportFilters = {
  dateFrom: string;
  dateTo: string;
  subdivisionName?: string;
  zoneName?: string;
  operatorName?: string;
};

type TranslateFn = (key: string) => string;

function escapeCSV(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map((c) => escapeCSV(String(c ?? ''))).join(',');
}

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return '';
  return v.toFixed(decimals);
}

function buildFilterLines(
  filters: StatisticsExportFilters,
  t: TranslateFn
): string[] {
  const lines: string[] = [];
  lines.push(
    row([t('export_period'), `${filters.dateFrom} — ${filters.dateTo}`])
  );
  if (filters.subdivisionName) {
    lines.push(row([t('filter_subdivision'), filters.subdivisionName]));
  }
  if (filters.zoneName) {
    lines.push(row([t('filter_zone'), filters.zoneName]));
  }
  if (filters.operatorName) {
    lines.push(row([t('filter_user'), filters.operatorName]));
  }
  return lines;
}

function buildTimeseriesSection(
  points: TimeseriesPoint[],
  t: TranslateFn
): string[] {
  if (!points.length) return [];
  const hasWaitSla = points.some((p) => p.slaWaitMetPct != null);
  const hasSvcSla = points.some((p) => p.slaServiceMetPct != null);
  const lines: string[] = ['', row([`[${t('chart_wait_service')}]`])];
  const header = [
    t('export_date'),
    t('legend_wait_min'),
    t('legend_service_min'),
    t('legend_created'),
    t('legend_completed'),
    t('legend_no_show'),
    ...(hasWaitSla ? [t('legend_sla_wait_pct')] : []),
    ...(hasSvcSla ? [t('legend_sla_service_pct')] : [])
  ];
  lines.push(row(header));
  for (const p of points) {
    lines.push(
      row([
        p.date,
        fmtNum(p.avgWaitMinutes),
        fmtNum(p.avgServiceMinutes),
        p.ticketsCreated,
        p.ticketsCompleted,
        p.noShowCount,
        ...(hasWaitSla ? [fmtNum(p.slaWaitMetPct, 1)] : []),
        ...(hasSvcSla ? [fmtNum(p.slaServiceMetPct, 1)] : [])
      ])
    );
  }
  return lines;
}

function buildLoadSection(points: LoadPoint[], t: TranslateFn): string[] {
  if (!points.length) return [];
  const lines: string[] = ['', row([`[${t('chart_volume')}]`])];
  lines.push(
    row([
      t('export_date'),
      t('legend_created'),
      t('legend_completed'),
      t('legend_no_show')
    ])
  );
  for (const p of points) {
    lines.push(
      row([p.date, p.ticketsCreated, p.ticketsCompleted, p.noShowCount])
    );
  }
  return lines;
}

function buildSlaDeviationsSection(
  points: SlaDeviationsPoint[],
  t: TranslateFn
): string[] {
  if (!points.length) return [];
  const hasServiceSla = points.some((p) => (p.slaServiceTotal ?? 0) > 0);
  const lines: string[] = ['', row([`[${t('chart_sla_deviations')}]`])];
  const header = [
    t('export_date'),
    t('legend_sla_within') + ' % (wait)',
    t('legend_sla_breach') + ' % (wait)',
    t('legend_sla_within') + ' # (wait)',
    t('tooltip_total') + ' (wait)'
  ];
  if (hasServiceSla) {
    header.push(
      t('legend_sla_service_pct'),
      t('legend_sla_within') + ' # (service)',
      t('tooltip_total') + ' (service)'
    );
  }
  lines.push(row(header));
  for (const p of points) {
    const cells: (string | number | null | undefined)[] = [
      p.date,
      fmtNum(p.withinPct, 1),
      fmtNum(p.breachPct, 1),
      p.slaWaitMet,
      p.slaWaitTotal
    ];
    if (hasServiceSla) {
      cells.push(
        fmtNum(p.slaServiceMetPct, 1),
        p.slaServiceMet,
        p.slaServiceTotal
      );
    }
    lines.push(row(cells));
  }
  return lines;
}

function buildSlaSummarySection(summary: SlaSummary, t: TranslateFn): string[] {
  if (!summary.slaWaitTotal || summary.slaWaitTotal <= 0) return [];
  const lines: string[] = ['', row([`[${t('chart_sla_radial')}]`])];
  lines.push(
    row([
      t('legend_sla_within') + ' %',
      t('legend_sla_breach') + ' %',
      t('legend_sla_within') + ' #',
      t('tooltip_total')
    ])
  );
  lines.push(
    row([
      fmtNum(summary.withinPct, 1),
      fmtNum(summary.breachPct, 1),
      summary.slaWaitMet,
      summary.slaWaitTotal
    ])
  );
  return lines;
}

function buildTicketsByServiceSection(
  items: TicketsByServiceItem[],
  total: number | undefined,
  t: TranslateFn
): string[] {
  if (!items.length) return [];
  const lines: string[] = ['', row([`[${t('chart_tickets_by_service')}]`])];
  lines.push(row([t('export_service'), t('export_count')]));
  for (const it of items) {
    lines.push(row([it.serviceName ?? it.serviceId, it.count]));
  }
  if (total != null) {
    lines.push(row([t('tooltip_total'), total]));
  }
  return lines;
}

function buildSurveySection(
  points: SurveyScorePoint[],
  t: TranslateFn
): string[] {
  if (!points.length) return [];
  const lines: string[] = ['', row([`[${t('chart_survey')}]`])];
  lines.push(
    row([
      t('export_date'),
      t('export_score_norm5'),
      t('export_score_native'),
      t('export_question_id')
    ])
  );
  for (const p of points) {
    lines.push(
      row([
        p.date,
        fmtNum(p.avgScoreNorm5),
        fmtNum(p.avgScoreNative),
        p.questionId
      ])
    );
  }
  return lines;
}

function buildUtilizationSection(
  points: UtilizationPoint[],
  t: TranslateFn
): string[] {
  if (!points.length) return [];
  const lines: string[] = ['', row([`[${t('chart_utilization')}]`])];
  lines.push(
    row([
      t('export_date'),
      t('utilization_metric_serving') + ` (${t('minutes_short')})`,
      t('utilization_metric_idle') + ` (${t('minutes_short')})`,
      t('legend_utilization_pct')
    ])
  );
  for (const p of points) {
    lines.push(
      row([
        p.date,
        fmtNum(p.servingMinutes, 1),
        fmtNum(p.idleMinutes, 1),
        fmtNum(p.utilizationPct, 1)
      ])
    );
  }
  return lines;
}

export function buildStatisticsCSV(
  data: StatisticsExportData,
  filters: StatisticsExportFilters,
  t: TranslateFn
): string {
  const lines: string[] = [];

  lines.push(row([t('export_report_title')]));
  lines.push(row([t('export_generated_at'), new Date().toISOString()]));
  lines.push(...buildFilterLines(filters, t));

  const ts = data.timeseries?.points;
  if (ts?.length) {
    lines.push(...buildTimeseriesSection(ts, t));
  }

  const load = data.load?.points;
  if (load?.length) {
    lines.push(...buildLoadSection(load, t));
  }

  const slaDev = data.slaDeviations?.points;
  if (slaDev?.length) {
    lines.push(...buildSlaDeviationsSection(slaDev, t));
  }

  if (data.slaSummary) {
    lines.push(...buildSlaSummarySection(data.slaSummary, t));
  }

  const tbs = data.ticketsByService;
  if (tbs?.items?.length) {
    lines.push(...buildTicketsByServiceSection(tbs.items, tbs.total, t));
  }

  const survey = data.surveyScores?.points;
  if (survey?.length) {
    lines.push(...buildSurveySection(survey, t));
  }

  const util = data.utilization?.points;
  if (util?.length) {
    lines.push(...buildUtilizationSection(util, t));
  }

  return lines.join('\r\n');
}

export function downloadStatisticsCSV(
  data: StatisticsExportData,
  filters: StatisticsExportFilters,
  t: TranslateFn,
  unitName?: string
): void {
  const csv = buildStatisticsCSV(data, filters, t);
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], {
    type: 'text/csv;charset=utf-8;'
  });
  const safeName = (unitName ?? 'statistics')
    .replace(/[/\\:*?"<>|]/g, '_')
    .slice(0, 60);
  const filename = `${safeName}_${filters.dateFrom}_${filters.dateTo}.csv`;
  triggerBlobDownload(blob, filename);
}
