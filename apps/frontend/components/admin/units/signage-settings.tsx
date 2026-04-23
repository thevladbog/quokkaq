'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Unit } from '@quokkaq/shared-types';
import * as orval from '@/lib/api/generated/units';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { PlaylistManager } from './signage/playlist-manager';
import { ScheduleEditor } from './signage/schedule-editor';
import { FeedConfig } from './signage/feed-config';
import { ScreenTemplateBuilder } from './signage/screen-template-builder';
import { SignageHealthPanel } from './signage/signage-health-panel';
import { ScreenFullscreenAnnouncementOverlay } from '@/components/screen/screen-fullscreen-announcement-overlay';

export function SignageSettings({
  unit,
  unitId
}: {
  unit: Unit;
  unitId: string;
}) {
  const t = useTranslations('admin.signage');
  const annDisplayLabelId = useId();
  const { data: announcementsRes, refetch: refetchAnn } =
    orval.useListSignageAnnouncements(unitId);
  const anns: orval.ModelsScreenAnnouncement[] = announcementsRes?.data ?? [];
  const [annText, setAnnText] = useState('');
  const [annDisplay, setAnnDisplay] = useState<'banner' | 'fullscreen'>(
    'banner'
  );
  const createAnn = orval.useCreateSignageAnnouncement();
  const deleteAnn = orval.useDeleteSignageAnnouncement();
  const onCreateAnn = async () => {
    if (!annText.trim()) {
      return;
    }
    const data = {
      text: annText.trim(),
      style: 'info',
      isActive: true,
      displayMode: annDisplay
    };
    if (
      !safeParseSignageWithToast(
        'Announcement',
        signageZod.createAnnouncement,
        data
      ).success
    ) {
      return;
    }
    try {
      await createAnn.mutateAsync({
        unitId,
        data: data as orval.HandlersAnnouncementRequest
      });
      setAnnText('');
      void refetchAnn();
    } catch (e) {
      toast.error(String(e));
    }
  };
  const onDeleteAnn = async (id: string) => {
    try {
      await deleteAnn.mutateAsync({ unitId, annId: id });
      void refetchAnn();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className='space-y-4'>
      <h2 className='text-2xl font-bold'>
        {t('title', { default: 'Digital Signage' })}
      </h2>
      <Tabs defaultValue='status'>
        <TabsList>
          <TabsTrigger value='status'>
            {t('tabs.status', { default: 'Status' })}
          </TabsTrigger>
          <TabsTrigger value='playlists'>
            {t('tabs.playlists', { default: 'Playlists' })}
          </TabsTrigger>
          <TabsTrigger value='schedules'>
            {t('tabs.schedules', { default: 'Schedules' })}
          </TabsTrigger>
          <TabsTrigger value='feeds'>
            {t('tabs.feeds', { default: 'Feeds' })}
          </TabsTrigger>
          <TabsTrigger value='layout'>
            {t('tabs.layout', { default: 'Layout' })}
          </TabsTrigger>
          <TabsTrigger value='announcements'>
            {t('tabs.announcements', { default: 'Ann.' })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='status' className='space-y-3'>
          <SignageHealthPanel unitId={unitId} />
        </TabsContent>
        <TabsContent value='playlists' className='space-y-3'>
          <PlaylistManager unit={unit} unitId={unitId} />
        </TabsContent>
        <TabsContent value='schedules' className='space-y-3'>
          <ScheduleEditor
            unitId={unitId}
            unitTimezone={unit.timezone ?? 'UTC'}
          />
        </TabsContent>
        <TabsContent value='feeds' className='space-y-3'>
          <FeedConfig unitId={unitId} />
        </TabsContent>
        <TabsContent value='layout' className='space-y-3'>
          <ScreenTemplateBuilder unit={unit} unitId={unitId} />
        </TabsContent>
        <TabsContent value='announcements' className='space-y-2'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Input
              className='min-w-0 flex-1'
              value={annText}
              onChange={(e) => setAnnText(e.target.value)}
              placeholder={t('annTextPlaceholder', {
                default: 'Announcement text'
              })}
            />
            <div className='text-muted-foreground flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,20rem)] sm:shrink-0'>
              <FieldLabel
                className='text-muted-foreground w-auto shrink-0 pe-0 text-sm'
                htmlFor={annDisplayLabelId}
              >
                {t('annDisplay', { default: 'Layout' })}
              </FieldLabel>
              <Select
                value={annDisplay}
                onValueChange={(v) => {
                  setAnnDisplay(v as 'banner' | 'fullscreen');
                }}
              >
                <SelectTrigger
                  id={annDisplayLabelId}
                  className='h-9 w-full min-w-0'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align='start'>
                  <SelectItem value='banner'>{t('annBanner')}</SelectItem>
                  <SelectItem value='fullscreen'>
                    {t('annFullscreen')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                void onCreateAnn();
              }}
            >
              {t('annAdd', { default: 'Add' })}
            </Button>
          </div>
          {annDisplay === 'fullscreen' && annText.trim() ? (
            <div className='space-y-1'>
              <p className='text-muted-foreground text-xs'>
                {t('annFullscreenPreview', {
                  default: 'Preview (not published)'
                })}
              </p>
              <ScreenFullscreenAnnouncementOverlay
                variant='embedded'
                items={[
                  {
                    id: 'preview',
                    text: annText.trim(),
                    style: 'info',
                    priority: 0
                  }
                ]}
              />
            </div>
          ) : null}
          <ul>
            {anns.map((a) => (
              <li
                key={a.id}
                className='flex items-start justify-between gap-2 text-sm'
              >
                <span>
                  {a.text}{' '}
                  <span className='text-muted-foreground text-xs'>
                    [{(a.displayMode || 'banner') as string}]
                  </span>
                </span>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    void onDeleteAnn(a.id!);
                  }}
                >
                  {t('annDelete', { default: 'Delete' })}
                </Button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}
