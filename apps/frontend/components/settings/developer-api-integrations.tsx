'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import {
  getGetCompaniesMeIntegrationApiKeysQueryKey,
  getGetCompaniesMeWebhookEndpointsQueryKey,
  getCompaniesMeIntegrationApiKeys,
  getCompaniesMeWebhookEndpoints,
  postCompaniesMeIntegrationApiKeys,
  postCompaniesMeWebhookEndpoints,
  deleteCompaniesMeIntegrationApiKeysId,
  deleteCompaniesMeWebhookEndpointsId
} from '@/lib/api/generated/auth';
import type {
  HandlersCreateIntegrationAPIKeyRequest,
  HandlersCreateWebhookEndpointRequest,
  HandlersIntegrationAPIKeyRowDTO,
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
import { getUnitDisplayName } from '@/lib/unit-display';

type UnitOpt = { id: string; name: string; nameEn?: string | null };

export function DeveloperApiIntegrations({
  locale,
  unitOptions
}: {
  locale: string;
  unitOptions: UnitOpt[];
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

  const keysQ = useQuery({
    queryKey: getGetCompaniesMeIntegrationApiKeysQueryKey(),
    queryFn: () => getCompaniesMeIntegrationApiKeys()
  });

  const hooksQ = useQuery({
    queryKey: getGetCompaniesMeWebhookEndpointsQueryKey(),
    queryFn: () => getCompaniesMeWebhookEndpoints()
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
    },
    onError: () => toast.error(t('webhook_delete_error'))
  });

  const keys: HandlersIntegrationAPIKeyRowDTO[] =
    keysQ.data?.status === 200 && Array.isArray(keysQ.data.data)
      ? (keysQ.data.data as HandlersIntegrationAPIKeyRowDTO[])
      : [];

  const hooks: HandlersWebhookEndpointDTO[] =
    hooksQ.data?.status === 200 && Array.isArray(hooksQ.data.data)
      ? (hooksQ.data.data as HandlersWebhookEndpointDTO[])
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
                <div>
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
                <div>
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
                <div>
                  <Label htmlFor='wh-url'>{t('webhook_url')}</Label>
                  <Input
                    id='wh-url'
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    placeholder='https://example.com/quokkaq-hook'
                  />
                </div>
                <div>
                  <Label htmlFor='wh-events'>{t('webhook_events')}</Label>
                  <textarea
                    id='wh-events'
                    className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                    value={whEvents}
                    onChange={(e) => setWhEvents(e.target.value)}
                  />
                </div>
                <div>
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
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          aria-label={t('webhook_delete')}
                          onClick={() => h.id && deleteHook.mutate(h.id)}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
