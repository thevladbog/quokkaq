'use client';

import { useTranslations } from 'next-intl';
import type { ServicesStaffPerformanceResponse } from '@/lib/api/generated/statistics';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

function fmtDuration(ms?: number): string {
  if (!ms) return '—';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

function fmtPct(v?: number): string {
  if (v === undefined || v === null) return '—';
  return `${v.toFixed(1)}%`;
}

function fmtNum(v?: number): string {
  if (v === undefined || v === null) return '—';
  return v.toFixed(1);
}

export type StaffSortField =
  | 'ticketsCompleted'
  | 'avgServiceMs'
  | 'slaWait'
  | 'csatAvg'
  | 'utilizationPct';

interface SortableThProps {
  label: string;
  field: StaffSortField;
  active: boolean;
  onSort: (f: StaffSortField) => void;
}

function SortableTh({ label, field, active, onSort }: SortableThProps) {
  return (
    <TableHead
      className={cn('whitespace-nowrap', active && 'font-semibold')}
      aria-sort={active ? 'descending' : 'none'}
    >
      <button
        type='button'
        className={cn(
          'text-foreground inline-flex cursor-pointer items-center gap-1 select-none',
          active && 'font-semibold'
        )}
        onClick={() => onSort(field)}
      >
        {label}
        {active && <span className='opacity-60'>↓</span>}
      </button>
    </TableHead>
  );
}

interface StaffLeaderboardProps {
  items: ServicesStaffPerformanceResponse[];
  selectedUserId?: string;
  onSelectUser?: (userId: string) => void;
  sortBy?: StaffSortField;
  onSortChange?: (field: StaffSortField) => void;
}

export function StaffLeaderboard({
  items,
  selectedUserId,
  onSelectUser,
  sortBy = 'ticketsCompleted',
  onSortChange
}: StaffLeaderboardProps) {
  const t = useTranslations('statistics');

  if (items.length === 0) {
    return (
      <p className='text-muted-foreground py-4 text-sm'>
        {t('staff_leaderboard_no_data')}
      </p>
    );
  }

  const handleSort = (field: StaffSortField) => onSortChange?.(field);

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-8'>#</TableHead>
            <TableHead className='min-w-[160px]'>
              {t('staff_leaderboard_name')}
            </TableHead>
            <SortableTh
              label={t('staff_leaderboard_completed')}
              field='ticketsCompleted'
              active={sortBy === 'ticketsCompleted'}
              onSort={handleSort}
            />
            <SortableTh
              label={t('staff_leaderboard_avg_service')}
              field='avgServiceMs'
              active={sortBy === 'avgServiceMs'}
              onSort={handleSort}
            />
            <SortableTh
              label={t('staff_leaderboard_sla_wait')}
              field='slaWait'
              active={sortBy === 'slaWait'}
              onSort={handleSort}
            />
            <SortableTh
              label={t('staff_leaderboard_csat')}
              field='csatAvg'
              active={sortBy === 'csatAvg'}
              onSort={handleSort}
            />
            <SortableTh
              label={t('staff_leaderboard_utilization')}
              field='utilizationPct'
              active={sortBy === 'utilizationPct'}
              onSort={handleSort}
            />
            <TableHead className='text-right'>
              {t('staff_leaderboard_tph')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row, idx) => {
            const isSelected = row.userId === selectedUserId;
            return (
              <TableRow
                key={row.userId ?? idx}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-muted'
                )}
                onClick={() => row.userId && onSelectUser?.(row.userId)}
              >
                <TableCell className='text-muted-foreground text-xs'>
                  {idx + 1}
                </TableCell>
                <TableCell className='font-medium'>
                  {row.userName ?? row.userId ?? '—'}
                </TableCell>
                <TableCell>{row.ticketsCompleted ?? 0}</TableCell>
                <TableCell>{fmtDuration(row.avgServiceMs)}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'font-medium',
                      (row.slaWait ?? 100) >= 90
                        ? 'text-green-600'
                        : (row.slaWait ?? 100) >= 75
                          ? 'text-yellow-600'
                          : 'text-destructive'
                    )}
                  >
                    {fmtPct(row.slaWait)}
                  </span>
                </TableCell>
                <TableCell>
                  {row.csatAvg !== undefined && row.csatAvg !== null
                    ? row.csatAvg.toFixed(2)
                    : '—'}
                </TableCell>
                <TableCell>{fmtPct(row.utilizationPct)}</TableCell>
                <TableCell className='text-right'>
                  {fmtNum(row.ticketsPerHour)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
