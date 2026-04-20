'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  getGetPlatformCompanyOneCSettingsQueryKey,
  getPlatformCompanyOneCSettings,
  putPlatformCompanyOneCSettings,
  type ModelsCompanyOneCSettingsPublic,
  type ModelsCompanyOneCSettingsPutRequest
} from '@/lib/api/generated/platform';

/** Textarea placeholder only; not in messages — ICU MessageFormat treats `{` as syntax. */
const STATUS_MAPPING_JSON_PLACEHOLDER = `{
  "rules": [
    { "contains": "оплачен", "invoiceStatus": "paid" },
    { "contains": "отмен", "invoiceStatus": "void" }
  ]
}`;

type OneCSettingsDTO = {
  companyId: string;
  exchangeEnabled: boolean;
  httpLogin: string;
  passwordSet: boolean;
  commerceMlVersion: string;
  exchangeUrlHint?: string;
  /** UNF order status → invoice status rules; null = use built-in “paid” heuristic only */
  statusMapping?: unknown | null;
  /** Name of payment system on site for UNF wizard (эквайринг mapping) */
  sitePaymentSystemName?: string;
};

function mapPublicToDTO(p: ModelsCompanyOneCSettingsPublic): OneCSettingsDTO {
  return {
    companyId: p.companyId ?? '',
    exchangeEnabled: p.exchangeEnabled ?? false,
    httpLogin: p.httpLogin ?? '',
    passwordSet: p.passwordSet ?? false,
    commerceMlVersion: p.commerceMlVersion || '2.10',
    exchangeUrlHint: p.exchangeUrlHint,
    statusMapping: p.statusMapping,
    sitePaymentSystemName: p.sitePaymentSystemName
  };
}

async function fetchPlatformOneCSettings(
  companyId: string
): Promise<OneCSettingsDTO> {
  const res = await getPlatformCompanyOneCSettings(companyId);
  if (res.status !== 200 || !res.data) {
    throw new Error('load');
  }
  return mapPublicToDTO(res.data);
}

type PutOneCBody = {
  exchangeEnabled?: boolean;
  httpLogin?: string;
  httpPassword?: string;
  commerceMlVersion?: string;
  statusMapping?: unknown | null;
  sitePaymentSystemName?: string;
};

function toPutRequest(body: PutOneCBody): ModelsCompanyOneCSettingsPutRequest {
  const base: ModelsCompanyOneCSettingsPutRequest = {
    exchangeEnabled: body.exchangeEnabled,
    httpLogin: body.httpLogin,
    httpPassword: body.httpPassword,
    commerceMlVersion: body.commerceMlVersion,
    sitePaymentSystemName: body.sitePaymentSystemName
  };
  if (body.statusMapping === null) {
    return {
      ...base,
      statusMapping: null
    } as unknown as ModelsCompanyOneCSettingsPutRequest;
  }
  if (body.statusMapping !== undefined) {
    return {
      ...base,
      statusMapping:
        body.statusMapping as ModelsCompanyOneCSettingsPutRequest['statusMapping']
    };
  }
  return base;
}

async function putPlatformOneCSettings(
  companyId: string,
  body: PutOneCBody
): Promise<OneCSettingsDTO> {
  const res = await putPlatformCompanyOneCSettings(
    companyId,
    toPutRequest(body)
  );
  if (res.status !== 200 || !res.data) {
    throw new Error('save');
  }
  return mapPublicToDTO(res.data);
}

function formatStatusMappingForForm(m: unknown | null | undefined): string {
  if (m == null || typeof m !== 'object') {
    return '';
  }
  try {
    return JSON.stringify(m, null, 2);
  } catch {
    return '';
  }
}

type OneCPasswordPayloadMode = 'omit' | 'set' | 'clear';

function OneCIntegrationForm({
  data,
  platformCompanyId
}: {
  data: OneCSettingsDTO;
  platformCompanyId: string;
}) {
  const t = useTranslations('admin.integrations.onec');
  const qc = useQueryClient();
  const [exchangeEnabled, setExchangeEnabled] = useState(data.exchangeEnabled);
  const [httpLogin, setHttpLogin] = useState(data.httpLogin);
  const [httpPassword, setHttpPassword] = useState('');
  const [passwordPayloadMode, setPasswordPayloadMode] =
    useState<OneCPasswordPayloadMode>('omit');
  const [commerceMlVersion, setCommerceMlVersion] = useState(
    data.commerceMlVersion || '2.10'
  );
  const [statusMappingText, setStatusMappingText] = useState(() =>
    formatStatusMappingForForm(data.statusMapping)
  );
  const [sitePaymentSystemName, setSitePaymentSystemName] = useState(
    data.sitePaymentSystemName ?? ''
  );

  const m = useMutation({
    mutationFn: (body: PutOneCBody) =>
      putPlatformOneCSettings(platformCompanyId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['onec-settings'] });
      void qc.invalidateQueries({
        queryKey: getGetPlatformCompanyOneCSettingsQueryKey(platformCompanyId)
      });
      toast.success(t('saved'));
    },
    onError: (e: Error) => {
      toast.error(e.message || t('saveError'));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <form
          className='max-w-lg space-y-4'
          onSubmit={(e) => {
            e.preventDefault();
            const trimmedMap = statusMappingText.trim();
            let statusMapping: unknown | null = null;
            if (trimmedMap !== '') {
              try {
                statusMapping = JSON.parse(trimmedMap) as unknown;
              } catch {
                toast.error(t('statusMappingInvalidJson'));
                return;
              }
            }
            const body: PutOneCBody = {
              exchangeEnabled,
              httpLogin: httpLogin.trim(),
              commerceMlVersion: commerceMlVersion.trim() || '2.10',
              statusMapping,
              sitePaymentSystemName: sitePaymentSystemName.trim()
            };
            if (passwordPayloadMode === 'clear') {
              body.httpPassword = '';
            } else if (passwordPayloadMode === 'set' && httpPassword !== '') {
              body.httpPassword = httpPassword;
            }
            m.mutate(body);
          }}
        >
          <div className='flex items-center justify-between gap-4'>
            <div>
              <Label htmlFor='exchangeEnabled'>{t('exchangeEnabled')}</Label>
              <p className='text-muted-foreground text-xs'>
                {t('exchangeEnabledHint')}
              </p>
            </div>
            <Switch
              id='exchangeEnabled'
              checked={exchangeEnabled}
              onCheckedChange={setExchangeEnabled}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='httpLogin'>{t('httpLogin')}</Label>
            <Input
              id='httpLogin'
              value={httpLogin}
              onChange={(e) => setHttpLogin(e.target.value)}
              autoComplete='off'
              placeholder={t('httpLoginPlaceholder')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='httpPassword'>{t('httpPassword')}</Label>
            <Input
              id='httpPassword'
              value={httpPassword}
              onChange={(e) => {
                setPasswordPayloadMode('set');
                setHttpPassword(e.target.value);
              }}
              type='password'
              autoComplete='new-password'
              placeholder={
                data.passwordSet
                  ? t('httpPasswordPlaceholderSet')
                  : t('httpPasswordPlaceholder')
              }
            />
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => {
                  setPasswordPayloadMode('clear');
                  setHttpPassword('');
                }}
              >
                {t('clearStoredPassword')}
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('httpPasswordHint')}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='commerceMlVersion'>{t('commerceMlVersion')}</Label>
            <Input
              id='commerceMlVersion'
              value={commerceMlVersion}
              onChange={(e) => setCommerceMlVersion(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='sitePaymentSystemName'>
              {t('sitePaymentSystemName')}
            </Label>
            <Input
              id='sitePaymentSystemName'
              value={sitePaymentSystemName}
              onChange={(e) => setSitePaymentSystemName(e.target.value)}
              placeholder={t('sitePaymentSystemNamePlaceholder')}
            />
            <p className='text-muted-foreground text-xs'>
              {t('sitePaymentSystemNameHint')}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='statusMapping'>{t('statusMapping')}</Label>
            <Textarea
              id='statusMapping'
              value={statusMappingText}
              onChange={(e) => setStatusMappingText(e.target.value)}
              spellCheck={false}
              className='min-h-[140px] font-mono text-xs'
              placeholder={STATUS_MAPPING_JSON_PLACEHOLDER}
            />
            <p className='text-muted-foreground text-xs'>
              {t('statusMappingHint')}
            </p>
          </div>
          {data.exchangeUrlHint ? (
            <div className='space-y-1'>
              <Label>{t('exchangeUrl')}</Label>
              <code className='bg-muted rounded px-2 py-1 text-xs break-all'>
                {data.exchangeUrlHint}
              </code>
              <p className='text-muted-foreground text-xs'>
                {t('exchangeUrlHint')}
              </p>
            </div>
          ) : null}
          <Button type='submit' disabled={m.isPending}>
            {m.isPending ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** SaaS operator only: `id` must be the deployment’s SaaS operator company (Platform → Integrations → 1C). API: `/platform/companies/{id}/onec-settings`. Not used in tenant-facing settings. */
export function OneCIntegrationSettings({
  platformCompanyId
}: {
  platformCompanyId: string;
}) {
  const t = useTranslations('admin.integrations.onec');
  const q = useQuery({
    queryKey: ['onec-settings', 'platform', platformCompanyId],
    queryFn: () => fetchPlatformOneCSettings(platformCompanyId),
    enabled: Boolean(platformCompanyId)
  });

  if (q.isLoading) {
    return (
      <div className='flex justify-center py-8'>
        <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return <p className='text-destructive text-sm'>{t('loadError')}</p>;
  }

  return (
    <OneCIntegrationForm
      key={`${platformCompanyId}-${q.dataUpdatedAt}`}
      data={q.data}
      platformCompanyId={platformCompanyId}
    />
  );
}
