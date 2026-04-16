'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Link } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertCircle, Copy, KeyRound, Link2, Shield } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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

/** Matches backend `API_PUBLIC_URL` when provided by GET /companies/me. */
function resolvePublicApiBase(serverUrl?: string | null): string {
  const trimmed = serverUrl?.trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, '');
  }
  const u = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3001';
}

/** Matches backend `PUBLIC_APP_URL` / `APP_BASE_URL` when provided by GET /companies/me. */
function resolvePublicAppBase(serverUrl?: string | null): string {
  const trimmed = serverUrl?.trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, '');
  }
  const u = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3000';
}

const RESERVED_TENANT_SLUGS = new Set([
  'www',
  'api',
  'admin',
  'login',
  'auth',
  'static',
  'health',
  'swagger',
  'docs',
  'ws',
  'system',
  'en',
  'ru',
  't'
]);

/** Mirrors `tenantslug.Normalize` for client-side validation. */
function normalizeTenantSlug(raw: string): string {
  const s = raw.trim().toLowerCase();
  let out = '';
  let prevDash = false;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
      prevDash = false;
    } else if (ch === ' ' || ch === '-' || ch === '_') {
      if (out.length > 0 && !prevDash) {
        out += '-';
        prevDash = true;
      }
    }
  }
  out = out.replace(/^-+|-+$/g, '');
  while (out.includes('--')) {
    out = out.replace(/--/g, '-');
  }
  return out;
}

function isValidHttpUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseEmailDomains(emailDomainsStr: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emailDomainsStr.split(/[,;\s]+/)) {
    const x = raw.trim().toLowerCase();
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

const slugPartRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slugFormSchema = z.object({
  slug: z.string().superRefine((val, ctx) => {
    const n = normalizeTenantSlug(val);
    if (n.length < 3 || n.length > 63) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'slug length must be between 3 and 63'
      });
      return;
    }
    if (!slugPartRe.test(n)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalid slug format'
      });
      return;
    }
    if (RESERVED_TENANT_SLUGS.has(n)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'slug is reserved'
      });
    }
  })
});

type SlugFormValues = z.infer<typeof slugFormSchema>;

type SsoSchemaOpts = {
  hasPersistedSlug: boolean;
  invalidUrl: string;
  samlNeedsSlug: string;
};

function createSsoFormSchema(opts: SsoSchemaOpts) {
  return z
    .object({
      enabled: z.boolean(),
      protocol: z.enum(['oidc', 'saml']),
      issuerUrl: z.string(),
      clientId: z.string(),
      clientSecret: z.string(),
      scopes: z.string(),
      samlIdpMetadataUrl: z.string(),
      emailDomainsStr: z.string()
    })
    .superRefine((data, ctx) => {
      if (data.protocol === 'saml' && !opts.hasPersistedSlug) {
        ctx.addIssue({
          code: 'custom',
          message: opts.samlNeedsSlug,
          path: ['protocol']
        });
      }
      if (data.protocol === 'oidc') {
        const issuer = data.issuerUrl.trim();
        if (issuer && !isValidHttpUrl(issuer)) {
          ctx.addIssue({
            code: 'custom',
            message: opts.invalidUrl,
            path: ['issuerUrl']
          });
        }
      }
      if (data.protocol === 'saml') {
        const meta = data.samlIdpMetadataUrl.trim();
        if (meta && !isValidHttpUrl(meta)) {
          ctx.addIssue({
            code: 'custom',
            message: opts.invalidUrl,
            path: ['samlIdpMetadataUrl']
          });
        }
      }
    });
}

type SsoFormValues = z.infer<ReturnType<typeof createSsoFormSchema>>;

function ssoDefaultsFromServer(
  sso: ServicesCompanySSOGetResponse
): SsoFormValues {
  return {
    enabled: !!sso.enabled,
    protocol: sso.ssoProtocol === 'saml' ? 'saml' : 'oidc',
    issuerUrl: sso.issuerUrl ?? '',
    clientId: sso.clientId ?? '',
    clientSecret: '',
    scopes: sso.scopes ?? 'openid email profile',
    samlIdpMetadataUrl: sso.samlIdpMetadataUrl ?? '',
    emailDomainsStr: (sso.emailDomains ?? []).join(', ')
  };
}

function ssoServerFingerprint(sso: ServicesCompanySSOGetResponse): string {
  return JSON.stringify({
    enabled: sso.enabled,
    ssoProtocol: sso.ssoProtocol,
    issuerUrl: sso.issuerUrl ?? '',
    clientId: sso.clientId ?? '',
    samlIdpMetadataUrl: sso.samlIdpMetadataUrl ?? '',
    scopes: sso.scopes ?? '',
    emailDomains: sso.emailDomains ?? [],
    clientSecretSet: sso.clientSecretSet
  });
}

function buildSsoPatchBody(values: SsoFormValues): ServicesCompanySSOPatch {
  const domains = parseEmailDomains(values.emailDomainsStr);
  const body: ServicesCompanySSOPatch = {
    enabled: values.enabled,
    ssoProtocol: values.protocol,
    emailDomains: domains.length > 0 ? domains : undefined
  };
  if (values.protocol === 'oidc') {
    body.issuerUrl = values.issuerUrl.trim() || undefined;
    body.clientId = values.clientId.trim() || undefined;
    body.scopes = values.scopes.trim() || undefined;
    if (values.clientSecret.trim() !== '') {
      body.clientSecret = values.clientSecret.trim();
    }
  } else {
    body.samlIdpMetadataUrl = values.samlIdpMetadataUrl.trim() || undefined;
  }
  return body;
}

type LoginFormProps = {
  company: Company;
  sso: ServicesCompanySSOGetResponse;
  /** Canonical API origin from GET /companies/me (falls back to NEXT_PUBLIC_API_URL). */
  publicApiUrl?: string | null;
  /** Canonical app origin from GET /companies/me (falls back to NEXT_PUBLIC_APP_URL). */
  publicAppUrl?: string | null;
};

function OrganizationLoginSecurityForm({
  company,
  sso,
  publicApiUrl,
  publicAppUrl
}: LoginFormProps) {
  const t = useTranslations('organization.loginSecurity');
  const qc = useQueryClient();

  const hasPersistedSlug = Boolean((company.slug ?? '').trim());

  const ssoSchema = useMemo(
    () =>
      createSsoFormSchema({
        hasPersistedSlug,
        invalidUrl: t('validationInvalidUrl'),
        samlNeedsSlug: t('samlSlugRequiredTitle')
      }),
    [hasPersistedSlug, t]
  );

  const ssoFingerprint = useMemo(() => ssoServerFingerprint(sso), [sso]);

  const slugForm = useForm<SlugFormValues>({
    resolver: zodResolver(slugFormSchema),
    defaultValues: { slug: company.slug ?? '' }
  });

  const ssoForm = useForm<SsoFormValues>({
    resolver: zodResolver(ssoSchema),
    defaultValues: ssoDefaultsFromServer(sso)
  });

  useEffect(() => {
    slugForm.reset({ slug: company.slug ?? '' });
  }, [company.slug, slugForm]);

  useEffect(() => {
    ssoForm.reset(ssoDefaultsFromServer(sso));
    // Intentionally depend on `ssoFingerprint` only: `sso` gets a new reference on every RQ
    // refetch even when the payload is unchanged; the fingerprint avoids wiping dirty form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssoFingerprint, ssoForm]);

  const protocol = useWatch({ control: ssoForm.control, name: 'protocol' });

  const [opaqueLink, setOpaqueLink] = useState<{
    token: string;
    exampleUrl: string;
  } | null>(null);

  const oidcRedirectUri = useMemo(
    () => `${resolvePublicApiBase(publicApiUrl)}/auth/sso/callback`,
    [publicApiUrl]
  );

  const samlAcsUrl = useMemo(() => {
    const slug = (company.slug ?? '').trim();
    if (!slug) return '';
    return `${resolvePublicApiBase(publicApiUrl)}/auth/saml/acs?tenant=${encodeURIComponent(slug)}`;
  }, [company.slug, publicApiUrl]);

  const samlSpMetadataUrl = useMemo(() => {
    const slug = (company.slug ?? '').trim();
    if (!slug) return '';
    return `${resolvePublicApiBase(publicApiUrl)}/auth/saml/metadata?tenant=${encodeURIComponent(slug)}`;
  }, [company.slug, publicApiUrl]);

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
      ssoForm.reset({
        ...ssoForm.getValues(),
        clientSecret: ''
      });
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
        `${resolvePublicAppBase(publicAppUrl)}/login?login_token=${encodeURIComponent(token)}`;
      return { token, exampleUrl: example };
    },
    onSuccess: (data) => {
      setOpaqueLink(data);
      toast.success(t('linkCreated'));
    },
    onError: () => toast.error(t('linkError'))
  });

  const onSubmitSlug = slugForm.handleSubmit((values) => {
    patchSlug.mutate(normalizeTenantSlug(values.slug));
  });

  const onSubmitSso = ssoForm.handleSubmit((values) => {
    patchSso.mutate(buildSsoPatchBody(values));
  });

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
        <CardContent>
          <Form {...slugForm}>
            <form onSubmit={onSubmitSlug} className='space-y-4'>
              <FormField
                control={slugForm.control}
                name='slug'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('slugLabel')}</FormLabel>
                    <FormControl>
                      <Input autoComplete='off' {...field} />
                    </FormControl>
                    <FormDescription>{t('slugHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type='submit'
                disabled={patchSlug.isPending || !slugForm.formState.isDirty}
              >
                {patchSlug.isPending ? t('saving') : t('saveSlug')}
              </Button>
            </form>
          </Form>
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
        <CardContent>
          <Form {...ssoForm}>
            <form onSubmit={onSubmitSso} className='space-y-4'>
              <FormField
                control={ssoForm.control}
                name='enabled'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between gap-4 rounded-lg border p-3'>
                    <div className='space-y-1'>
                      <FormLabel htmlFor='sso-enabled' className='text-base'>
                        {t('enabledLabel')}
                      </FormLabel>
                      <FormDescription>{t('enabledHint')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        id='sso-enabled'
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={ssoForm.control}
                name='protocol'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('protocolLabel')}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) =>
                        field.onChange(v as 'oidc' | 'saml')
                      }
                    >
                      <FormControl>
                        <SelectTrigger
                          id='sso-protocol'
                          className='w-full max-w-md'
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='oidc'>
                          {t('protocolOidc')}
                        </SelectItem>
                        <SelectItem value='saml' disabled={!hasPersistedSlug}>
                          {t('protocolSaml')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                  {!hasPersistedSlug ? (
                    <Alert>
                      <AlertCircle className='h-4 w-4' />
                      <AlertTitle>{t('samlSlugRequiredTitle')}</AlertTitle>
                      <AlertDescription>
                        {t('samlSlugRequiredDescription')}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                    <div>
                      <p className='font-medium'>{t('samlAcsLabel')}</p>
                      <p className='text-muted-foreground mt-1 font-mono text-xs break-all'>
                        {hasPersistedSlug ? samlAcsUrl : '—'}
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={!hasPersistedSlug || !samlAcsUrl}
                      onClick={() => {
                        if (!samlAcsUrl) return;
                        void copyText(samlAcsUrl, t('copied'));
                      }}
                    >
                      <Copy className='mr-1 size-4' />
                      {t('copy')}
                    </Button>
                  </div>
                  <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                    <div>
                      <p className='font-medium'>{t('samlSpMetadataLabel')}</p>
                      <p className='text-muted-foreground mt-1 font-mono text-xs break-all'>
                        {hasPersistedSlug ? samlSpMetadataUrl : '—'}
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={!hasPersistedSlug || !samlSpMetadataUrl}
                      onClick={() => {
                        if (!samlSpMetadataUrl) return;
                        void copyText(samlSpMetadataUrl, t('copied'));
                      }}
                    >
                      <Copy className='mr-1 size-4' />
                      {t('copy')}
                    </Button>
                  </div>
                </>
              )}

              {protocol === 'oidc' ? (
                <>
                  <FormField
                    control={ssoForm.control}
                    name='issuerUrl'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('issuerUrl')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('microsoftIssuerExample')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={ssoForm.control}
                    name='clientId'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('clientId')}</FormLabel>
                        <FormControl>
                          <Input
                            autoComplete='off'
                            placeholder={t('authClientIdExample')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={ssoForm.control}
                    name='clientSecret'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('clientSecret')}</FormLabel>
                        <FormControl>
                          <Input
                            type='password'
                            autoComplete='new-password'
                            placeholder={
                              secretSet ? t('clientSecretPlaceholderSet') : ''
                            }
                            {...field}
                          />
                        </FormControl>
                        {secretSet ? (
                          <FormDescription>
                            {t('secretSetHint')}
                          </FormDescription>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={ssoForm.control}
                    name='scopes'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('scopes')}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                <FormField
                  control={ssoForm.control}
                  name='samlIdpMetadataUrl'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('samlIdpMetadataUrl')}</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete='off'
                          placeholder={t('samlFederationMetadataExample')}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('samlIdpMetadataHint')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={ssoForm.control}
                name='emailDomainsStr'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('emailDomains')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('authTenantExample')} {...field} />
                    </FormControl>
                    <FormDescription>{t('emailDomainsHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type='submit'
                disabled={
                  patchSso.isPending ||
                  (protocol === 'saml' && !hasPersistedSlug)
                }
              >
                {patchSso.isPending ? t('saving') : t('saveSso')}
              </Button>
            </form>
          </Form>
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
                  aria-label={t('copyLink')}
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

  return (
    <OrganizationLoginSecurityForm
      company={company}
      sso={ssoQ.data.data}
      publicApiUrl={companyMe.data?.publicApiUrl}
      publicAppUrl={companyMe.data?.publicAppUrl}
    />
  );
}
