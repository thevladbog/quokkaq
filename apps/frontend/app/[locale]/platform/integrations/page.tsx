'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getGetPlatformIntegrationsQueryKey,
  getPlatformIntegrations,
  patchPlatformIntegrations,
  type HandlersPlatformIntegrationsResponse
} from '@/lib/api/generated/platform';

export default function PlatformIntegrationsPage() {
  const t = useTranslations('platform.integrations');
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: getGetPlatformIntegrationsQueryKey(),
    queryFn: async () => {
      const res = await getPlatformIntegrations();
      if (res.status !== 200) {
        throw new Error('load');
      }
      return res.data;
    }
  });

  const [form, setForm] = useState<HandlersPlatformIntegrationsResponse>({
    leadsTrackerQueue: '',
    trackerTypeRegistration: '',
    trackerTypeRequest: '',
    trackerTypeError: '',
    supportTrackerQueue: '',
    trackerTypeSupport: ''
  });

  useEffect(() => {
    if (q.data) {
      // Sync local fields after GET; controlled form from query alone would overwrite on every keystroke.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- form defaults from server load
      setForm({
        leadsTrackerQueue: q.data.leadsTrackerQueue ?? '',
        trackerTypeRegistration: q.data.trackerTypeRegistration ?? '',
        trackerTypeRequest: q.data.trackerTypeRequest ?? '',
        trackerTypeError: q.data.trackerTypeError ?? '',
        supportTrackerQueue: q.data.supportTrackerQueue ?? '',
        trackerTypeSupport: q.data.trackerTypeSupport ?? ''
      });
    }
  }, [q.data]);

  const mutation = useMutation({
    mutationFn: async () =>
      patchPlatformIntegrations({
        leadsTrackerQueue: form.leadsTrackerQueue ?? '',
        trackerTypeRegistration: form.trackerTypeRegistration ?? '',
        trackerTypeRequest: form.trackerTypeRequest ?? '',
        trackerTypeError: form.trackerTypeError ?? '',
        supportTrackerQueue: form.supportTrackerQueue ?? '',
        trackerTypeSupport: form.trackerTypeSupport ?? ''
      } satisfies HandlersPlatformIntegrationsResponse),
    onSuccess: (res) => {
      if (res.status === 200 && res.data) {
        toast.success(t('saved'));
        void queryClient.invalidateQueries({
          queryKey: getGetPlatformIntegrationsQueryKey()
        });
      } else {
        toast.error(t('saveError'));
      }
    },
    onError: () => toast.error(t('saveError'))
  });

  if (q.isLoading) {
    return (
      <div className='flex justify-center py-16'>
        <Spinner className='h-10 w-10' />
      </div>
    );
  }

  if (q.isError) {
    return <p className='text-destructive text-sm'>{t('loadError')}</p>;
  }

  return (
    <div>
      <h1 className='mb-2 text-3xl font-bold'>{t('title')}</h1>
      <p className='text-muted-foreground mb-8 max-w-2xl'>{t('subtitle')}</p>

      <Tabs defaultValue='tracker' className='max-w-2xl'>
        <TabsList className='grid w-full max-w-md grid-cols-2'>
          <TabsTrigger value='tracker'>{t('tabTracker')}</TabsTrigger>
          <TabsTrigger value='support'>{t('tabSupport')}</TabsTrigger>
        </TabsList>
        <TabsContent value='tracker' className='mt-6 space-y-6'>
          <p className='text-muted-foreground text-sm'>{t('trackerIntro')}</p>
          <div className='space-y-2'>
            <Label htmlFor='leads-queue'>{t('leadsQueue')}</Label>
            <Input
              id='leads-queue'
              value={form.leadsTrackerQueue ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, leadsTrackerQueue: e.target.value }))
              }
              autoComplete='off'
            />
            <p className='text-muted-foreground text-xs'>
              {t('leadsQueueHint')}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='type-reg'>{t('typeRegistration')}</Label>
            <Input
              id='type-reg'
              value={form.trackerTypeRegistration ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  trackerTypeRegistration: e.target.value
                }))
              }
              autoComplete='off'
            />
            <p className='text-muted-foreground text-xs'>{t('typeHint')}</p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='type-req'>{t('typeRequest')}</Label>
            <Input
              id='type-req'
              value={form.trackerTypeRequest ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, trackerTypeRequest: e.target.value }))
              }
              autoComplete='off'
            />
            <p className='text-muted-foreground text-xs'>{t('typeHint')}</p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='type-err'>{t('typeError')}</Label>
            <Input
              id='type-err'
              value={form.trackerTypeError ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, trackerTypeError: e.target.value }))
              }
              autoComplete='off'
            />
            <p className='text-muted-foreground text-xs'>{t('typeHint')}</p>
          </div>
          <Button
            type='button'
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Spinner className='size-4' /> : t('save')}
          </Button>
        </TabsContent>
        <TabsContent value='support' className='mt-6 space-y-6'>
          <p className='text-muted-foreground text-sm'>{t('supportIntro')}</p>
          <div className='space-y-2'>
            <Label htmlFor='support-queue'>{t('supportQueue')}</Label>
            <Input
              id='support-queue'
              value={form.supportTrackerQueue ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  supportTrackerQueue: e.target.value
                }))
              }
              autoComplete='off'
            />
            <p className='text-muted-foreground text-xs'>
              {t('supportQueueHint')}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='type-support'>{t('typeSupport')}</Label>
            <Input
              id='type-support'
              value={form.trackerTypeSupport ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  trackerTypeSupport: e.target.value
                }))
              }
              autoComplete='off'
            />
            <p className='text-muted-foreground text-xs'>{t('typeHint')}</p>
          </div>
          <Button
            type='button'
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Spinner className='size-4' /> : t('save')}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
