'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import {
  getGetCompaniesMeIntegrationApiKeysQueryKey,
  getGetCompaniesMeWebhookEndpointsQueryKey,
  getGetCompaniesMeWebhookDeliveryLogsQueryKey,
  getGetCompaniesMePublicQueueWidgetSettingsQueryKey,
  getCompaniesMeIntegrationApiKeys,
  getCompaniesMeWebhookEndpoints,
  getCompaniesMeWebhookDeliveryLogs,
  getCompaniesMePublicQueueWidgetSettings,
  postCompaniesMeIntegrationApiKeys,
  postCompaniesMeWebhookEndpoints,
  postCompaniesMeWebhookEndpointsIdTest,
  postCompaniesMeWebhookEndpointsIdRotateSecret,
  postCompaniesMePublicWidgetToken,
  patchCompaniesMeWebhookEndpointsId,
  patchCompaniesMePublicQueueWidgetSettings,
  deleteCompaniesMeIntegrationApiKeysId,
  deleteCompaniesMeWebhookEndpointsId
} from '@/lib/api/generated/auth';
import type {
  HandlersCreateIntegrationAPIKeyRequest,
  HandlersCreateWebhookEndpointRequest,
  HandlersIntegrationAPIKeyRowDTO,
  HandlersIssuePublicWidgetTokenRequest,
  HandlersPatchWebhookEndpointRequest,
  HandlersPublicQueueWidgetSettingsDTO,
  HandlersWebhookDeliveryLogDTO,
  HandlersWebhookEndpointDTO
} from '@/lib/api/generated/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { getUnitDisplayName } from '@/lib/unit-display';
import { isApiHttpError } from '@/lib/api-errors';
import { messages, type Locale } from '@/i18n';

type UnitOpt = { id: string; name: string; nameEn?: string | null };

export type IntegrationPlanCapabilities = {
  apiAccess: boolean;
  outboundWebhooks: boolean;
  publicQueueWidget: boolean;
};

export function DeveloperApiIntegrations({
  locale,
  unitOptions,
  planCapabilities,
  publicApiUrl
}: {
  locale: string;
  unitOptions: UnitOpt[];
  planCapabilities: IntegrationPlanCapabilities;
  publicApiUrl?: string;
}) {
  const t = useTranslations('admin.integrations');
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState('');
  const [scopeRead, setScopeRead] = useState(true);
  const [scopeWrite, setScopeWrite] = useState(false);
  const [keyUnit, setKeyUnit] = useState<string>('all');
  const [newToken, setNewToken] = useState<string | null>(null);

  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState('ticket.created\nticket.called');
  const [whUnit, setWhUnit] = useState<string>('all');
  const [newSigningSecret, setNewSigningSecret] = useState<string | null>(null);
  const [widgetUnit, setWidgetUnit] = useState<string>('all');
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  /** `null` = show server value from query; string = user-edited draft */
  const [widgetOriginsDraft, setWidgetOriginsDraft] = useState<string | null>(
    null
  );
  const [whEditOpen, setWhEditOpen] = useState(false);
  const [whEditId, setWhEditId] = useState<string | null>(null);
  const [whEditUrl, setWhEditUrl] = useState('');
  const [whEditEvents, setWhEditEvents] = useState('');
  const [whEditEnabled, setWhEditEnabled] = useState(true);
  const [rotatedSigningSecret, setRotatedSigningSecret] = useState<
    string | null
  >(null);

  const keysQ = useQuery({
    queryKey: getGetCompaniesMeIntegrationApiKeysQueryKey(),
    queryFn: () => getCompaniesMeIntegrationApiKeys(),
    enabled: planCapabilities.apiAccess
  });

  const hooksQ = useQuery({
    queryKey: getGetCompaniesMeWebhookEndpointsQueryKey(),
    queryFn: () => getCompaniesMeWebhookEndpoints(),
    enabled: planCapabilities.outboundWebhooks
  });

  const widgetSettingsQ = useQuery({
    queryKey: getGetCompaniesMePublicQueueWidgetSettingsQueryKey(),
    queryFn: () => getCompaniesMePublicQueueWidgetSettings(),
    enabled: planCapabilities.publicQueueWidget
  });

  const serverWidgetOriginsText = useMemo(() => {
    const d = widgetSettingsQ.data;
    if (
      d?.status === 200 &&
      d.data &&
      Array.isArray(
        (d.data as HandlersPublicQueueWidgetSettingsDTO).allowedOrigins
      )
    ) {
      return (
        (d.data as HandlersPublicQueueWidgetSettingsDTO)
          .allowedOrigins as string[]
      ).join('\n');
    }
    return '';
  }, [widgetSettingsQ.data]);

  const widgetOriginsText =
    widgetOriginsDraft !== null ? widgetOriginsDraft : serverWidgetOriginsText;

  const logParams = { limit: 50 } as const;
  const logsQ = useQuery({
    queryKey: getGetCompaniesMeWebhookDeliveryLogsQueryKey(logParams),
    queryFn: () => getCompaniesMeWebhookDeliveryLogs(logParams),
    enabled: planCapabilities.outboundWebhooks && hooksQ.isSuccess
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const scopes: string[] = [];
      if (scopeRead) scopes.push('tickets:read');
      if (scopeWrite) scopes.push('tickets:write');
      const body: HandlersCreateIntegrationAPIKeyRequest = {
        name: keyName.trim(),
        scopes
      };
      if (keyUnit !== 'all') body.unitId = keyUnit;
      return postCompaniesMeIntegrationApiKeys(body);
    },
    onSuccess: async (res) => {
      if (res.status === 201 && res.data && 'token' in res.data) {
        setNewToken((res.data as { token?: string }).token ?? null);
        toast.success(t('api_key_created'));
      }
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeIntegrationApiKeysQueryKey()
      });
      setKeyName('');
    },
    onError: () => toast.error(t('api_key_create_error'))
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => deleteCompaniesMeIntegrationApiKeysId(id),
    onSuccess: async () => {
      toast.success(t('api_key_revoked'));
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeIntegrationApiKeysQueryKey()
      });
    },
    onError: () => toast.error(t('api_key_revoke_error'))
  });

  const createHook = useMutation({
    mutationFn: async () => {
      const types = whEvents
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const body: HandlersCreateWebhookEndpointRequest = {
        url: whUrl.trim(),
        eventTypes: types,
        enabled: true
      };
      if (whUnit !== 'all') body.unitId = whUnit;
      return postCompaniesMeWebhookEndpoints(body);
    },
    onSuccess: async (res) => {
      if (res.status === 201 && res.data && 'signingSecret' in res.data) {
        setNewSigningSecret(
          (res.data as { signingSecret?: string }).signingSecret ?? null
        );
        toast.success(t('webhook_created'));
      }
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeWebhookEndpointsQueryKey()
      });
      setWhUrl('');
    },
    onError: () => toast.error(t('webhook_create_error'))
  });

  const deleteHook = useMutation({
    mutationFn: (id: string) => deleteCompaniesMeWebhookEndpointsId(id),
    onSuccess: async () => {
      toast.success(t('webhook_deleted'));
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeWebhookEndpointsQueryKey()
      });
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeWebhookDeliveryLogsQueryKey(logParams)
      });
    },
    onError: () => toast.error(t('webhook_delete_error'))
  });

  const testWebhook = useMutation({
    mutationFn: (id: string) => postCompaniesMeWebhookEndpointsIdTest(id),
    onSuccess: async (res) => {
      if (res.status === 200) {
        toast.success(t('webhook_test_ok'));
      } else {
        toast.error(t('webhook_test_error'));
      }
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeWebhookDeliveryLogsQueryKey(logParams)
      });
    },
    onError: () => toast.error(t('webhook_test_error'))
  });

  const patchHook = useMutation({
    mutationFn: async () => {
      if (!whEditId) {
        throw new Error('missing id');
      }
      const types = whEditEvents
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const data: HandlersPatchWebhookEndpointRequest = {
        url: whEditUrl.trim(),
        eventTypes: types,
        enabled: whEditEnabled
      };
      return patchCompaniesMeWebhookEndpointsId(whEditId, data);
    },
    onSuccess: async () => {
      toast.success(t('webhook_updated'));
      setWhEditOpen(false);
      setWhEditId(null);
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeWebhookEndpointsQueryKey()
      });
    },
    onError: () => toast.error(t('webhook_update_error'))
  });

  const rotateHook = useMutation({
    mutationFn: (id: string) =>
      postCompaniesMeWebhookEndpointsIdRotateSecret(id),
    onSuccess: async (res) => {
      if (res.status === 200 && res.data && 'signingSecret' in res.data) {
        setRotatedSigningSecret(
          (res.data as { signingSecret?: string }).signingSecret ?? null
        );
        toast.success(t('webhook_rotated'));
      }
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMeWebhookEndpointsQueryKey()
      });
    },
    onError: () => toast.error(t('webhook_rotate_error'))
  });

  const saveWidgetOrigins = useMutation({
    mutationFn: async () => {
      const lines = widgetOriginsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const body: HandlersPublicQueueWidgetSettingsDTO = {
        allowedOrigins: lines
      };
      return patchCompaniesMePublicQueueWidgetSettings(body);
    },
    onSuccess: async () => {
      toast.success(t('widget_origins_saved'));
      setWidgetOriginsDraft(null);
      await qc.invalidateQueries({
        queryKey: getGetCompaniesMePublicQueueWidgetSettingsQueryKey()
      });
    },
    onError: () => toast.error(t('widget_origins_error'))
  });

  const issueWidgetToken = useMutation({
    mutationFn: async () => {
      const body: HandlersIssuePublicWidgetTokenRequest = {
        unitId: widgetUnit,
        ttlSeconds: 900
      };
      return postCompaniesMePublicWidgetToken(body);
    },
    onSuccess: async (res) => {
      if (res.status === 200 && res.data && 'token' in res.data) {
        setWidgetToken((res.data as { token?: string }).token ?? null);
        toast.success(t('widget_token_issued'));
      }
    },
    onError: (err) => {
      const raw =
        isApiHttpError(err) && err.rawBody
          ? err.rawBody
          : err instanceof Error
            ? err.message
            : '';
      if (
        raw.includes('PUBLIC_WIDGET_JWT_SECRET') ||
        raw.includes('public widget token signing')
      ) {
        const loc: Locale = locale.startsWith('ru') ? 'ru' : 'en';
        toast.error(
          messages[loc].admin.integrations.widget_token_error_not_configured
        );
        return;
      }
      toast.error(t('widget_token_error'));
    }
  });

  const keys: HandlersIntegrationAPIKeyRowDTO[] =
    keysQ.data?.status === 200 && Array.isArray(keysQ.data.data)
      ? (keysQ.data.data as HandlersIntegrationAPIKeyRowDTO[])
      : [];

  const hooks: HandlersWebhookEndpointDTO[] =
    hooksQ.data?.status === 200 && Array.isArray(hooksQ.data.data)
      ? (hooksQ.data.data as HandlersWebhookEndpointDTO[])
      : [];

  const deliveryLogs: HandlersWebhookDeliveryLogDTO[] =
    logsQ.data?.status === 200 && Array.isArray(logsQ.data.data)
      ? (logsQ.data.data as HandlersWebhookDeliveryLogDTO[])
      : [];

  return (
    <div className='space-y-6'>
      <p className='text-muted-foreground text-sm'>{t('api_intro')}</p>

      {newToken && (
        <Alert>
          <AlertTitle>{t('api_secret_once_title')}</AlertTitle>
          <AlertDescription className='mt-2 space-y-2'>
            <code className='bg-muted block rounded p-2 text-xs break-all'>
              {newToken}
            </code>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setNewToken(null)}
            >
              {t('api_secret_dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {widgetToken && (
        <Alert>
          <AlertTitle>{t('widget_token_issued')}</AlertTitle>
          <AlertDescription className='mt-2 space-y-2'>
            <code className='bg-muted block rounded p-2 text-xs break-all'>
              {widgetToken}
            </code>
            <p className='text-muted-foreground text-xs'>
              {t('widget_token_hint')}
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setWidgetToken(null)}
            >
              {t('api_secret_dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {newSigningSecret && (
        <Alert>
          <AlertTitle>{t('webhook_secret_once_title')}</AlertTitle>
          <AlertDescription className='mt-2 space-y-2'>
            <code className='bg-muted block rounded p-2 text-xs break-all'>
              {newSigningSecret}
            </code>
            <p className='text-xs'>{t('webhook_secret_hint')}</p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setNewSigningSecret(null)}
            >
              {t('api_secret_dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {rotatedSigningSecret && (
        <Alert>
          <AlertTitle>{t('webhook_rotated_secret_title')}</AlertTitle>
          <AlertDescription className='mt-2 space-y-2'>
            <code className='bg-muted block rounded p-2 text-xs break-all'>
              {rotatedSigningSecret}
            </code>
            <p className='text-xs'>{t('webhook_secret_hint')}</p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setRotatedSigningSecret(null)}
            >
              {t('api_secret_dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {planCapabilities.apiAccess ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('api_keys_title')}</CardTitle>
            <CardDescription>{t('api_keys_description')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {keysQ.isLoading ? (
              <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
            ) : keysQ.isError ? (
              <p className='text-destructive text-sm'>
                {t('api_keys_load_error')}
              </p>
            ) : (
              <>
                <div className='grid max-w-lg gap-3'>
                  <div className='space-y-2'>
                    <Label htmlFor='api-key-name'>{t('api_create_name')}</Label>
                    <Input
                      id='api-key-name'
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder={t('api_create_name_placeholder')}
                    />
                  </div>
                  <div className='flex flex-wrap gap-4'>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={scopeRead}
                        onCheckedChange={(v) => setScopeRead(Boolean(v))}
                      />
                      tickets:read
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={scopeWrite}
                        onCheckedChange={(v) => setScopeWrite(Boolean(v))}
                      />
                      tickets:write
                    </label>
                  </div>
                  <div className='space-y-2'>
                    <Label>{t('api_create_unit_optional')}</Label>
                    <Select value={keyUnit} onValueChange={setKeyUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>
                          {t('filter_all_units')}
                        </SelectItem>
                        {unitOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {getUnitDisplayName(u, locale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type='button'
                    disabled={!keyName.trim() || createKey.isPending}
                    onClick={() => createKey.mutate()}
                  >
                    {createKey.isPending && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    {t('api_create_button')}
                  </Button>
                </div>

                <div className='border-t pt-4'>
                  <h4 className='mb-2 text-sm font-medium'>
                    {t('api_keys_list')}
                  </h4>
                  {keys.length === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('api_keys_empty')}
                    </p>
                  ) : (
                    <ul className='space-y-2'>
                      {keys.map((k) => (
                        <li
                          key={k.id}
                          className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm'
                        >
                          <div>
                            <span className='font-medium'>{k.name}</span>
                            <span className='text-muted-foreground ml-2'>
                              {(k.scopes ?? []).join(', ')}
                            </span>
                            {k.revokedAt ? (
                              <span className='text-muted-foreground block text-xs'>
                                {t('api_key_revoked_label')}
                              </span>
                            ) : null}
                          </div>
                          {!k.revokedAt && (
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              aria-label={t('api_key_revoke')}
                              onClick={() => k.id && revokeKey.mutate(k.id)}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {planCapabilities.outboundWebhooks ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('webhooks_title')}</CardTitle>
            <CardDescription>{t('webhooks_description')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {hooksQ.isLoading ? (
              <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
            ) : hooksQ.isError ? (
              <p className='text-destructive text-sm'>
                {t('webhooks_load_error')}
              </p>
            ) : (
              <>
                <div className='grid max-w-lg gap-3'>
                  <div className='space-y-2'>
                    <Label htmlFor='wh-url'>{t('webhook_url')}</Label>
                    <Input
                      id='wh-url'
                      value={whUrl}
                      onChange={(e) => setWhUrl(e.target.value)}
                      placeholder='https://example.com/quokkaq-hook'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='wh-events'>{t('webhook_events')}</Label>
                    <textarea
                      id='wh-events'
                      className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                      value={whEvents}
                      onChange={(e) => setWhEvents(e.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>{t('webhook_unit_optional')}</Label>
                    <Select value={whUnit} onValueChange={setWhUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>
                          {t('filter_all_units')}
                        </SelectItem>
                        {unitOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {getUnitDisplayName(u, locale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type='button'
                    disabled={!whUrl.trim() || createHook.isPending}
                    onClick={() => createHook.mutate()}
                  >
                    {createHook.isPending && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    {t('webhook_create')}
                  </Button>
                </div>

                <div className='border-t pt-4'>
                  <h4 className='mb-2 text-sm font-medium'>
                    {t('webhooks_list')}
                  </h4>
                  {hooks.length === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('webhooks_empty')}
                    </p>
                  ) : (
                    <ul className='space-y-2'>
                      {hooks.map((h) => (
                        <li
                          key={h.id}
                          className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm'
                        >
                          <div>
                            <div className='font-mono text-xs break-all'>
                              {h.url}
                            </div>
                            <div className='text-muted-foreground'>
                              {(h.eventTypes ?? []).join(', ')}
                            </div>
                            <div className='text-muted-foreground text-xs'>
                              {h.signingSecretMasked}
                            </div>
                          </div>
                          <div className='flex shrink-0 flex-wrap gap-1'>
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              disabled={testWebhook.isPending}
                              onClick={() => h.id && testWebhook.mutate(h.id)}
                            >
                              {t('webhook_test_ping')}
                            </Button>
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              onClick={() => {
                                if (!h.id) return;
                                setWhEditId(h.id);
                                setWhEditUrl(h.url ?? '');
                                setWhEditEvents(
                                  (h.eventTypes ?? []).join('\n')
                                );
                                setWhEditEnabled(h.enabled !== false);
                                setWhEditOpen(true);
                              }}
                            >
                              <Pencil className='mr-1 h-3.5 w-3.5' />
                              {t('webhook_edit')}
                            </Button>
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              disabled={rotateHook.isPending}
                              onClick={() => h.id && rotateHook.mutate(h.id)}
                            >
                              {t('webhook_rotate_secret')}
                            </Button>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              aria-label={t('webhook_delete')}
                              onClick={() => h.id && deleteHook.mutate(h.id)}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className='border-t pt-4'>
                  <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                    <h4 className='text-sm font-medium'>
                      {t('webhook_logs_title')}
                    </h4>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={logsQ.isFetching}
                      onClick={() =>
                        qc.invalidateQueries({
                          queryKey:
                            getGetCompaniesMeWebhookDeliveryLogsQueryKey(
                              logParams
                            )
                        })
                      }
                    >
                      {logsQ.isFetching && (
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      )}
                      {t('webhook_logs_load')}
                    </Button>
                  </div>
                  {logsQ.isError ? (
                    <p className='text-destructive text-sm'>
                      {t('webhook_logs_error')}
                    </p>
                  ) : logsQ.isLoading ? (
                    <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
                  ) : deliveryLogs.length === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('webhook_logs_empty')}
                    </p>
                  ) : (
                    <ul className='max-h-60 space-y-1 overflow-y-auto text-xs'>
                      {deliveryLogs.map((log) => (
                        <li
                          key={log.id}
                          className='text-muted-foreground border-b pb-1 font-mono'
                        >
                          <span className='text-foreground'>
                            {log.createdAt}
                          </span>{' '}
                          ep {log.webhookEndpointId?.slice(0, 8)}… HTTP{' '}
                          {log.httpStatus ?? '—'} {log.durationMs}ms{' '}
                          {log.errorMessage ? `— ${log.errorMessage}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {planCapabilities.publicQueueWidget ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('widget_cors_title')}</CardTitle>
            <CardDescription>{t('widget_cors_description')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {widgetSettingsQ.isLoading ? (
              <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
            ) : widgetSettingsQ.isError ? (
              <p className='text-destructive text-sm'>
                {t('widget_origins_load_error')}
              </p>
            ) : (
              <>
                <div className='space-y-2'>
                  <Label htmlFor='widget-origins'>
                    {t('widget_cors_origins')}
                  </Label>
                  <textarea
                    id='widget-origins'
                    className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[88px] w-full max-w-lg rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
                    value={widgetOriginsText}
                    onChange={(e) => setWidgetOriginsDraft(e.target.value)}
                    placeholder='https://example.com'
                  />
                  <p className='text-muted-foreground text-xs'>
                    {t('widget_cors_hint')}
                  </p>
                </div>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={saveWidgetOrigins.isPending}
                  onClick={() => saveWidgetOrigins.mutate()}
                >
                  {saveWidgetOrigins.isPending && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  {t('widget_cors_save')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {planCapabilities.publicQueueWidget ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('widget_token_title')}</CardTitle>
            <CardDescription>{t('widget_token_description')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid max-w-lg gap-3'>
              <div className='space-y-2'>
                <Label>{t('widget_token_unit')}</Label>
                <Select value={widgetUnit} onValueChange={setWidgetUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>{t('filter_all_units')}</SelectItem>
                    {unitOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {getUnitDisplayName(u, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type='button'
                variant='secondary'
                disabled={issueWidgetToken.isPending}
                onClick={() => {
                  if (widgetUnit === 'all') {
                    toast.error(t('widget_token_select_unit'));
                    return;
                  }
                  issueWidgetToken.mutate();
                }}
              >
                {issueWidgetToken.isPending && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                {t('widget_token_issue')}
              </Button>
            </div>
            {(() => {
              const base = (publicApiUrl ?? '').replace(/\/+$/, '');
              if (!base) return null;
              const snippet = `// Replace UNIT_ID and TOKEN (from "Issue token" above).
const url = \`${base}/units/UNIT_ID/queue-status?token=TOKEN\`;
fetch(url).then((r) => r.json()).then(console.log);`;
              return (
                <div className='border-t pt-4'>
                  <h4 className='mb-2 text-sm font-medium'>
                    {t('widget_embed_title')}
                  </h4>
                  <pre className='bg-muted max-w-2xl overflow-x-auto rounded-md p-3 text-xs'>
                    {snippet}
                  </pre>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={whEditOpen}
        onOpenChange={(o) => {
          setWhEditOpen(o);
          if (!o) {
            setWhEditId(null);
          }
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('webhook_edit_title')}</DialogTitle>
            <DialogDescription>
              {t('webhook_edit_description')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 py-2'>
            <div className='space-y-2'>
              <Label htmlFor='wh-edit-url'>{t('webhook_url')}</Label>
              <Input
                id='wh-edit-url'
                value={whEditUrl}
                onChange={(e) => setWhEditUrl(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='wh-edit-events'>{t('webhook_events')}</Label>
              <textarea
                id='wh-edit-events'
                className='border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
                value={whEditEvents}
                onChange={(e) => setWhEditEvents(e.target.value)}
              />
            </div>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={whEditEnabled}
                onCheckedChange={(v) => setWhEditEnabled(v === true)}
              />
              {t('webhook_enabled')}
            </label>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setWhEditOpen(false)}>
              {t('webhook_edit_cancel')}
            </Button>
            <Button
              disabled={patchHook.isPending}
              onClick={() => patchHook.mutate()}
            >
              {patchHook.isPending && (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              )}
              {t('webhook_edit_save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
