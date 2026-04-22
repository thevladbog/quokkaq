import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServicesStaffingForecastResponse } from '@/lib/api/generated/statistics';

afterEach(cleanup);

// next-intl: t(key) or t(key, values) — always return the key
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => 'en'
}));

// recharts — JSDOM can't measure SVG layout; replace with minimal stubs
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='bar-chart'>{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Cell: () => null,
  ReferenceLine: () => null
}));

import { StaffingForecastPanel } from './StaffingForecastPanel';

const mockData: ServicesStaffingForecastResponse = {
  unitId: 'u-1',
  targetDate: '2026-05-01',
  dayOfWeek: 'Thursday',
  targetSlaPct: 90,
  targetMaxWaitMin: 5,
  hourlyForecasts: [
    {
      hour: 9,
      expectedArrivals: 12,
      avgServiceTimeMin: 5,
      recommendedStaff: 3,
      expectedSlaPct: 92.5
    },
    {
      hour: 10,
      expectedArrivals: 20,
      avgServiceTimeMin: 5,
      recommendedStaff: 4,
      expectedSlaPct: 91.0
    }
  ],
  dailySummary: {
    totalExpectedArrivals: 32,
    peakHour: 10,
    peakArrivals: 20,
    maxRecommendedStaff: 4,
    avgRecommendedStaff: 3.5
  }
};

describe('StaffingForecastPanel', () => {
  it('renders date, SLA and wait controls', () => {
    render(
      <StaffingForecastPanel
        data={mockData}
        targetDate='2026-05-01'
        targetSlaPct={90}
        targetMaxWaitMin={5}
      />
    );

    expect(screen.getByText('May 1, 2026')).toBeInTheDocument();
    expect(screen.getByLabelText(/sf_target_sla/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sf_max_wait/i)).toBeInTheDocument();
  });

  it('renders the bar chart container when data is available', () => {
    render(
      <StaffingForecastPanel
        data={mockData}
        targetDate='2026-05-01'
        targetSlaPct={90}
        targetMaxWaitMin={5}
      />
    );

    const charts = screen.getAllByTestId('bar-chart');
    expect(charts.length).toBeGreaterThan(0);
  });

  it('renders daily summary badges', () => {
    render(
      <StaffingForecastPanel
        data={mockData}
        targetDate='2026-05-01'
        targetSlaPct={90}
        targetMaxWaitMin={5}
      />
    );

    // peak hour badge contains "10:00"
    const peakTexts = screen.getAllByText(/10:00/);
    expect(peakTexts.length).toBeGreaterThan(0);

    // max recommended staff badge text "4" (maxRecommendedStaff)
    // At least one badge-slot contains "4"
    const badges = document.querySelectorAll('[data-slot="badge"]');
    const texts = Array.from(badges).map((b) => b.textContent ?? '');
    const hasMax = texts.some((t) => t.includes('4'));
    expect(hasMax).toBe(true);
  });

  it('calls onParamsChange when SLA input loses focus', () => {
    const onParamsChange = vi.fn();
    render(
      <StaffingForecastPanel
        data={mockData}
        targetDate='2026-05-01'
        targetSlaPct={90}
        targetMaxWaitMin={5}
        onParamsChange={onParamsChange}
      />
    );

    const slaInput = screen.getByLabelText(/sf_target_sla/i);
    fireEvent.change(slaInput, { target: { value: '85' } });
    fireEvent.blur(slaInput);

    expect(onParamsChange).toHaveBeenCalledOnce();
    expect(onParamsChange).toHaveBeenCalledWith(
      expect.objectContaining({ targetSlaPct: 85 })
    );
  });

  it('calls onParamsChange when Enter is pressed on SLA input', () => {
    const onParamsChange = vi.fn();
    render(
      <StaffingForecastPanel
        data={mockData}
        targetDate='2026-05-01'
        targetSlaPct={90}
        targetMaxWaitMin={5}
        onParamsChange={onParamsChange}
      />
    );

    const slaInput = screen.getByLabelText(/sf_target_sla/i);
    fireEvent.change(slaInput, { target: { value: '85' } });
    fireEvent.keyDown(slaInput, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(onParamsChange).toHaveBeenCalledOnce();
    expect(onParamsChange).toHaveBeenCalledWith(
      expect.objectContaining({ targetSlaPct: 85 })
    );
  });

  it('shows empty-state text when there are no hourly forecasts', () => {
    const emptyData = { ...mockData, hourlyForecasts: [] };
    render(
      <StaffingForecastPanel
        data={emptyData}
        targetDate='2026-05-01'
        targetSlaPct={90}
        targetMaxWaitMin={5}
      />
    );
    // The component renders `t('sf_no_data')` when hourlyForecasts is empty
    expect(screen.getByText('sf_no_data')).toBeInTheDocument();
    // Bar chart should NOT be present when there's no data
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });
});
