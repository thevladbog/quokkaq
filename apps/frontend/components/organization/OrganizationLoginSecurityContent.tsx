'use client';

import { useMemo, useState } from 'react';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
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

function apiPublicBase(): string {
  const u = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3001';
}

function appPublicBase(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3000';
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
  return emailDomainsStr
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const slugFormSchema = z.object({
  slug: z.string()
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
};

function OrganizationLoginSecurityForm({ company, sso }: LoginFormProps) {
  const t = useTranslations('organization.loginSecurity');
  const locale = useLocale();
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

  const slugDefaults = useMemo<SlugFormValues>(
    () => ({ slug: company.slug ?? '' }),
    [company.slug]
  );

  const ssoDefaults = useMemo<SsoFormValues>(
    () => ({
      enabled: !!sso.enabled,
      protocol: sso.ssoProtocol === 'saml' ? 'saml' : 'oidc',
      issuerUrl: sso.issuerUrl ?? '',
      clientId: sso.clientId ?? '',
      clientSecret: '',
      scopes: sso.scopes ?? 'openid email profile',
      samlIdpMetadataUrl: sso.samlIdpMetadataUrl ?? '',
      emailDomainsStr: (sso.emailDomains ?? []).join(', ')
    }),
    [sso]
  );

  const slugForm = useForm<SlugFormValues>({
    resolver: zodResolver(slugFormSchema),
    defaultValues: slugDefaults
  });

  const ssoForm = useForm<SsoFormValues>({
    resolver: zodResolver(ssoSchema),
    defaultValues: ssoDefaults
  });

  const protocol = useWatch({ control: ssoForm.control, name: 'protocol' });

  const [opaqueLink, setOpaqueLink] = useState<{
    token: string;
    exampleUrl: string;
  } | null>(null);

  const oidcRedirectUri = useMemo(
    () => `${apiPublicBase()}/auth/sso/callback`,
    []
  );

  const samlAcsUrl = useMemo(() => {
    const slug = (company.slug ?? '').trim();
    if (!slug) return '';
    return `${apiPublicBase()}/auth/saml/acs?tenant=${encodeURIComponent(slug)}`;
  }, [company.slug]);

  const samlSpMetadataUrl = useMemo(() => {
    const slug = (company.slug ?? '').trim();
    if (!slug) return '';
    return `${apiPublicBase()}/auth/saml/metadata?tenant=${encodeURIComponent(slug)}`;
  }, [company.slug]);

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
        `${appPublicBase()}/${locale}/login?login_token=${encodeURIComponent(token)}`;
      return { token, exampleUrl: example };
    },
    onSuccess: (data) => {
      setOpaqueLink(data);
      toast.success(t('linkCreated'));
    },
    onError: () => toast.error(t('linkError'))
  });

  const onSubmitSlug = slugForm.handleSubmit((values) => {
    patchSlug.mutate(values.slug.trim());
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
                    <p className='text-muted-foreground text-xs'>
                      {t('slugHint')}
                    </p>
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
                      <p className='text-muted-foreground text-xs'>
                        {t('enabledHint')}
                      </p>
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
                            placeholder='https://login.microsoftonline.com/.../v2.0'
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
                          <Input autoComplete='off' {...field} />
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
                          <p className='text-muted-foreground text-xs'>
                            {t('secretSetHint')}
                          </p>
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
                          placeholder='https://…/federationmetadata/2007-06/federationmetadata.xml'
                          {...field}
                        />
                      </FormControl>
                      <p className='text-muted-foreground text-xs'>
                        {t('samlIdpMetadataHint')}
                      </p>
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
                      <Input
                        placeholder='example.com, example.org'
                        {...field}
                      />
                    </FormControl>
                    <p className='text-muted-foreground text-xs'>
                      {t('emailDomainsHint')}
                    </p>
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
