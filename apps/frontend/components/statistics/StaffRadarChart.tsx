'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ServicesStaffPerformanceResponse } from '@/lib/api/generated/statistics';
import { resolveCssColorToRgb, rgbStringToRgba } from '@/lib/resolve-css-color';
import { cn } from '@/lib/utils';

interface StaffRadarChartProps {
  data: ServicesStaffPerformanceResponse;
  className?: string;
}

interface MetricRow {
  subject: string;
  value: number;
}

const VB = 240;
const CX = VB / 2;
const CY = VB / 2;
/** Max data radius inside viewBox units */
const R_MAX = 72;
/** Label sits outside data polygon */
const LABEL_R = R_MAX + 18;

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleRad: number
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad)
  };
}

/** Regular polygon path at fraction `t` of max radius (0 < t <= 1). */
function ringPolygonPath(n: number, t: number): string {
  const r = R_MAX * t;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const { x, y } = polarToCartesian(CX, CY, r, angle);
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${pts.join(' ')} Z`;
}

function radialLinePath(n: number, i: number): string {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
  const outer = polarToCartesian(CX, CY, R_MAX, angle);
  return `M ${CX} ${CY} L ${outer.x.toFixed(2)} ${outer.y.toFixed(2)}`;
}

function dataPolygonPath(rows: MetricRow[]): string {
  const n = rows.length;
  if (n < 3) return '';
  const segs: string[] = [];
  rows.forEach((row, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const rad = (Math.max(0, Math.min(100, row.value)) / 100) * R_MAX;
    const { x, y } = polarToCartesian(CX, CY, rad, angle);
    segs.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  });
  return `${segs.join(' ')} Z`;
}

function labelPosition(n: number, i: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return polarToCartesian(CX, CY, LABEL_R, angle);
}

/** Single-metric bubble anchored near a vertex (positioned by parent %). */
function DotMetricTooltip({
  subject,
  value
}: {
  subject: string;
  value: number;
}) {
  return (
    <div className='bg-background text-foreground border-border min-w-[120px] rounded-md border px-2.5 py-1.5 text-xs shadow-md'>
      <p className='text-muted-foreground leading-tight'>{subject}</p>
      <p className='font-semibold tabular-nums'>{value.toFixed(1)}</p>
    </div>
  );
}

export function StaffRadarChart({ data, className }: StaffRadarChartProps) {
  const t = useTranslations('statistics');
  /** Which vertex dot is hovered; tooltip follows that point. */
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const [accentRgb, setAccentRgb] = useState('rgb(218, 160, 42)');
  const [gridRgb, setGridRgb] = useState('rgb(200, 200, 200)');
  const [dotRingRgb, setDotRingRgb] = useState('rgb(255, 255, 255)');
  useEffect(() => {
    // Defer out of the effect body to satisfy react-hooks/set-state-in-effect (needs client CSS).
    queueMicrotask(() => {
      setAccentRgb(resolveCssColorToRgb('var(--chart-1)'));
      setGridRgb(resolveCssColorToRgb('var(--border)'));
      setDotRingRgb(resolveCssColorToRgb('var(--card)'));
    });
  }, []);

  const fillRgba = useMemo(() => rgbStringToRgba(accentRgb, 0.28), [accentRgb]);

  const rows: MetricRow[] = useMemo(
    () => [
      { subject: t('radar_sla_wait'), value: data.slaWait ?? 100 },
      { subject: t('radar_sla_service'), value: data.slaService ?? 100 },
      { subject: t('radar_utilization'), value: data.utilizationPct ?? 0 },
      { subject: t('radar_csat'), value: data.csatNorm ?? 0 },
      {
        subject: t('radar_tph'),
        value: Math.min(100, ((data.ticketsPerHour ?? 0) / 20) * 100)
      }
    ],
    [data, t]
  );

  const n = rows.length;
  const gridRings = [0.25, 0.5, 0.75, 1];
  const dataPath = dataPolygonPath(rows);

  const vertexPoints = rows.map((row, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const rad = (Math.max(0, Math.min(100, row.value)) / 100) * R_MAX;
    return polarToCartesian(CX, CY, rad, angle);
  });

  const activePoint = activeIdx !== null ? vertexPoints[activeIdx] : null;
  const activeRow = activeIdx !== null ? rows[activeIdx] : null;

  return (
    <div className={cn('relative mx-auto w-full max-w-[280px]', className)}>
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className='aspect-square h-[220px] w-full overflow-visible sm:h-[260px]'
        role='img'
        aria-label={t('staff_detail_profile')}
      >
        {/* Spider web: concentric polygons */}
        {gridRings.map((tRing) => (
          <path
            key={tRing}
            d={ringPolygonPath(n, tRing)}
            fill='none'
            pointerEvents='none'
            style={{ stroke: gridRgb, strokeWidth: 1 }}
            vectorEffect='non-scaling-stroke'
          />
        ))}
        {/* Radial spokes */}
        {Array.from({ length: n }).map((_, i) => (
          <path
            key={`spoke-${i}`}
            d={radialLinePath(n, i)}
            fill='none'
            pointerEvents='none'
            style={{ stroke: gridRgb, strokeWidth: 1 }}
            vectorEffect='non-scaling-stroke'
          />
        ))}
        {/* Data polygon — pointer-events off so hits reach the vertex targets */}
        {dataPath ? (
          <path
            d={dataPath}
            fillRule='evenodd'
            pointerEvents='none'
            style={{
              fill: fillRgba,
              stroke: accentRgb,
              strokeWidth: 2
            }}
            vectorEffect='non-scaling-stroke'
          />
        ) : null}
        {/* Vertex dots: large invisible hit targets, then visible dot */}
        {vertexPoints.map((p, i) => (
          <g key={`vertex-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={14}
              fill='transparent'
              className='cursor-pointer'
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={4}
              pointerEvents='none'
              style={{
                fill: accentRgb,
                stroke: dotRingRgb,
                strokeWidth: 1.5
              }}
              vectorEffect='non-scaling-stroke'
            />
          </g>
        ))}
        {/* Axis labels */}
        {rows.map((row, i) => {
          const { x, y } = labelPosition(n, i);
          return (
            <text
              key={`lbl-${row.subject}`}
              x={x}
              y={y}
              textAnchor='middle'
              dominantBaseline='middle'
              pointerEvents='none'
              className='fill-muted-foreground'
              style={{ fontSize: 9 }}
            >
              {row.subject}
            </text>
          );
        })}
      </svg>
      {/* HTML tooltip aligned to active dot (viewBox coords → % of square box) */}
      {activePoint && activeRow && (
        <div
          className='pointer-events-none absolute z-20'
          style={{
            left: `${(activePoint.x / VB) * 100}%`,
            top: `${(activePoint.y / VB) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 10px))'
          }}
        >
          <DotMetricTooltip
            subject={activeRow.subject}
            value={activeRow.value}
          />
        </div>
      )}
    </div>
  );
}
