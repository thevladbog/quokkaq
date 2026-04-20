'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { OneCIntegrationSettings } from '@/components/settings/onec-integration-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel
} from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  getGetPlatformIntegrationsQueryKey,
  getPlatformIntegrations,
  listCompanies,
  patchPlatformIntegrations,
  type HandlersPlatformIntegrationsResponse,
  type ServicesDeploymentSaaSSettingsPatch
} from '@/lib/api/generated/platform';

type PlatformIntegrationsFormValues = {
  leadsTrackerQueue: string;
  trackerTypeRegistration: string;
  trackerTypeRequest: string;
  trackerTypeError: string;
  supportTrackerQueue: string;
  trackerTypeSupport: string;
};

function toFormValues(
  data: HandlersPlatformIntegrationsResponse
): PlatformIntegrationsFormValues {
  return {
    leadsTrackerQueue: data.leadsTrackerQueue ?? '',
    trackerTypeRegistration: data.trackerTypeRegistration ?? '',
    trackerTypeRequest: data.trackerTypeRequest ?? '',
    trackerTypeError: data.trackerTypeError ?? '',
    supportTrackerQueue: data.supportTrackerQueue ?? '',
    trackerTypeSupport: data.trackerTypeSupport ?? ''
  };
}

function PlatformIntegrationsForm({
  data
}: {
  data: HandlersPlatformIntegrationsResponse;
}) {
  const t = useTranslations('platform.integrations');
  const queryClient = useQueryClient();

  const form = useForm<PlatformIntegrationsFormValues>({
    defaultValues: toFormValues(data)
  });
  const { reset, control } = form;
  const { isDirty } = useFormState({ control });

  useEffect(() => {
    if (!isDirty) {
      reset(toFormValues(data));
    }
  }, [data, isDirty, reset]);

  const mutation = useMutation({
    mutationFn: async (values: PlatformIntegrationsFormValues) =>
      patchPlatformIntegrations({
        leadsTrackerQueue: values.leadsTrackerQueue ?? '',
        trackerTypeRegistration: values.trackerTypeRegistration ?? '',
        trackerTypeRequest: values.trackerTypeRequest ?? '',
        trackerTypeError: values.trackerTypeError ?? '',
        supportTrackerQueue: values.supportTrackerQueue ?? '',
        trackerTypeSupport: values.trackerTypeSupport ?? ''
      } satisfies ServicesDeploymentSaaSSettingsPatch),
    onSuccess: (res) => {
      if (res.status === 200 && res.data) {
        toast.success(t('saved'));
        void queryClient.invalidateQueries({
          queryKey: getGetPlatformIntegrationsQueryKey()
        });
        reset(toFormValues(res.data));
      } else {
        toast.error(t('saveError'));
      }
    },
    onError: () => toast.error(t('saveError'))
  });

  const onSave = form.handleSubmit((values) => {
    mutation.mutate(values);
  });

  return (
    <Tabs defaultValue='tracker' className='max-w-2xl'>
      <TabsList className='grid w-full max-w-2xl grid-cols-3'>
        <TabsTrigger value='tracker'>{t('tabTracker')}</TabsTrigger>
        <TabsTrigger value='support'>{t('tabSupport')}</TabsTrigger>
        <TabsTrigger value='onec'>{t('tabOneC')}</TabsTrigger>
      </TabsList>
      <Form {...form}>
        <TabsContent value='tracker' className='mt-6 space-y-6'>
          <p className='text-muted-foreground text-sm'>{t('trackerIntro')}</p>
          <FormField
            control={form.control}
            name='leadsTrackerQueue'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('leadsQueue')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormDescription>{t('leadsQueueHint')}</FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='trackerTypeRegistration'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('typeRegistration')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormDescription>{t('typeHint')}</FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='trackerTypeRequest'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('typeRequest')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormDescription>{t('typeHint')}</FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='trackerTypeError'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('typeError')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormDescription>{t('typeHint')}</FormDescription>
              </FormItem>
            )}
          />
          <Button type='button' disabled={mutation.isPending} onClick={onSave}>
            {mutation.isPending ? <Spinner className='size-4' /> : t('save')}
          </Button>
        </TabsContent>
        <TabsContent value='support' className='mt-6 space-y-6'>
          <p className='text-muted-foreground text-sm'>{t('supportIntro')}</p>
          <FormField
            control={form.control}
            name='supportTrackerQueue'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('supportQueue')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormDescription>{t('supportQueueHint')}</FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='trackerTypeSupport'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('typeSupport')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormDescription>{t('typeHint')}</FormDescription>
              </FormItem>
            )}
          />
          <Button type='button' disabled={mutation.isPending} onClick={onSave}>
            {mutation.isPending ? <Spinner className='size-4' /> : t('save')}
          </Button>
        </TabsContent>
      </Form>
      <PlatformOneCIntegrationsTab />
    </Tabs>
  );
}

function PlatformOneCIntegrationsTab() {
  const t = useTranslations('platform.integrations');
  /** When null, the first company in the list is used until the user picks another. */
  const [overrideCompanyId, setOverrideCompanyId] = useState<string | null>(
    null
  );

  const companiesQ = useQuery({
    queryKey: ['platform', 'companies', 'integrations-picker'],
    queryFn: async () => {
      const res = await listCompanies({ limit: 100, offset: 0 });
      if (res.status !== 200 || !res.data) {
        throw new Error('load');
      }
      return res.data;
    }
  });

  const companies = useMemo(
    () =>
      [...(companiesQ.data?.items ?? [])]
        .filter((c): c is typeof c & { id: string } => Boolean(c.id))
        .sort((a, b) =>
          (a.name ?? '').localeCompare(b.name ?? '', undefined, {
            sensitivity: 'base'
          })
        ),
    [companiesQ.data?.items]
  );

  const companyId = overrideCompanyId ?? companies[0]?.id ?? '';

  return (
    <TabsContent value='onec' className='mt-6 max-w-2xl space-y-6'>
      <p className='text-muted-foreground text-sm'>{t('onecIntro')}</p>
      {companiesQ.isLoading ? (
        <p className='text-muted-foreground text-sm'>
          {t('onecCompaniesLoading')}
        </p>
      ) : companiesQ.isError ? (
        <p className='text-destructive text-sm'>
          {t('onecCompaniesLoadError')}
        </p>
      ) : (
        <div className='space-y-2'>
          <Label htmlFor='platform-onec-company'>{t('onecCompanyLabel')}</Label>
          <Select
            value={companyId || undefined}
            onValueChange={setOverrideCompanyId}
          >
            <SelectTrigger id='platform-onec-company' className='max-w-md'>
              <SelectValue placeholder={t('onecCompanyPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name ?? c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {companyId ? (
        <OneCIntegrationSettings platformCompanyId={companyId} />
      ) : (
        !companiesQ.isLoading &&
        !companiesQ.isError && (
          <p className='text-muted-foreground text-sm'>
            {t('onecSelectCompanyHint')}
          </p>
        )
      )}
      <p className='text-muted-foreground text-xs'>{t('onecDocHint')}</p>
    </TabsContent>
  );
}

export default function PlatformIntegrationsPage() {
  const t = useTranslations('platform.integrations');
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

  if (!q.data) {
    return null;
  }

  return (
    <div>
      <h1 className='mb-2 text-3xl font-bold'>{t('title')}</h1>
      <p className='text-muted-foreground mb-8 max-w-2xl'>{t('subtitle')}</p>

      <PlatformIntegrationsForm data={q.data} />
    </div>
  );
}
