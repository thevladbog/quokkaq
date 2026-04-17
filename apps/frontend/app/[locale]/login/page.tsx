'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/src/i18n/navigation';
import Image from 'next/image';
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
import { useLogin } from '@/lib/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { useAuthContext } from '@/contexts/AuthContext';
import { useActiveCompany } from '@/contexts/ActiveCompanyContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import {
  authAccessibleCompanies,
  authLoginContext,
  authTenantHint,
  getAuthSSOAuthorizeUrl,
  publicTenantBySlug,
  useAuthAccessibleCompanies,
  type authAccessibleCompaniesResponse,
  type AuthSSOAuthorizeParams,
  type HandlersAccessibleCompanyItem
} from '@/lib/api/generated/auth';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Alert, AlertDescription } from '@/components/ui/alert';

function toAuthSSOAuthorizeLocale(
  loc: string
): AuthSSOAuthorizeParams['locale'] {
  if (loc === 'en' || loc === 'ru') return loc;
  return undefined;
}

const SSO_ERROR_CODES = [
  'no_tenant_access',
  'not_provisioned',
  'email_required',
  'denied',
  'email_unverified',
  'saml_email_missing'
] as const;

type SSOErrorCode = (typeof SSO_ERROR_CODES)[number];

function normalizeSsoErrorCode(raw: string | null): SSOErrorCode | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  for (const c of SSO_ERROR_CODES) {
    if (c === v) return c;
  }
  return 'denied';
}

type Step = 'form' | 'company';
type SubStep = 'email' | 'password';

export default function LoginPage() {
  const t = useTranslations('login');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const wordmarkSrc = locale === 'ru' ? '/logo-text-ru.svg' : '/logo-text.svg';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlugManual, setTenantSlugManual] = useState('');
  const [subStep, setSubStep] = useState<SubStep>('email');
  const [hintNext, setHintNext] = useState<string | null>(null);
  const [hintSso, setHintSso] = useState(false);
  const [hintSlug, setHintSlug] = useState<string | null>(null);
  const [hintDisplay, setHintDisplay] = useState<string | null>(null);
  const [tenantBanner, setTenantBanner] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [companySearch, setCompanySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ssoErrorCode, setSsoErrorCode] = useState<SSOErrorCode | null>(null);
  const router = useRouter();
  const loginMutation = useLogin();
  const { login } = useAuthContext();
  const { setActiveCompanyId } = useActiveCompany();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(companySearch), 300);
    return () => clearTimeout(timer);
  }, [companySearch]);

  useEffect(() => {
    const code = normalizeSsoErrorCode(searchParams.get('sso_error'));
    if (!code) return;
    setSsoErrorCode(code);
    router.replace('/login');
  }, [searchParams, router]);

  const accessibleCompaniesParams = useMemo(() => {
    const q = debouncedSearch.trim();
    return q !== '' ? { q } : undefined;
  }, [debouncedSearch]);

  const {
    data: companyRows = [],
    isLoading: companiesLoading,
    isError: companiesError
  } = useAuthAccessibleCompanies(accessibleCompaniesParams, {
    query: {
      enabled: step === 'company',
      select: (r: authAccessibleCompaniesResponse) => {
        if (r.status !== 200) {
          throw new Error('accessible_companies_failed');
        }
        return r.data.companies ?? [];
      }
    }
  });

  useEffect(() => {
    const tenant = searchParams.get('tenant')?.trim();
    const loginToken = searchParams.get('login_token')?.trim();
    if (loginToken) {
      void (async () => {
        try {
          const res = await authLoginContext({ token: loginToken });
          if (res.status === 200 && res.data) {
            setTenantBanner(res.data.displayName ?? res.data.slug ?? '');
            setHintSlug(res.data.slug ?? null);
            setHintSso(!!res.data.ssoAvailable);
            setSubStep('password');
          }
        } catch {
          /* ignore */
        }
      })();
      return;
    }
    if (tenant) {
      void (async () => {
        try {
          const res = await publicTenantBySlug(tenant);
          if (res.status === 200 && res.data) {
            setTenantBanner(res.data.displayName ?? tenant);
            setHintSlug(res.data.slug ?? tenant);
            setHintSso(!!res.data.ssoAvailable);
            setSubStep('password');
          }
        } catch {
          /* ignore */
        }
      })();
    }
  }, [searchParams]);

  const continueFromEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t('email'));
      return;
    }
    setHintLoading(true);
    try {
      const res = await authTenantHint({ email: trimmed });
      if (res.status !== 200 || !res.data) {
        throw new Error('hint');
      }
      const d = res.data;
      setHintNext(d.next ?? null);
      setHintSso(!!d.ssoAvailable);
      setHintSlug(d.tenantSlug ?? null);
      setHintDisplay(d.displayName ?? null);
      if (d.displayName) {
        setTenantBanner(d.displayName);
      }
      setSubStep('password');
    } catch {
      toast.error(t('error'));
    } finally {
      setHintLoading(false);
    }
  };

  const effectiveSlug =
    (hintSlug || '').trim() || tenantSlugManual.trim() || '';

  const startSso = () => {
    if (!effectiveSlug) {
      toast.error(t('tenantSlug'));
      return;
    }
    window.location.href =
      '/api' +
      getAuthSSOAuthorizeUrl({
        tenant: effectiveSlug,
        locale: toAuthSSOAuthorizeLocale(locale)
      });
  };

  const backToEmailStep = () => {
    setSubStep('email');
    setHintNext(null);
    setHintSso(false);
    setHintSlug(null);
    setHintDisplay(null);
    if (
      !searchParams.get('tenant')?.trim() &&
      !searchParams.get('login_token')?.trim()
    ) {
      setTenantBanner(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await loginMutation.mutateAsync({
        email,
        password,
        tenantSlug: effectiveSlug || undefined
      });

      if (response && response.accessToken) {
        await login(response.accessToken);
        const acRes = await authAccessibleCompanies();
        if (acRes.status !== 200) {
          throw new Error('accessible_companies_failed');
        }
        const companies = acRes.data.companies ?? [];
        if (companies.length > 1) {
          setStep('company');
          return;
        }
        if (companies.length === 1 && companies[0].id) {
          setActiveCompanyId(companies[0].id);
        }
        router.push('/');
      }
    } catch (error) {
      logger.error('Login failed:', error);
    }
  };

  const pickCompany = (c: HandlersAccessibleCompanyItem) => {
    if (!c.id) {
      logger.warn('pickCompany: missing company id', { name: c.name });
      toast.error(t('error'));
      return;
    }
    setActiveCompanyId(c.id);
    router.push('/');
  };

  return (
    <div className='bg-background relative grid min-h-dvh lg:grid-cols-2'>
      <div className='absolute top-6 right-4 z-30 flex items-center gap-1 sm:right-8 lg:right-12 xl:right-16'>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className='relative flex flex-col justify-center px-4 pt-16 pb-8 sm:px-8 sm:pt-20 lg:px-12 xl:px-16'>
        <Link
          href='/'
          className='absolute top-6 left-4 z-20 sm:left-8 lg:left-12 xl:left-16'
        >
          <div className='relative h-9 w-40'>
            <Image
              src={wordmarkSrc}
              alt={t('brandName')}
              fill
              className='object-contain object-left'
              priority
            />
          </div>
        </Link>
        <Card
          className='relative z-10 mx-auto w-full max-w-md'
          data-testid='e2e-login-card'
        >
          {step === 'form' ? (
            <>
              <CardHeader className='text-center'>
                <CardTitle className='text-2xl'>{t('title')}</CardTitle>
                <CardDescription>
                  {subStep === 'password' && (tenantBanner || hintDisplay)
                    ? t('passwordStepDescription', {
                        org: tenantBanner || hintDisplay || ''
                      })
                    : t('description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ssoErrorCode ? (
                  <Alert variant='destructive' className='mb-4'>
                    <AlertDescription>
                      {t(`ssoError.${ssoErrorCode}`)}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {subStep === 'email' ? (
                  <div className='space-y-4'>
                    <div className='grid gap-2'>
                      <Label htmlFor='email'>{t('workEmail')}</Label>
                      <Input
                        id='email'
                        type='email'
                        autoComplete='email'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder={t('emailPlaceholder')}
                      />
                    </div>
                    <Button
                      type='button'
                      className='w-full'
                      onClick={() => void continueFromEmail()}
                      disabled={hintLoading}
                    >
                      {hintLoading ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        t('continue')
                      )}
                    </Button>
                    <button
                      type='button'
                      className='text-muted-foreground hover:text-primary w-full text-center text-sm underline-offset-4 hover:underline'
                      onClick={() => setSubStep('password')}
                    >
                      {t('combinedLoginLink')}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className='space-y-4'>
                    {tenantBanner ? (
                      <div className='bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-sm'>
                        {tenantBanner}
                      </div>
                    ) : null}

                    <div className='grid gap-2'>
                      <Label htmlFor='login-email'>{t('email')}</Label>
                      <Input
                        id='login-email'
                        type='email'
                        autoComplete='email'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder={t('emailPlaceholder')}
                      />
                    </div>

                    {hintNext === 'choose_slug' && !hintSlug?.trim() ? (
                      <div className='grid gap-2'>
                        <Label htmlFor='tenant-slug'>{t('tenantSlug')}</Label>
                        <Input
                          id='tenant-slug'
                          value={tenantSlugManual}
                          onChange={(e) => setTenantSlugManual(e.target.value)}
                          placeholder={t('tenantSlugHint')}
                          autoComplete='organization'
                        />
                      </div>
                    ) : null}

                    <div className='grid gap-2'>
                      <Label htmlFor='password'>{t('password')}</Label>
                      <Input
                        id='password'
                        type='password'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder={t('passwordPlaceholder')}
                        autoComplete='current-password'
                      />
                    </div>

                    <div className='flex justify-end'>
                      <Link
                        href='/forgot-password'
                        className='text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline'
                      >
                        {t('forgotPassword')}
                      </Link>
                    </div>

                    {hintSso ? (
                      <Button
                        type='button'
                        variant='outline'
                        className='w-full'
                        onClick={startSso}
                      >
                        {t('continueSso')}
                      </Button>
                    ) : null}

                    {loginMutation.isError && (
                      <div className='text-sm text-red-600'>{t('error')}</div>
                    )}

                    <Button
                      type='submit'
                      className='w-full'
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? t('signingIn') : t('signIn')}
                    </Button>

                    <button
                      type='button'
                      className='text-muted-foreground hover:text-primary w-full text-center text-sm underline-offset-4 hover:underline'
                      onClick={backToEmailStep}
                    >
                      {t('changeEmail')}
                    </button>
                  </form>
                )}
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className='text-center'>
                <CardTitle className='text-2xl'>
                  {t('chooseOrganization')}
                </CardTitle>
                <CardDescription>
                  {t('chooseOrganizationDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid gap-2'>
                  <Label htmlFor='org-search'>{t('searchOrganizations')}</Label>
                  <Input
                    id='org-search'
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder={t('searchOrganizations')}
                    autoComplete='off'
                  />
                </div>
                <div className='max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto pr-1'>
                  {companiesLoading ? (
                    <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                      <Loader2 className='size-4 animate-spin' />…
                    </div>
                  ) : companiesError ? (
                    <div className='text-sm text-red-600'>{t('error')}</div>
                  ) : (
                    companyRows.map((c) => (
                      <button
                        key={c.id}
                        type='button'
                        onClick={() => pickCompany(c)}
                        className='border-border hover:bg-muted/60 flex w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left transition-colors'
                      >
                        <span className='font-medium'>{c.name}</span>
                        {(c.legalName || c.inn) && (
                          <span className='text-muted-foreground text-xs'>
                            {c.legalName ? (
                              <>
                                {t('legalEntity')}: {c.legalName}
                                {c.inn ? ' · ' : ''}
                              </>
                            ) : null}
                            {c.inn ? (
                              <>
                                {t('inn')}: {c.inn}
                              </>
                            ) : null}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <div className='relative hidden min-h-dvh flex-col items-center justify-center overflow-hidden lg:flex'>
        <div
          aria-hidden
          className='from-primary/10 via-chart-1/15 to-chart-2/20 dark:from-primary/12 dark:via-chart-2/12 dark:to-chart-1/8 absolute inset-0 bg-gradient-to-br'
        />
        <div
          aria-hidden
          className='bg-chart-1/25 dark:bg-chart-2/15 absolute top-[-10%] -left-[20%] h-[min(55vh,28rem)] w-[min(55vh,28rem)] rounded-full blur-3xl'
        />
        <div
          aria-hidden
          className='bg-chart-2/20 dark:bg-chart-1/10 absolute -right-[15%] bottom-[-15%] h-[min(45vh,24rem)] w-[min(45vh,24rem)] rounded-full blur-3xl'
        />
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.28]'
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '36px 36px',
            color: 'var(--foreground)'
          }}
        />
        <div className='relative z-10 flex max-w-lg flex-col items-center gap-6 px-8 text-center'>
          <div className='bg-card/50 border-border/60 dark:bg-card/25 relative h-[min(52vw,20rem)] w-[min(52vw,20rem)] max-w-full shrink-0 overflow-hidden rounded-3xl border shadow-sm'>
            <Image
              src='/quokka-logo.svg'
              alt=''
              fill
              className='object-contain p-4'
              sizes='(min-width: 1024px) 320px, 0px'
              priority
            />
          </div>
          <div className='space-y-2'>
            <h2 className='text-foreground text-2xl font-semibold tracking-tight'>
              {t('brandName')}
            </h2>
            <p className='text-muted-foreground max-w-md text-sm leading-relaxed text-pretty'>
              {t('brandTagline')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
