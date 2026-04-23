'use client';

import { useEffect, useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { OneCIntegrationSettings } from '@/components/settings/onec-integration-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Link } from '@/src/i18n/navigation';
import {
  getGetPlatformIntegrationsQueryKey,
  getGetSaaSOperatorCompanyQueryKey,
  getPlatformIntegrations,
  getSaaSOperatorCompany,
  patchPlatformIntegrations,
  type HandlersPlatformIntegrationsResponse,
  type ServicesDeploymentSaaSSettingsPatch
} from '@/lib/api/generated/platform';
import {
  API_BASE_URL,
  authenticatedApiFetch
} from '@/lib/authenticated-api-fetch';

type PlatformIntegrationsFormValues = {
  leadsTrackerQueue: string;
  trackerTypeRegistration: string;
  trackerTypeRequest: string;
  trackerTypeError: string;
  supportTrackerQueue: string;
  trackerTypeSupport: string;
  smsProvider: string;
  smsApiKey: string;
  smsApiSecret: string;
  smsFromName: string;
  smsEnabled: boolean;
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
    trackerTypeSupport: data.trackerTypeSupport ?? '',
    smsProvider:
      (data as PlatformIntegrationsFormValues & { smsProvider?: string })
        .smsProvider ?? 'none',
    smsApiKey: '',
    smsApiSecret: '',
    smsFromName:
      (data as PlatformIntegrationsFormValues & { smsFromName?: string })
        .smsFromName ?? '',
    smsEnabled:
      (data as PlatformIntegrationsFormValues & { smsEnabled?: boolean })
        .smsEnabled ?? false
  };
}

function PlatformIntegrationsForm({
  data
}: {
  data: HandlersPlatformIntegrationsResponse;
}) {
  const t = useTranslations('platform.integrations');
  const [integrationsTab, setIntegrationsTab] = useState('tracker');
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
        trackerTypeSupport: values.trackerTypeSupport ?? '',
        smsProvider:
          values.smsProvider === 'none'
            ? undefined
            : values.smsProvider || undefined,
        smsApiKey: values.smsApiKey || undefined,
        smsApiSecret: values.smsApiSecret || undefined,
        smsFromName: values.smsFromName || undefined,
        smsEnabled: values.smsEnabled
      } as ServicesDeploymentSaaSSettingsPatch),
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

  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [smsTestLoading, setSmsTestLoading] = useState(false);

  const handleTestSMS = async () => {
    if (!smsTestPhone.trim()) return;
    setSmsTestLoading(true);
    try {
      const res = await authenticatedApiFetch(
        `${API_BASE_URL}/platform/integrations/sms/test`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: smsTestPhone })
        }
      );
      if (!res.ok) {
        const text = await res.text();
        toast.error(t('smsTestError') + ': ' + text);
        return;
      }
      const json = (await res.json()) as { provider?: string };
      toast.success(t('smsTestSuccess', { provider: json.provider ?? '' }));
    } catch {
      toast.error(t('smsTestError'));
    } finally {
      setSmsTestLoading(false);
    }
  };

  return (
    <Tabs
      value={integrationsTab}
      onValueChange={setIntegrationsTab}
      className='max-w-2xl'
    >
      <TabsList className='grid w-full max-w-2xl grid-cols-4'>
        <TabsTrigger value='tracker'>{t('tabTracker')}</TabsTrigger>
        <TabsTrigger value='support'>{t('tabSupport')}</TabsTrigger>
        <TabsTrigger value='sms'>{t('tabSMS')}</TabsTrigger>
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
        <TabsContent value='sms' className='mt-6 space-y-6'>
          <p className='text-muted-foreground text-sm'>{t('smsIntro')}</p>

          <FormField
            control={form.control}
            name='smsProvider'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('smsProvider')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('smsProviderPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='none'>
                      {t('smsProviderDisabled')}
                    </SelectItem>
                    <SelectItem value='smsc'>{t('smsProviderSMSC')}</SelectItem>
                    <SelectItem value='smsru'>
                      {t('smsProviderSMSRu')}
                    </SelectItem>
                    <SelectItem value='smsaero'>
                      {t('smsProviderSMSAero')}
                    </SelectItem>
                    <SelectItem value='twilio'>
                      {t('smsProviderTwilio')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='smsApiKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('smsApiKey')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='password'
                    autoComplete='off'
                    placeholder='•••••••••••••'
                  />
                </FormControl>
                <FormDescription>{t('smsApiKeyHint')}</FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='smsApiSecret'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('smsApiSecret')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='password'
                    autoComplete='off'
                    placeholder='•••••••••••••'
                  />
                </FormControl>
                <FormDescription>{t('smsApiSecretHint')}</FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='smsFromName'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('smsFromName')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormDescription>{t('smsFromNameHint')}</FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='smsEnabled'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center gap-3'>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <Label className='cursor-pointer'>{t('smsEnabled')}</Label>
              </FormItem>
            )}
          />

          <Button type='button' disabled={mutation.isPending} onClick={onSave}>
            {mutation.isPending ? <Spinner className='size-4' /> : t('save')}
          </Button>

          <div className='border-t pt-6'>
            <p className='mb-3 text-sm font-medium'>{t('smsTestButton')}</p>
            <div className='flex gap-2'>
              <Input
                value={smsTestPhone}
                onChange={(e) => setSmsTestPhone(e.target.value)}
                placeholder={t('smsTestPhonePlaceholder')}
                className='max-w-xs'
              />
              <Button
                type='button'
                variant='outline'
                onClick={handleTestSMS}
                disabled={smsTestLoading || !smsTestPhone.trim()}
              >
                {smsTestLoading ? (
                  <Spinner className='size-4' />
                ) : (
                  t('smsTestButton')
                )}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Form>
      <PlatformOneCSaaSOperatorTab active={integrationsTab === 'onec'} />
    </Tabs>
  );
}

type SaaSOperatorTabState =
  | { kind: 'ok'; companyId: string }
  | { kind: 'none' };

function PlatformOneCSaaSOperatorTab({ active }: { active: boolean }) {
  const t = useTranslations('platform.integrations');
  const operatorQ = useQuery({
    queryKey: getGetSaaSOperatorCompanyQueryKey(),
    enabled: active,
    queryFn: async (): Promise<SaaSOperatorTabState> => {
      const res = await getSaaSOperatorCompany();
      if (res.status === 200 && res.data?.id) {
        return { kind: 'ok', companyId: res.data.id };
      }
      if (res.status === 404) {
        return { kind: 'none' };
      }
      throw new Error('load');
    }
  });

  return (
    <TabsContent value='onec' className='mt-6 max-w-2xl space-y-6'>
      <p className='text-muted-foreground text-sm'>{t('onecIntro')}</p>
      {operatorQ.isLoading ? (
        <p className='text-muted-foreground text-sm'>
          {t('onecOperatorLoading')}
        </p>
      ) : operatorQ.isError ? (
        <p className='text-destructive text-sm'>{t('onecOperatorLoadError')}</p>
      ) : operatorQ.data?.kind === 'none' ? (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            {t('onecOperatorMissing')}
          </p>
          <Button variant='outline' size='sm' asChild>
            <Link href='/platform/companies'>
              {t('onecOperatorOpenCompanies')}
            </Link>
          </Button>
        </div>
      ) : operatorQ.data?.kind === 'ok' ? (
        <OneCIntegrationSettings platformCompanyId={operatorQ.data.companyId} />
      ) : null}
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
