import { describe, it, expect } from 'vitest';
import {
  buildStatisticsCSV,
  type StatisticsExportData,
  type StatisticsExportFilters
} from './statistics-csv-export';

/** Identity translate function: returns the key itself, making header assertions key-based. */
const t = (key: string) => key;

const filters: StatisticsExportFilters = {
  dateFrom: '2026-04-01',
  dateTo: '2026-04-30'
};

/** Parse the CSV produced by buildStatisticsCSV into lines, then split the header row of a named section. */
function parseSectionHeader(csv: string, sectionKey: string): string[] {
  const lines = csv.split('\r\n');
  const sectionIdx = lines.findIndex((l) => l.includes(sectionKey));
  if (sectionIdx === -1) return [];
  // The header is the line immediately after the section label
  return lines[sectionIdx + 1]?.split(',') ?? [];
}

/** Find a data row (by date string) in a section, return its cells. */
function parseSectionDataRow(
  csv: string,
  sectionKey: string,
  date: string
): string[] {
  const lines = csv.split('\r\n');
  const sectionIdx = lines.findIndex((l) => l.includes(sectionKey));
  if (sectionIdx === -1) return [];
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith(date)) return lines[i].split(',');
  }
  return [];
}

describe('buildStatisticsCSV — timeseries SLA columns', () => {
  it('produces 6 columns when no SLA data present', () => {
    const data: StatisticsExportData = {
      timeseries: {
        points: [
          {
            date: '2026-04-01',
            avgWaitMinutes: 5,
            avgServiceMinutes: 10,
            ticketsCreated: 20,
            ticketsCompleted: 18,
            noShowCount: 2
          }
        ]
      }
    };
    const csv = buildStatisticsCSV(data, filters, t);
    const header = parseSectionHeader(csv, 'chart_wait_service');
    // date, wait, service, created, completed, no-show → 6 columns
    expect(header).toHaveLength(6);
    expect(header).not.toContain('legend_sla_wait_pct');
    expect(header).not.toContain('legend_sla_service_pct');
  });

  it('adds wait SLA column when slaWaitMetPct is present', () => {
    const data: StatisticsExportData = {
      timeseries: {
        points: [
          {
            date: '2026-04-01',
            avgWaitMinutes: 5,
            avgServiceMinutes: 10,
            ticketsCreated: 20,
            ticketsCompleted: 18,
            noShowCount: 2,
            slaWaitMetPct: 85.5
          }
        ]
      }
    };
    const csv = buildStatisticsCSV(data, filters, t);
    const header = parseSectionHeader(csv, 'chart_wait_service');
    expect(header).toHaveLength(7);
    expect(header[6]).toBe('legend_sla_wait_pct');

    const dataRow = parseSectionDataRow(
      csv,
      'chart_wait_service',
      '2026-04-01'
    );
    expect(dataRow[6]).toBe('85.5');
  });

  it('adds both SLA columns when slaWaitMetPct and slaServiceMetPct are present', () => {
    const data: StatisticsExportData = {
      timeseries: {
        points: [
          {
            date: '2026-04-01',
            avgWaitMinutes: 3,
            avgServiceMinutes: 8,
            ticketsCreated: 10,
            ticketsCompleted: 9,
            noShowCount: 1,
            slaWaitMetPct: 90,
            slaServiceMetPct: 75
          }
        ]
      }
    };
    const csv = buildStatisticsCSV(data, filters, t);
    const header = parseSectionHeader(csv, 'chart_wait_service');
    expect(header).toHaveLength(8);
    expect(header[6]).toBe('legend_sla_wait_pct');
    expect(header[7]).toBe('legend_sla_service_pct');

    const dataRow = parseSectionDataRow(
      csv,
      'chart_wait_service',
      '2026-04-01'
    );
    expect(dataRow[6]).toBe('90.0');
    expect(dataRow[7]).toBe('75.0');
  });

  it('adds only service SLA column when only slaServiceMetPct is present', () => {
    const data: StatisticsExportData = {
      timeseries: {
        points: [
          {
            date: '2026-04-02',
            avgWaitMinutes: 4,
            avgServiceMinutes: 7,
            ticketsCreated: 5,
            ticketsCompleted: 5,
            noShowCount: 0,
            slaServiceMetPct: 60
          }
        ]
      }
    };
    const csv = buildStatisticsCSV(data, filters, t);
    const header = parseSectionHeader(csv, 'chart_wait_service');
    expect(header).toHaveLength(7);
    expect(header[6]).toBe('legend_sla_service_pct');
    expect(header).not.toContain('legend_sla_wait_pct');
  });
});

describe('buildStatisticsCSV — SLA deviations service columns', () => {
  it('omits service columns when no service SLA data', () => {
    const data: StatisticsExportData = {
      slaDeviations: {
        points: [
          {
            date: '2026-04-01',
            withinPct: 90,
            breachPct: 10,
            slaWaitMet: 90,
            slaWaitTotal: 100
          }
        ]
      }
    };
    const csv = buildStatisticsCSV(data, filters, t);
    const header = parseSectionHeader(csv, 'chart_sla_deviations');
    // date, within%, breach%, met#, total# → 5 columns
    expect(header).toHaveLength(5);
    expect(header).not.toContain('legend_sla_service_pct');
  });

  it('appends service SLA columns when slaServiceTotal > 0', () => {
    const data: StatisticsExportData = {
      slaDeviations: {
        points: [
          {
            date: '2026-04-01',
            withinPct: 88,
            breachPct: 12,
            slaWaitMet: 88,
            slaWaitTotal: 100,
            slaServiceMet: 70,
            slaServiceTotal: 80,
            slaServiceMetPct: 87.5
          }
        ]
      }
    };
    const csv = buildStatisticsCSV(data, filters, t);
    const header = parseSectionHeader(csv, 'chart_sla_deviations');
    // date, within%(wait), breach%(wait), met#(wait), total#(wait), svcPct, svcMet, svcTotal → 8 columns
    expect(header).toHaveLength(8);
    expect(header[5]).toBe('legend_sla_service_pct');

    const dataRow = parseSectionDataRow(
      csv,
      'chart_sla_deviations',
      '2026-04-01'
    );
    expect(dataRow[5]).toBe('87.5');
    expect(dataRow[6]).toBe('70');
    expect(dataRow[7]).toBe('80');
  });
});
