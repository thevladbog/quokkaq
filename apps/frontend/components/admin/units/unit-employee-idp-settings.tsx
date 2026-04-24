'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { isApiHttpError } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { companiesApiExt, unitsApi } from '@/lib/api';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  PermUnitEmployeeIdpManage,
  userUnitPermissionMatches
} from '@/lib/permission-variants';

const DEFAULT_BODY = `{"raw":"{{.Raw}}","login":"{{.Login}}","kind":"{{.Kind}}","ts":{{.Ts}}}`;

const DEFAULT_HEADER = `[
  {"name":"Content-Type","value":"application/json"}
]`;

type Props = { unitId: string };

export function UnitEmployeeIdpSettings({ unitId }: Props) {
  const t = useTranslations('admin.units.employee_idp');
  const qc = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext();

  const canManageEmployeeIdp = useMemo(() => {
    if (authLoading) {
      return null as boolean | null;
    }
    if (!isAuthenticated || !user) {
      return false;
    }
    if (user.isPlatformAdmin === true) {
      return true;
    }
    if (user.isTenantAdmin === true) {
      return true;
    }
    if (!unitId) {
      return false;
    }
    const perms = user.permissions?.[unitId] ?? [];
    return userUnitPermissionMatches(perms, PermUnitEmployeeIdpManage);
  }, [authLoading, isAuthenticated, user, unitId]);

  const companyMeQ = useQuery({
    queryKey: ['company-me'],
    queryFn: () => companiesApiExt.getMe()
  });
  const planOk = companyMeQ.data?.planCapabilities?.kioskEmployeeIdp === true;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['unit-employee-idp', unitId],
    queryFn: () => unitsApi.getUnitEmployeeIdp(unitId),
    enabled: !!unitId && planOk && canManageEmployeeIdp === true
  });

  const [enabled, setEnabled] = useState(false);
  const [httpMethod, setHttpMethod] = useState('POST');
  const [upstreamUrl, setUpstreamUrl] = useState('');
  const [requestBodyTemplate, setRequestBodyTemplate] = useState(DEFAULT_BODY);
  const [responseEmailPath, setResponseEmailPath] = useState('email');
  const [responseDisplayNamePath, setResponseDisplayNamePath] = useState('');
  const [headerTemplatesJson, setHeaderTemplatesJson] =
    useState(DEFAULT_HEADER);
  const [timeoutMs, setTimeoutMs] = useState(10_000);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [pendingSecretValues, setPendingSecretValues] = useState<
    Record<string, string>
  >({});
  const [pendingSecretRemovals, setPendingSecretRemovals] = useState<string[]>(
    []
  );

  useEffect(() => {
    if (!data) {
      return;
    }

    setEnabled(data.enabled);
    setHttpMethod(data.httpMethod || 'POST');
    setUpstreamUrl(data.upstreamUrl || '');
    setRequestBodyTemplate(
      (data.requestBodyTemplate || '').trim() || DEFAULT_BODY
    );
    setResponseEmailPath(data.responseEmailPath || 'email');
    setResponseDisplayNamePath(data.responseDisplayNamePath || '');
    setHeaderTemplatesJson(
      (data.headerTemplatesJson || '').trim() || DEFAULT_HEADER
    );
    setTimeoutMs(
      data.timeoutMs && data.timeoutMs > 0 ? data.timeoutMs : 10_000
    );
    setPendingSecretValues({});
    setPendingSecretRemovals([]);
    setSecretName('');
    setSecretValue('');
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: {
        enabled: boolean;
        httpMethod: string;
        upstreamUrl: string;
        requestBodyTemplate: string;
        responseEmailPath: string;
        responseDisplayNamePath: string;
        headerTemplatesJson: string;
        timeoutMs: number;
        secretValues?: Record<string, string>;
        secretNamesToDelete?: string[];
      } = {
        enabled,
        httpMethod,
        upstreamUrl: upstreamUrl.trim(),
        requestBodyTemplate,
        responseEmailPath: responseEmailPath.trim(),
        responseDisplayNamePath: responseDisplayNamePath.trim(),
        headerTemplatesJson,
        timeoutMs
      };
      const toSend = { ...pendingSecretValues };
      if (Object.keys(toSend).length > 0) {
        body.secretValues = toSend;
      }
      if (pendingSecretRemovals.length > 0) {
        body.secretNamesToDelete = [...new Set(pendingSecretRemovals)];
      }
      return unitsApi.patchUnitEmployeeIdp(unitId, body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['unit-employee-idp', unitId] });
      await qc.invalidateQueries({ queryKey: getGetUnitByIDQueryKey(unitId) });
      toast.success(t('saved'));
      setPendingSecretValues({});
      setPendingSecretRemovals([]);
      setSecretName('');
      setSecretValue('');
    },
    onError: (e: Error) => {
      toast.error(e?.message || t('save_error'));
    }
  });

  const addPendingSecret = useCallback(() => {
    const n = secretName.trim();
    const v = secretValue;
    if (!n) {
      return;
    }
    setPendingSecretValues((prev) => ({ ...prev, [n]: v }));
    setSecretName('');
    setSecretValue('');
  }, [secretName, secretValue]);

  if (authLoading || canManageEmployeeIdp === null) {
    return null;
  }

  if (canManageEmployeeIdp === false) {
    return null;
  }

  if (companyMeQ.isLoading) {
    return null;
  }

  if (!planOk) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('plan_locked')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className='text-muted-foreground flex items-center gap-2 text-sm'>
        <Loader2 className='size-4 animate-spin' aria-hidden />
        {t('loading')}
      </div>
    );
  }

  if (isError) {
    if (
      isApiHttpError(error) &&
      (error.status === 403 || error.status === 404)
    ) {
      return null;
    }
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('load_error')}</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : String(error)}
        </AlertDescription>
        <Button
          type='button'
          variant='outline'
          className='mt-2'
          onClick={() => void refetch()}
        >
          {t('retry')}
        </Button>
      </Alert>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
          <div>
            <p className='text-sm font-medium'>{t('enabled')}</p>
            <p className='text-muted-foreground text-xs'>{t('enabled_help')}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='idp-method'>{t('http_method')}</Label>
          <Select value={httpMethod} onValueChange={setHttpMethod}>
            <SelectTrigger id='idp-method' className='max-w-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='POST'>POST</SelectItem>
              <SelectItem value='PUT'>PUT</SelectItem>
              <SelectItem value='PATCH'>PATCH</SelectItem>
              <SelectItem value='GET'>GET</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='idp-upstream'>{t('upstream_url')}</Label>
          <Input
            id='idp-upstream'
            value={upstreamUrl}
            onChange={(e) => setUpstreamUrl(e.target.value)}
            placeholder='https://id.example.com/api/resolve'
            className='font-mono text-sm'
            autoComplete='off'
          />
          <p className='text-muted-foreground text-xs'>{t('https_only')}</p>
        </div>

        {httpMethod !== 'GET' ? (
          <div className='space-y-2'>
            <Label htmlFor='idp-body'>{t('body_template')}</Label>
            <Textarea
              id='idp-body'
              value={requestBodyTemplate}
              onChange={(e) => setRequestBodyTemplate(e.target.value)}
              rows={5}
              className='font-mono text-sm'
            />
            <p className='text-muted-foreground text-xs'>{t('body_hint')}</p>
          </div>
        ) : null}

        <div className='space-y-2'>
          <Label htmlFor='idp-email-path'>{t('email_path')}</Label>
          <Input
            id='idp-email-path'
            value={responseEmailPath}
            onChange={(e) => setResponseEmailPath(e.target.value)}
            placeholder='data.user.email'
            className='font-mono text-sm'
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='idp-disp-path'>
            {t('display_name_path')}{' '}
            <span className='text-muted-foreground font-normal'>
              ({t('optional')})
            </span>
          </Label>
          <Input
            id='idp-disp-path'
            value={responseDisplayNamePath}
            onChange={(e) => setResponseDisplayNamePath(e.target.value)}
            className='font-mono text-sm'
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='idp-headers'>{t('headers_json')}</Label>
          <Textarea
            id='idp-headers'
            value={headerTemplatesJson}
            onChange={(e) => setHeaderTemplatesJson(e.target.value)}
            rows={4}
            className='font-mono text-sm'
          />
          <p className='text-muted-foreground text-xs'>
            {t('headers_secret_hint')}
          </p>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='idp-to'>{t('timeout_ms')}</Label>
          <Input
            id='idp-to'
            type='number'
            min={1000}
            max={60000}
            step={1000}
            value={timeoutMs}
            onChange={(e) =>
              setTimeoutMs(parseInt(e.target.value, 10) || 10_000)
            }
          />
        </div>

        <div className='space-y-2'>
          <p className='text-sm font-medium'>{t('secret_names')}</p>
          <div className='flex flex-wrap gap-1'>
            {data.secretNames.length ? (
              data.secretNames.map((n) => {
                const marked = pendingSecretRemovals.includes(n);
                return (
                  <span
                    key={n}
                    className='inline-flex items-center gap-1 rounded border border-transparent px-0.5 py-0.5'
                  >
                    <Badge
                      variant='secondary'
                      className={marked ? 'line-through opacity-60' : ''}
                    >
                      {n}
                    </Badge>
                    {marked ? (
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        className='h-auto p-0 text-xs'
                        onClick={() =>
                          setPendingSecretRemovals((prev) =>
                            prev.filter((x) => x !== n)
                          )
                        }
                      >
                        Undo
                      </Button>
                    ) : (
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='h-7 text-xs'
                        onClick={() =>
                          setPendingSecretRemovals((prev) => [...prev, n])
                        }
                      >
                        {t('remove_secret')}
                      </Button>
                    )}
                  </span>
                );
              })
            ) : (
              <span className='text-muted-foreground text-sm'>
                {t('no_secrets')}
              </span>
            )}
          </div>
          {Object.keys(pendingSecretValues).length > 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('pending_secrets', {
                n: String(Object.keys(pendingSecretValues).length)
              })}
            </p>
          ) : null}
          {pendingSecretRemovals.length > 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('pending_removals', {
                n: String(
                  new Set(pendingSecretRemovals.map((x) => x.trim())).size
                )
              })}
            </p>
          ) : null}
          <div className='mt-2 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end'>
            <div className='min-w-0 flex-1 space-y-1'>
              <Label htmlFor='new-sec-n'>{t('new_secret_name')}</Label>
              <Input
                id='new-sec-n'
                value={secretName}
                onChange={(e) => setSecretName(e.target.value)}
                className='font-mono text-sm'
                autoComplete='off'
              />
            </div>
            <div className='min-w-0 flex-1 space-y-1'>
              <Label htmlFor='new-sec-v'>{t('new_secret_value')}</Label>
              <Input
                id='new-sec-v'
                type='password'
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                autoComplete='new-password'
              />
            </div>
            <Button
              type='button'
              variant='secondary'
              onClick={addPendingSecret}
            >
              {t('add_secret')}
            </Button>
          </div>
        </div>

        <p className='text-muted-foreground text-xs'>{t('pii_note')}</p>

        <Button
          type='button'
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              {t('saving')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
