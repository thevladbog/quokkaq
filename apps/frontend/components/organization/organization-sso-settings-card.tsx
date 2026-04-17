'use client';

import { useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
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
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertCircle, Copy, Shield } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Company } from '@quokkaq/shared-types';
import {
  companiesMeSSOPatch,
  getCompaniesMeSSOGetQueryKey,
  type ServicesCompanySSOGetResponse,
  type ServicesCompanySSOPatch
} from '@/lib/api/generated/auth';
import {
  buildSsoPatchBody,
  createSsoFormSchema,
  resolvePublicApiBase,
  ssoDefaultsFromServer,
  ssoServerFingerprint,
  type SsoFormValues
} from '@/components/organization/organization-auth-shared';

type OrganizationSsoSettingsCardProps = {
  company: Company;
  sso: ServicesCompanySSOGetResponse;
  publicApiUrl?: string | null;
};

export function OrganizationSsoSettingsCard({
  company,
  sso,
  publicApiUrl
}: OrganizationSsoSettingsCardProps) {
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

  const ssoForm = useForm<SsoFormValues>({
    resolver: zodResolver(ssoSchema),
    defaultValues: ssoDefaultsFromServer(sso)
  });

  useEffect(() => {
    ssoForm.reset(ssoDefaultsFromServer(sso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssoFingerprint, ssoForm]);

  const protocol = useWatch({ control: ssoForm.control, name: 'protocol' });

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

  const onSubmitSso = ssoForm.handleSubmit((values) => {
    patchSso.mutate(buildSsoPatchBody(values));
  });

  const secretSet = !!sso.clientSecretSet;

  return (
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
                    onValueChange={(v) => field.onChange(v as 'oidc' | 'saml')}
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
                      <SelectItem value='oidc'>{t('protocolOidc')}</SelectItem>
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
                        <FormDescription>{t('secretSetHint')}</FormDescription>
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
                patchSso.isPending || (protocol === 'saml' && !hasPersistedSlug)
              }
            >
              {patchSso.isPending ? t('saving') : t('saveSso')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
