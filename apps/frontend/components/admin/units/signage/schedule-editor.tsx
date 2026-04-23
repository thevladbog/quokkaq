'use client';

import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getCivilYmdInIanaTimeZone,
  scheduleInCalendarForTodayYmd
} from '@/lib/signage-date';
import * as orval from '@/lib/api/generated/units';
import {
  safeParseSignageWithToast,
  signageZod,
  updateSignageScheduleBodySchema
} from '@/lib/signage-zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import { toast } from 'sonner';
import { newScheduleOverlapsAnyExisting } from '@/lib/signage-schedule-overlap';
import { ScheduleTimeline } from './schedule-timeline';

const emptyPlaylists: orval.ModelsPlaylist[] = [];
const emptySchedules: orval.ModelsPlaylistSchedule[] = [];
const DOW = [1, 2, 3, 4, 5, 6, 7] as const;
const DOW_NAME_KEYS = [
  'dayNameMon',
  'dayNameTue',
  'dayNameWed',
  'dayNameThu',
  'dayNameFri',
  'dayNameSat',
  'dayNameSun'
] as const;

function WeekdayMultiSelect({
  value,
  onChange,
  t
}: {
  value: number[];
  onChange: (next: number[]) => void;
  t: (key: string, o?: { default?: string }) => string;
}) {
  const dayLabels = DOW_NAME_KEYS.map((k) => t(k));
  const labelText = value
    .slice()
    .sort((a, b) => a - b)
    .map((d) => dayLabels[d - 1] ?? d)
    .join(', ');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          className='border-input bg-background h-auto min-h-10 w-full justify-start py-2 text-left font-normal whitespace-normal'
        >
          {value.length === 0 ? (
            <span className='text-muted-foreground'>
              {t('selectDays', { default: 'Select days' })}
            </span>
          ) : (
            labelText
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='p-2 sm:w-72' align='start'>
        <div className='flex max-h-72 min-w-0 flex-col gap-0.5'>
          {DOW.map((d) => {
            const checked = value.includes(d);
            return (
              <label
                key={d}
                className='hover:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm'
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    if (c === true) {
                      onChange([...value, d].sort((a, b) => a - b));
                    } else {
                      onChange(value.filter((x) => x !== d));
                    }
                  }}
                />
                <span className='min-w-0 flex-1 leading-snug'>
                  {dayLabels[d - 1] ?? d}
                </span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ScheduleEditor({
  unitId,
  unitTimezone
}: {
  unitId: string;
  unitTimezone: string;
}) {
  const t = useTranslations('admin.signage');
  const tCommon = useTranslations('common');
  const timeStartId = useId();
  const timeEndId = useId();
  const todayYmd = useMemo(
    () => getCivilYmdInIanaTimeZone(unitTimezone || 'UTC'),
    [unitTimezone]
  );
  const { data: playlistsRes } = orval.useListSignagePlaylists(unitId);
  const { data: schedulesRes, refetch: refetchSch } =
    orval.useListSignageSchedules(unitId);
  const playlists = playlistsRes?.data ?? emptyPlaylists;
  const playlistNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of playlists) {
      if (p.id) {
        m.set(p.id, p.name ?? p.id);
      }
    }
    return m;
  }, [playlists]);
  const [scPl, setScPl] = useState('');
  const [dayNums, setDayNums] = useState<number[]>([1, 2, 3, 4, 5]);
  const [scStart, setScStart] = useState('09:00');
  const [scEnd, setScEnd] = useState('18:00');
  const [scValidFrom, setScValidFrom] = useState('');
  const [scValidTo, setScValidTo] = useState('');
  const [priority, setPriority] = useState(0);
  const createSc = orval.useCreateSignageSchedule();
  const delSc = orval.useDeleteSignageSchedule();
  const updSc = orval.useUpdateSignageSchedule();
  const list = schedulesRes?.data ?? emptySchedules;

  const onCreate = async () => {
    if (!scPl) {
      toast.error(t('pickPlaylist', { default: 'Select a playlist' }));
      return;
    }
    if (dayNums.length === 0) {
      toast.error(
        t('selectAtLeastOneDay', { default: 'Select at least one day' })
      );
      return;
    }
    const scDays = dayNums
      .slice()
      .sort((a, b) => a - b)
      .join(',');
    const body = {
      playlistId: scPl,
      daysOfWeek: scDays,
      startTime: scStart,
      endTime: scEnd,
      validFrom: scValidFrom.trim() || undefined,
      validTo: scValidTo.trim() || undefined,
      priority,
      isActive: true
    };
    if (
      !safeParseSignageWithToast('Schedule', signageZod.schedule, body).success
    ) {
      return;
    }
    if (newScheduleOverlapsAnyExisting(body, list)) {
      toast.error(
        t('scheduleOverlap', {
          default:
            'This schedule overlaps another for the same day and time. Change days or the time range.'
        })
      );
      return;
    }
    try {
      await createSc.mutateAsync({
        unitId,
        data: body as orval.HandlersCreateScheduleRequest
      });
      toast.success(t('saved', { default: 'Saved' }));
      void refetchSch();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onDelete = async (scheduleId: string) => {
    if (
      !window.confirm(
        t('confirmDeleteSchedule', { default: 'Delete this schedule?' })
      )
    ) {
      return;
    }
    try {
      await delSc.mutateAsync({ unitId, scheduleId });
      void refetchSch();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className='space-y-4'>
      <ScheduleTimeline
        todayYmd={todayYmd}
        schedules={list.map((s) => {
          const vf = s.validFrom ? String(s.validFrom).slice(0, 10) : undefined;
          const vt = s.validTo ? String(s.validTo).slice(0, 10) : undefined;
          return {
            id: s.id ?? '',
            startTime: s.startTime ?? '00:00',
            endTime: s.endTime ?? '00:00',
            daysOfWeek: s.daysOfWeek ?? '',
            priority: s.priority ?? 0,
            playlistId: s.playlistId,
            playlistName: s.playlistId
              ? (playlistNameById.get(s.playlistId) ?? s.playlistId)
              : undefined,
            validFrom: vf,
            validTo: vt
          };
        })}
      />
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='min-w-0 space-y-2'>
          <Label>{t('playlistField', { default: 'Playlist' })}</Label>
          <Select
            value={scPl || undefined}
            onValueChange={(v) => setScPl(v === '_none' ? '' : v)}
          >
            <SelectTrigger className='border-input bg-background w-full'>
              <SelectValue placeholder='—' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_none'>—</SelectItem>
              {playlists
                .filter(
                  (p): p is typeof p & { id: string } =>
                    typeof p.id === 'string' && p.id.length > 0
                )
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className='min-w-0 space-y-2'>
          <Label>{t('daysLabel', { default: 'Days of week' })}</Label>
          <WeekdayMultiSelect value={dayNums} onChange={setDayNums} t={t} />
        </div>
        <Field className='w-full min-w-0'>
          <FieldLabel htmlFor={timeStartId}>
            {t('scheduleStart', { default: 'Start' })}
          </FieldLabel>
          <TimePicker
            id={timeStartId}
            value={scStart}
            onChange={setScStart}
            step={60}
            className='w-full'
          />
        </Field>
        <Field className='w-full min-w-0'>
          <FieldLabel htmlFor={timeEndId}>
            {t('scheduleEnd', { default: 'End' })}
          </FieldLabel>
          <TimePicker
            id={timeEndId}
            value={scEnd}
            onChange={setScEnd}
            step={60}
            className='w-full'
          />
        </Field>
        <div className='min-w-0 space-y-2'>
          <Label>
            {t('scheduleValidFrom', { default: 'Valid from (date, optional)' })}
          </Label>
          <DatePicker
            value={scValidFrom}
            onChange={setScValidFrom}
            placeholder={tCommon('pickDate', { default: 'Select date' })}
            className='w-full'
          />
        </div>
        <div className='min-w-0 space-y-2'>
          <Label>
            {t('scheduleValidTo', { default: 'Valid to (date, optional)' })}
          </Label>
          <DatePicker
            value={scValidTo}
            onChange={setScValidTo}
            placeholder={tCommon('pickDate', { default: 'Select date' })}
            className='w-full'
          />
        </div>
        <div className='min-w-0 space-y-2 sm:max-w-xs'>
          <Label>{t('schedulePriority', { default: 'Priority' })}</Label>
          <Input
            type='number'
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>
      <Button
        onClick={() => {
          void onCreate();
        }}
      >
        {t('create', { default: 'Create' })}
      </Button>
      <ul className='space-y-2'>
        {list.map((s) => (
          <li
            key={s.id}
            className='flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm'
          >
            <span>
              {s.startTime}–{s.endTime} · {s.daysOfWeek} · pri {s.priority ?? 0}
              {s.validFrom || s.validTo
                ? ` · ${(s.validFrom ?? '…').toString().slice(0, 10)}–${(s.validTo ?? '…').toString().slice(0, 10)}`
                : ''}
              {s.validFrom || s.validTo
                ? !scheduleInCalendarForTodayYmd(
                    s.validFrom ? String(s.validFrom).slice(0, 10) : undefined,
                    s.validTo ? String(s.validTo).slice(0, 10) : undefined,
                    todayYmd
                  )
                  ? ` · [${t('scheduleOutsideCalendar', { default: 'outside calendar today' })}]`
                  : null
                : null}
            </span>
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={async () => {
                  if (!s.id) return;
                  const nextP = (s.priority ?? 0) + 1;
                  const data = {
                    playlistId: s.playlistId ?? '',
                    daysOfWeek: s.daysOfWeek ?? '',
                    startTime: s.startTime ?? '',
                    endTime: s.endTime ?? '',
                    validFrom: s.validFrom
                      ? String(s.validFrom).slice(0, 10)
                      : undefined,
                    validTo: s.validTo
                      ? String(s.validTo).slice(0, 10)
                      : undefined,
                    priority: nextP,
                    isActive: s.isActive
                  };
                  if (
                    !safeParseSignageWithToast(
                      'Schedule update',
                      updateSignageScheduleBodySchema,
                      data
                    ).success
                  ) {
                    return;
                  }
                  try {
                    await updSc.mutateAsync({
                      unitId,
                      scheduleId: s.id,
                      data: data as orval.HandlersCreateScheduleRequest
                    });
                    void refetchSch();
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                {t('bumpPriority', { default: '↑ Priority' })}
              </Button>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => {
                  void onDelete(s.id!);
                }}
              >
                Del
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
