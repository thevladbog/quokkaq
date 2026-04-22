'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as orval from '@/lib/api/generated/units';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function ScheduleEditor({ unitId }: { unitId: string }) {
  const t = useTranslations('admin.signage');
  const { data: playlists } = orval.useListSignagePlaylists(unitId);
  const { data: schedules, refetch: refetchSch } =
    orval.useListSignageSchedules(unitId);
  const [scPl, setScPl] = useState('');
  const [scDays, setScDays] = useState('1,2,3,4,5');
  const [scStart, setScStart] = useState('09:00');
  const [scEnd, setScEnd] = useState('18:00');
  const [priority, setPriority] = useState(0);
  const createSc = orval.useCreateSignageSchedule();
  const delSc = orval.useDeleteSignageSchedule();
  const updSc = orval.useUpdateSignageSchedule();

  const onCreate = async () => {
    if (!scPl) {
      toast.error(t('pickPlaylist', { default: 'Select a playlist' }));
      return;
    }
    try {
      await createSc.mutateAsync({
        unitId,
        data: {
          playlistId: scPl,
          daysOfWeek: scDays,
          startTime: scStart,
          endTime: scEnd,
          priority,
          isActive: true
        } as orval.HandlersCreateScheduleRequest
      });
      toast.success(t('saved', { default: 'Saved' }));
      void refetchSch();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onDelete = async (scheduleId: string) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await delSc.mutateAsync({ unitId, scheduleId });
      void refetchSch();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className='space-y-4'>
      <div className='grid gap-2 sm:grid-cols-2'>
        <div>
          <Label>Playlist</Label>
          <select
            className='border-input bg-background w-full rounded-md border px-2 py-1'
            value={scPl}
            onChange={(e) => setScPl(e.target.value)}
          >
            <option value=''>—</option>
            {((playlists as orval.ModelsPlaylist[] | undefined) ?? []).map(
              (p) => (
                <option key={p.id} value={p.id ?? ''}>
                  {p.name}
                </option>
              )
            )}
          </select>
        </div>
        <div>
          <Label>{t('daysLabel', { default: 'Days (1=Mon … 7=Sun)' })}</Label>
          <Input value={scDays} onChange={(e) => setScDays(e.target.value)} />
        </div>
        <div>
          <Label>Start</Label>
          <Input value={scStart} onChange={(e) => setScStart(e.target.value)} />
        </div>
        <div>
          <Label>End</Label>
          <Input value={scEnd} onChange={(e) => setScEnd(e.target.value)} />
        </div>
        <div>
          <Label>Priority</Label>
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
        {((schedules as orval.ModelsPlaylistSchedule[] | undefined) ?? []).map(
          (s) => (
            <li
              key={s.id}
              className='flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm'
            >
              <span>
                {s.startTime}–{s.endTime} · {s.daysOfWeek} · pri{' '}
                {s.priority ?? 0}
              </span>
              <div className='flex items-center gap-1'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={async () => {
                    if (!s.id) return;
                    const nextP = (s.priority ?? 0) + 1;
                    try {
                      await updSc.mutateAsync({
                        unitId,
                        scheduleId: s.id,
                        data: {
                          playlistId: s.playlistId,
                          daysOfWeek: s.daysOfWeek,
                          startTime: s.startTime,
                          endTime: s.endTime,
                          priority: nextP,
                          isActive: s.isActive
                        } as orval.HandlersCreateScheduleRequest
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
          )
        )}
      </ul>
    </div>
  );
}
