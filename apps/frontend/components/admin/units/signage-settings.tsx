'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Unit } from '@quokkaq/shared-types';
import * as orval from '@/lib/api/generated/units';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { PlaylistManager } from './signage/playlist-manager';
import { ScheduleEditor } from './signage/schedule-editor';
import { FeedConfig } from './signage/feed-config';
import { ScreenTemplateBuilder } from './signage/screen-template-builder';

export function SignageSettings({
  unit,
  unitId
}: {
  unit: Unit;
  unitId: string;
}) {
  const t = useTranslations('admin.signage');
  const { data: anns, refetch: refetchAnn } =
    orval.useListSignageAnnouncements(unitId);
  const [annText, setAnnText] = useState('');
  const createAnn = orval.useCreateSignageAnnouncement();
  const deleteAnn = orval.useDeleteSignageAnnouncement();
  const onCreateAnn = async () => {
    if (!annText.trim()) {
      return;
    }
    const data = { text: annText.trim(), style: 'info', isActive: true };
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
      <Tabs defaultValue='playlists'>
        <TabsList>
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
        <TabsContent value='playlists' className='space-y-3'>
          <PlaylistManager unit={unit} unitId={unitId} />
        </TabsContent>
        <TabsContent value='schedules' className='space-y-3'>
          <ScheduleEditor unitId={unitId} />
        </TabsContent>
        <TabsContent value='feeds' className='space-y-3'>
          <FeedConfig unitId={unitId} />
        </TabsContent>
        <TabsContent value='layout' className='space-y-3'>
          <ScreenTemplateBuilder unit={unit} unitId={unitId} />
        </TabsContent>
        <TabsContent value='announcements' className='space-y-2'>
          <div className='flex gap-2'>
            <Input
              className='flex-1'
              value={annText}
              onChange={(e) => setAnnText(e.target.value)}
              placeholder='Text'
            />
            <Button
              onClick={() => {
                void onCreateAnn();
              }}
            >
              Add
            </Button>
          </div>
          <ul>
            {(
              anns as
                | import('@/lib/api/generated/units').ModelsScreenAnnouncement[]
                | undefined
            )?.map((a) => (
              <li
                key={a.id}
                className='flex items-start justify-between gap-2 text-sm'
              >
                {a.text}
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    void onDeleteAnn(a.id!);
                  }}
                >
                  Del
                </Button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}
