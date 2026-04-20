'use client';

import { useEffect, useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel
} from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/src/i18n/navigation';
import { useAuthContext } from '@/contexts/AuthContext';
import { useLogin } from '@/lib/hooks';
import {
  getGetPlatformIntegrationsQueryKey,
  getPlatformIntegrations,
  patchPlatformIntegrations,
  type HandlersPlatformIntegrationsResponse,
  type ServicesDeploymentSaaSSettingsPatch
} from '@/lib/api/generated/platform';

const SETUP_TOKEN_STORAGE_KEY = 'quokkaq_setup_token';

type HealthCheck = { ok: boolean; message?: string };
type HealthReport = {
  ok: boolean;
  checks: Record<string, HealthCheck>;
};

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const j: unknown = await res.json();
    if (j && typeof j === 'object' && 'error' in j) {
      const e = (j as { error?: unknown }).error;
      if (typeof e === 'string') return e;
    }
  } catch {
    /* ignore */
  }
  return res.statusText || 'Request failed';
}

function setupHeaders(): HeadersInit {
  const h: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const t = sessionStorage.getItem(SETUP_TOKEN_STORAGE_KEY)?.trim();
    if (t) h['X-Setup-Token'] = t;
  }
  return h;
}

type BootstrapForm = {
  companyName: string;
  unitName: string;
  timezone: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type IntegrationsFormValues = {
  leadsTrackerQueue: string;
  trackerTypeRegistration: string;
  trackerTypeRequest: string;
  trackerTypeError: string;
  supportTrackerQueue: string;
  trackerTypeSupport: string;
};

function toIntegrationForm(
  data: HandlersPlatformIntegrationsResponse
): IntegrationsFormValues {
  return {
    leadsTrackerQueue: data.leadsTrackerQueue ?? '',
    trackerTypeRegistration: data.trackerTypeRegistration ?? '',
    trackerTypeRequest: data.trackerTypeRequest ?? '',
    trackerTypeError: data.trackerTypeError ?? '',
    supportTrackerQueue: data.supportTrackerQueue ?? '',
    trackerTypeSupport: data.trackerTypeSupport ?? ''
  };
}

export function SaasSetupWizard() {
  const t = useTranslations('setup.wizard');
  const tp = useTranslations('platform.integrations');
  const router = useRouter();
  const { login } = useAuthContext();
  const loginMutation = useLogin();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [setupTokenInput, setSetupTokenInput] = useState('');
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [bootstrapError, setBootstrapError] = useState('');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(SETUP_TOKEN_STORAGE_KEY);
    if (saved) setSetupTokenInput(saved);
  }, []);

  const persistToken = () => {
    const v = setupTokenInput.trim();
    if (v) sessionStorage.setItem(SETUP_TOKEN_STORAGE_KEY, v);
    else sessionStorage.removeItem(SETUP_TOKEN_STORAGE_KEY);
  };

  const runHealth = async () => {
    persistToken();
    setHealthError('');
    setHealthLoading(true);
    try {
      const res = await fetch('/api/system/health', {
        headers: setupHeaders()
      });
      if (!res.ok) {
        setHealthError(await readErrorMessage(res));
        setHealth(null);
        return;
      }
      setHealth((await res.json()) as HealthReport);
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : String(e));
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  const bootstrapForm = useForm<BootstrapForm>({
    defaultValues: {
      companyName: '',
      unitName: '',
      timezone: 'Europe/Moscow',
      name: '',
      email: '',
      password: '',
      confirmPassword: ''
    }
  });

  const onBootstrap = bootstrapForm.handleSubmit(async (values) => {
    if (values.password !== values.confirmPassword) {
      setBootstrapError(t('passwordsMismatch'));
      return;
    }
    persistToken();
    setBootstrapError('');
    setBootstrapLoading(true);
    try {
      let res: Response;
      try {
        res = await fetch('/api/system/setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...setupHeaders()
          },
          body: JSON.stringify({
            companyName: values.companyName,
            unitName: values.unitName || undefined,
            timezone: values.timezone || undefined,
            name: values.name,
            email: values.email,
            password: values.password
          })
        });
      } catch (fetchErr) {
        setBootstrapError(
          fetchErr instanceof Error
            ? fetchErr.message
            : t('bootstrapRequestFailed')
        );
        return;
      }
      if (!res.ok) {
        setBootstrapError(await readErrorMessage(res));
        return;
      }
      try {
        const auth = await loginMutation.mutateAsync({
          email: values.email,
          password: values.password
        });
        if (auth?.accessToken) {
          await login(auth.accessToken);
        }
        sessionStorage.removeItem(SETUP_TOKEN_STORAGE_KEY);
      } catch (loginErr) {
        console.error(loginErr);
        toast.error(t('loginAfterBootstrapFailed'));
      }
      setStep(2);
    } finally {
      setBootstrapLoading(false);
    }
  });

  const integrationsQuery = useQuery({
    queryKey: getGetPlatformIntegrationsQueryKey(),
    enabled: step === 2,
    queryFn: async () => {
      const res = await getPlatformIntegrations();
      if (res.status !== 200 || !res.data) {
        throw new Error(t('integrationsLoadFailed'));
      }
      return res.data;
    }
  });

  const intForm = useForm<IntegrationsFormValues>({
    defaultValues: {
      leadsTrackerQueue: '',
      trackerTypeRegistration: '',
      trackerTypeRequest: '',
      trackerTypeError: '',
      supportTrackerQueue: '',
      trackerTypeSupport: ''
    }
  });
  const { reset, control } = intForm;
  const { isDirty } = useFormState({ control });

  useEffect(() => {
    const d = integrationsQuery.data;
    if (!d || isDirty) return;
    reset(toIntegrationForm(d));
  }, [integrationsQuery.data, isDirty, reset]);

  const integrationsMutation = useMutation({
    mutationFn: async (values: IntegrationsFormValues) =>
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
        toast.success(tp('saved'));
        void queryClient.invalidateQueries({
          queryKey: getGetPlatformIntegrationsQueryKey()
        });
        reset(toIntegrationForm(res.data));
        setStep(3);
      } else {
        toast.error(tp('saveError'));
      }
    },
    onError: () => toast.error(tp('saveError'))
  });

  const stepLabels = [
    t('stepHealth'),
    t('stepBootstrap'),
    t('stepIntegrations'),
    t('stepDone')
  ];

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900'>
      <Card className='w-full max-w-lg'>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
          <div className='text-muted-foreground flex flex-wrap gap-2 pt-2 text-xs'>
            {stepLabels.map((label, i) => (
              <span
                key={label}
                className={
                  i === step
                    ? 'text-primary font-medium'
                    : i < step
                      ? 'text-green-600 dark:text-green-400'
                      : ''
                }
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent className='space-y-6'>
          {step === 0 && (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='setupToken'>{t('setupTokenLabel')}</Label>
                <Input
                  id='setupToken'
                  type='password'
                  autoComplete='off'
                  value={setupTokenInput}
                  onChange={(e) => setSetupTokenInput(e.target.value)}
                  placeholder={t('setupTokenPlaceholder')}
                />
                <p className='text-muted-foreground text-xs'>
                  {t('setupTokenHint')}
                </p>
              </div>
              {healthError && (
                <Alert variant='destructive'>
                  <AlertDescription>{healthError}</AlertDescription>
                </Alert>
              )}
              {health && (
                <div className='space-y-2 rounded-md border p-3 text-sm'>
                  <div className='font-medium'>
                    {t('overall')}:{' '}
                    {health.ok ? t('checksOk') : t('checksDegraded')}
                  </div>
                  {Object.entries(health.checks).map(([k, v]) => (
                    <div key={k} className='flex justify-between gap-2'>
                      <span className='capitalize'>{k}</span>
                      <span
                        className={v.ok ? 'text-green-600' : 'text-destructive'}
                      >
                        {v.ok ? 'OK' : v.message || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='secondary'
                  onClick={runHealth}
                  disabled={healthLoading}
                >
                  {healthLoading ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      {t('runningChecks')}
                    </>
                  ) : (
                    t('runChecks')
                  )}
                </Button>
                <Button
                  type='button'
                  onClick={() => setStep(1)}
                  disabled={healthLoading}
                >
                  {t('continue')}
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <form className='space-y-4' onSubmit={onBootstrap}>
              {bootstrapError && (
                <Alert variant='destructive'>
                  <AlertDescription>{bootstrapError}</AlertDescription>
                </Alert>
              )}
              <div className='space-y-2'>
                <Label htmlFor='companyName'>{t('companyName')}</Label>
                <Input
                  id='companyName'
                  {...bootstrapForm.register('companyName', { required: true })}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='unitName'>{t('unitName')}</Label>
                <Input
                  id='unitName'
                  {...bootstrapForm.register('unitName')}
                  placeholder={t('unitNamePlaceholder')}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='timezone'>{t('timezone')}</Label>
                <Input id='timezone' {...bootstrapForm.register('timezone')} />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='adminName'>{t('adminName')}</Label>
                <Input
                  id='adminName'
                  {...bootstrapForm.register('name', { required: true })}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='adminEmail'>{t('adminEmail')}</Label>
                <Input
                  id='adminEmail'
                  type='email'
                  {...bootstrapForm.register('email', { required: true })}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='pw'>{t('password')}</Label>
                <Input
                  id='pw'
                  type='password'
                  {...bootstrapForm.register('password', { required: true })}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='pw2'>{t('confirmPassword')}</Label>
                <Input
                  id='pw2'
                  type='password'
                  {...bootstrapForm.register('confirmPassword', {
                    required: true
                  })}
                />
              </div>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setStep(0)}
                >
                  {t('back')}
                </Button>
                <Button type='submit' disabled={bootstrapLoading}>
                  {bootstrapLoading ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      {t('creating')}
                    </>
                  ) : (
                    t('createDeployment')
                  )}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className='space-y-4'>
              {integrationsQuery.isLoading && (
                <div className='flex justify-center py-8'>
                  <Spinner className='size-8' />
                </div>
              )}
              {integrationsQuery.isError && (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {integrationsQuery.error instanceof Error
                      ? integrationsQuery.error.message
                      : t('integrationsLoadFailed')}
                  </AlertDescription>
                </Alert>
              )}
              {integrationsQuery.data && (
                <Form {...intForm}>
                  <Tabs defaultValue='tracker'>
                    <TabsList className='grid w-full grid-cols-2'>
                      <TabsTrigger value='tracker'>
                        {tp('tabTracker')}
                      </TabsTrigger>
                      <TabsTrigger value='support'>
                        {tp('tabSupport')}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value='tracker' className='mt-4 space-y-4'>
                      <p className='text-muted-foreground text-sm'>
                        {tp('trackerIntro')}
                      </p>
                      <FormField
                        control={intForm.control}
                        name='leadsTrackerQueue'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tp('leadsQueue')}</FormLabel>
                            <FormControl>
                              <Input {...field} autoComplete='off' />
                            </FormControl>
                            <FormDescription>
                              {tp('leadsQueueHint')}
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={intForm.control}
                        name='trackerTypeRegistration'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tp('typeRegistration')}</FormLabel>
                            <FormControl>
                              <Input {...field} autoComplete='off' />
                            </FormControl>
                            <FormDescription>{tp('typeHint')}</FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={intForm.control}
                        name='trackerTypeRequest'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tp('typeRequest')}</FormLabel>
                            <FormControl>
                              <Input {...field} autoComplete='off' />
                            </FormControl>
                            <FormDescription>{tp('typeHint')}</FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={intForm.control}
                        name='trackerTypeError'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tp('typeError')}</FormLabel>
                            <FormControl>
                              <Input {...field} autoComplete='off' />
                            </FormControl>
                            <FormDescription>{tp('typeHint')}</FormDescription>
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                    <TabsContent value='support' className='mt-4 space-y-4'>
                      <p className='text-muted-foreground text-sm'>
                        {tp('supportIntro')}
                      </p>
                      <FormField
                        control={intForm.control}
                        name='supportTrackerQueue'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tp('supportQueue')}</FormLabel>
                            <FormControl>
                              <Input {...field} autoComplete='off' />
                            </FormControl>
                            <FormDescription>
                              {tp('supportQueueHint')}
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={intForm.control}
                        name='trackerTypeSupport'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tp('typeSupport')}</FormLabel>
                            <FormControl>
                              <Input {...field} autoComplete='off' />
                            </FormControl>
                            <FormDescription>{tp('typeHint')}</FormDescription>
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                  </Tabs>
                  <div className='mt-4 flex gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setStep(1)}
                    >
                      {t('back')}
                    </Button>
                    <Button
                      type='button'
                      disabled={integrationsMutation.isPending}
                      onClick={intForm.handleSubmit((vals) =>
                        integrationsMutation.mutate(vals)
                      )}
                    >
                      {integrationsMutation.isPending ? (
                        <Spinner className='size-4' />
                      ) : (
                        t('saveAndFinish')
                      )}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      onClick={() => setStep(3)}
                    >
                      {t('skipIntegrations')}
                    </Button>
                  </div>
                </Form>
              )}
            </div>
          )}

          {step === 3 && (
            <div className='space-y-4 text-center'>
              <p className='text-muted-foreground text-sm'>{t('doneHint')}</p>
              <Button type='button' onClick={() => router.push('/platform')}>
                {t('openPlatform')}
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className='text-muted-foreground justify-center text-xs'>
          {t('footerHint')}
        </CardFooter>
      </Card>
    </div>
  );
}
