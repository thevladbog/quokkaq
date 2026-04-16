'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Link } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertCircle, Copy, KeyRound, Link2, Shield } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { Company } from '@quokkaq/shared-types';
import { companiesApiExt } from '@/lib/api';
import {
  companiesMeLoginLinkPost,
  companiesMeSSOGet,
  companiesMeSSOPatch,
  companiesMeSlugPatch,
  getCompaniesMeSSOGetQueryKey,
  type HandlersLoginLinkResponse,
  type ServicesCompanySSOGetResponse,
  type ServicesCompanySSOPatch
} from '@/lib/api/generated/auth';

function apiPublicBase(): string {
  const u = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3001';
}

function appPublicBase(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3000';
}

type LoginFormProps = {
  company: Company;
  sso: ServicesCompanySSOGetResponse;
};

function OrganizationLoginSecurityForm({ company, sso }: LoginFormProps) {
  const t = useTranslations('organization.loginSecurity');
  const locale = useLocale();
  const qc = useQueryClient();

  const [slugDraft, setSlugDraft] = useState(company.slug ?? '');
  const [issuerUrl, setIssuerUrl] = useState(sso.issuerUrl ?? '');
  const [clientId, setClientId] = useState(sso.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState(sso.scopes ?? 'openid email profile');
  const [protocol, setProtocol] = useState<'oidc' | 'saml'>(
    sso.ssoProtocol === 'saml' ? 'saml' : 'oidc'
  );
  const [samlIdpMetadataUrl, setSamlIdpMetadataUrl] = useState(
    sso.samlIdpMetadataUrl ?? ''
  );
  const [emailDomainsStr, setEmailDomainsStr] = useState(
    (sso.emailDomains ?? []).join(', ')
  );
  const [enabled, setEnabled] = useState(!!sso.enabled);
  const [opaqueLink, setOpaqueLink] = useState<{
    token: string;
    exampleUrl: string;
  } | null>(null);

  const oidcRedirectUri = useMemo(
    () => `${apiPublicBase()}/auth/sso/callback`,
    []
  );

  const samlAcsUrl = useMemo(
    () =>
      `${apiPublicBase()}/auth/saml/acs?tenant=${encodeURIComponent(company.slug ?? '')}`,
    [company.slug]
  );

  const samlSpMetadataUrl = useMemo(
    () =>
      `${apiPublicBase()}/auth/saml/metadata?tenant=${encodeURIComponent(company.slug ?? '')}`,
    [company.slug]
  );

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const patchSlug = useMutation({
    mutationFn: async (slug: string) => {
      const res = await companiesMeSlugPatch({ slug: slug.trim() });
      if (res.status !== 200) {
        throw new Error(t('saveError'));
      }
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company-me'] });
      toast.success(t('slugSaved'));
    },
    onError: (e: Error) => toast.error(e.message || t('saveError'))
  });

  const patchSso = useMutation({
    mutationFn: async (body: ServicesCompanySSOPatch) => {
      const res = await companiesMeSSOPatch(body);
      if (res.status !== 204) {
        throw new Error(t('saveError'));
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getCompaniesMeSSOGetQueryKey() });
      setClientSecret('');
      toast.success(t('ssoSaved'));
    },
    onError: () => toast.error(t('saveError'))
  });

  const createLink = useMutation({
    mutationFn: async () => {
      const res = await companiesMeLoginLinkPost();
      if (res.status !== 200 || !res.data) {
        throw new Error(t('linkError'));
      }
      const data: HandlersLoginLinkResponse = res.data;
      const token = data.token ?? '';
      const example =
        data.exampleUrl ??
        `${appPublicBase()}/${locale}/login?login_token=${encodeURIComponent(token)}`;
      return { token, exampleUrl: example };
    },
    onSuccess: (data) => {
      setOpaqueLink(data);
      toast.success(t('linkCreated'));
    },
    onError: () => toast.error(t('linkError'))
  });

  const onSaveSso = () => {
    const domains = emailDomainsStr
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const body: ServicesCompanySSOPatch = {
      enabled,
      ssoProtocol: protocol,
      emailDomains: domains.length > 0 ? domains : undefined
    };
    if (protocol === 'oidc') {
      body.issuerUrl = issuerUrl.trim() || undefined;
      body.clientId = clientId.trim() || undefined;
      body.scopes = scopes.trim() || undefined;
      if (clientSecret.trim() !== '') {
        body.clientSecret = clientSecret.trim();
      }
    } else {
      body.samlIdpMetadataUrl = samlIdpMetadataUrl.trim() || undefined;
    }
    patchSso.mutate(body);
  };

  const onSaveSlug = () => {
    patchSlug.mutate(slugDraft.trim());
  };

  const secretSet = !!sso.clientSecretSet;

  return (
    <div className='space-y-6'>
      <div className='text-muted-foreground text-sm'>
        <Link
          href='/settings/organization'
          className='text-primary hover:underline'
        >
          ← {t('backToOrganization')}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Link2 className='h-5 w-5' />
            {t('slugTitle')}
          </CardTitle>
          <CardDescription>{t('slugDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-2'>
            <Label htmlFor='tenant-slug'>{t('slugLabel')}</Label>
            <Input
              id='tenant-slug'
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              autoComplete='off'
            />
            <p className='text-muted-foreground text-xs'>{t('slugHint')}</p>
          </div>
          <Button
            type='button'
            onClick={() => onSaveSlug()}
            disabled={
              patchSlug.isPending || slugDraft.trim() === (company.slug ?? '')
            }
          >
            {patchSlug.isPending ? t('saving') : t('saveSlug')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Shield className='h-5 w-5' />
            {t('ssoTitle')}
          </CardTitle>
          <CardDescription>{t('ssoDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <Label htmlFor='sso-enabled'>{t('enabledLabel')}</Label>
              <p className='text-muted-foreground text-xs'>
                {t('enabledHint')}
              </p>
            </div>
            <Switch
              id='sso-enabled'
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='sso-protocol'>{t('protocolLabel')}</Label>
            <Select
              value={protocol}
              onValueChange={(v) => setProtocol(v as 'oidc' | 'saml')}
            >
              <SelectTrigger id='sso-protocol' className='w-full max-w-md'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='oidc'>{t('protocolOidc')}</SelectItem>
                <SelectItem value='saml'>{t('protocolSaml')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {protocol === 'oidc' ? (
            <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
              <div>
                <p className='font-medium'>{t('redirectUriLabel')}</p>
                <p className='text-muted-foreground mt-1 font-mono text-xs break-all'>
                  {oidcRedirectUri}
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void copyText(oidcRedirectUri, t('copied'))}
              >
                <Copy className='mr-1 size-4' />
                {t('copy')}
              </Button>
            </div>
          ) : (
            <>
              <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                <div>
                  <p className='font-medium'>{t('samlAcsLabel')}</p>
                  <p className='text-muted-foreground mt-1 font-mono text-xs break-all'>
                    {samlAcsUrl}
                  </p>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => void copyText(samlAcsUrl, t('copied'))}
                >
                  <Copy className='mr-1 size-4' />
                  {t('copy')}
                </Button>
              </div>
              <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                <div>
                  <p className='font-medium'>{t('samlSpMetadataLabel')}</p>
                  <p className='text-muted-foreground mt-1 font-mono text-xs break-all'>
                    {samlSpMetadataUrl}
                  </p>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => void copyText(samlSpMetadataUrl, t('copied'))}
                >
                  <Copy className='mr-1 size-4' />
                  {t('copy')}
                </Button>
              </div>
            </>
          )}

          {protocol === 'oidc' ? (
            <>
              <div className='grid gap-2'>
                <Label htmlFor='issuer'>{t('issuerUrl')}</Label>
                <Input
                  id='issuer'
                  value={issuerUrl}
                  onChange={(e) => setIssuerUrl(e.target.value)}
                  placeholder='https://login.microsoftonline.com/.../v2.0'
                />
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='client-id'>{t('clientId')}</Label>
                <Input
                  id='client-id'
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete='off'
                />
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='client-secret'>{t('clientSecret')}</Label>
                <Input
                  id='client-secret'
                  type='password'
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={secretSet ? t('clientSecretPlaceholderSet') : ''}
                  autoComplete='new-password'
                />
                {secretSet ? (
                  <p className='text-muted-foreground text-xs'>
                    {t('secretSetHint')}
                  </p>
                ) : null}
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='scopes'>{t('scopes')}</Label>
                <Input
                  id='scopes'
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className='grid gap-2'>
              <Label htmlFor='saml-idp-metadata'>
                {t('samlIdpMetadataUrl')}
              </Label>
              <Input
                id='saml-idp-metadata'
                value={samlIdpMetadataUrl}
                onChange={(e) => setSamlIdpMetadataUrl(e.target.value)}
                placeholder='https://…/federationmetadata/2007-06/federationmetadata.xml'
                autoComplete='off'
              />
              <p className='text-muted-foreground text-xs'>
                {t('samlIdpMetadataHint')}
              </p>
            </div>
          )}

          <div className='grid gap-2'>
            <Label htmlFor='email-domains'>{t('emailDomains')}</Label>
            <Input
              id='email-domains'
              value={emailDomainsStr}
              onChange={(e) => setEmailDomainsStr(e.target.value)}
              placeholder='example.com, example.org'
            />
            <p className='text-muted-foreground text-xs'>
              {t('emailDomainsHint')}
            </p>
          </div>

          <Button
            type='button'
            onClick={() => onSaveSso()}
            disabled={patchSso.isPending}
          >
            {patchSso.isPending ? t('saving') : t('saveSso')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <KeyRound className='h-5 w-5' />
            {t('opaqueTitle')}
          </CardTitle>
          <CardDescription>{t('opaqueDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Button
            type='button'
            variant='secondary'
            onClick={() => createLink.mutate()}
            disabled={createLink.isPending}
          >
            {createLink.isPending ? t('generating') : t('generateLink')}
          </Button>
          {opaqueLink ? (
            <div className='space-y-2 rounded-md border p-3'>
              <p className='text-muted-foreground text-xs'>{t('opaqueHint')}</p>
              <div className='flex flex-wrap items-start gap-2'>
                <code className='bg-muted max-w-full flex-1 rounded px-2 py-1 text-xs break-all'>
                  {opaqueLink.exampleUrl}
                </code>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    void copyText(opaqueLink.exampleUrl, t('copied'))
                  }
                >
                  <Copy className='size-4' />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function OrganizationLoginSecurityContent() {
  const t = useTranslations('organization.loginSecurity');

  const companyMe = useQuery({
    queryKey: ['company-me'],
    queryFn: () => companiesApiExt.getMe()
  });

  const ssoQ = useQuery({
    queryKey: getCompaniesMeSSOGetQueryKey(),
    queryFn: () => companiesMeSSOGet(),
    enabled: companyMe.isSuccess
  });

  const company = companyMe.data?.company;

  if (companyMe.isLoading || ssoQ.isLoading) {
    return <p className='text-muted-foreground text-sm'>{t('loading')}</p>;
  }

  if (companyMe.isError || !company) {
    return (
      <Alert variant='destructive'>
        <AlertCircle />
        <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }

  if (ssoQ.isError || ssoQ.data?.status !== 200 || !ssoQ.data.data) {
    return (
      <Alert variant='destructive'>
        <AlertCircle />
        <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
        <AlertDescription>{t('ssoLoadError')}</AlertDescription>
      </Alert>
    );
  }

  const formVersion = `${company.updatedAt ?? ''}-${ssoQ.dataUpdatedAt}`;

  return (
    <OrganizationLoginSecurityForm
      key={formVersion}
      company={company}
      sso={ssoQ.data.data}
    />
  );
}
