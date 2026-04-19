'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
  usePublicTenantBySlug,
  type authAccessibleCompaniesResponse,
  type AuthSSOAuthorizeParams,
  type HandlersAccessibleCompanyItem
} from '@/lib/api/generated/auth';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getWordmarkSrc } from '@/lib/wordmark-src';
import { TENANT_SLUG_MIN_LEN } from '@quokkaq/shared-types';

const MIN_TENANT_SLUG_LENGTH = TENANT_SLUG_MIN_LEN;

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
type SubStep = 'pick_method' | 'password';

export default function LoginPage() {
  const t = useTranslations('login');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const wordmarkSrc = getWordmarkSrc(locale);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subStep, setSubStep] = useState<SubStep>('pick_method');
  const [hintSlug, setHintSlug] = useState<string | null>(null);
  const [hintDisplay, setHintDisplay] = useState<string | null>(null);
  const [tenantBanner, setTenantBanner] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [step, setStep] = useState<Step>('form');
  /** True while resolving accessible companies after login so redirect/spinner logic does not run ahead of setStep('company'). */
  const [resolvingAccessibleCompanies, setResolvingAccessibleCompanies] =
    useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ssoErrorCode, setSsoErrorCode] = useState<SSOErrorCode | null>(null);
  const [ssoModalOpen, setSsoModalOpen] = useState(false);
  const [ssoModalSlug, setSsoModalSlug] = useState('');
  const [debouncedSsoModalSlug, setDebouncedSsoModalSlug] = useState('');
  const [ssoModalPrepareLoading, setSsoModalPrepareLoading] = useState(false);
  const legacySessionRecoveryAttemptedRef = useRef(false);
  const router = useRouter();
  const loginMutation = useLogin();
  const {
    login,
    isAuthenticated,
    user,
    token,
    isLoading: isAuthLoading
  } = useAuthContext();
  const { setActiveCompanyId } = useActiveCompany();

  const passwordTenantSlug = useMemo(
    () => (hintSlug || '').trim() || undefined,
    [hintSlug]
  );

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSsoModalSlug(ssoModalSlug.trim()),
      300
    );
    return () => clearTimeout(timer);
  }, [ssoModalSlug]);

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

  const publicTenantForSso = usePublicTenantBySlug(debouncedSsoModalSlug, {
    query: {
      enabled:
        ssoModalOpen && debouncedSsoModalSlug.length >= MIN_TENANT_SLUG_LENGTH,
      staleTime: 60_000
    }
  });

  const publicTenantPayload =
    publicTenantForSso.data?.status === 200 &&
    publicTenantForSso.data.data &&
    typeof publicTenantForSso.data.data === 'object'
      ? publicTenantForSso.data.data
      : undefined;

  const ssoTenantResolved = !!publicTenantPayload;
  const ssoReady = !!(
    publicTenantPayload && publicTenantPayload.ssoAvailable === true
  );

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
            setSubStep('password');
          }
        } catch {
          /* ignore */
        }
      })();
    }
  }, [searchParams]);

  const startPasswordFlow = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t('emailRequired'));
      return;
    }
    setHintLoading(true);
    try {
      const res = await authTenantHint({ email: trimmed });
      if (res.status !== 200 || !res.data) {
        throw new Error('hint');
      }
      const d = res.data;
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

  const openSsoModal = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t('emailRequired'));
      return;
    }
    setSsoModalPrepareLoading(true);
    try {
      const res = await authTenantHint({ email: trimmed });
      let initial = '';
      if (res.status === 200 && res.data) {
        const d = res.data;
        initial = (d.tenantSlug ?? '').trim();
        if (d.displayName) {
          setTenantBanner(d.displayName);
        }
        setHintSlug(d.tenantSlug ?? null);
      }
      if (!initial) {
        initial = (hintSlug || '').trim();
      }
      setSsoModalSlug(initial);
      setSsoModalOpen(true);
    } catch {
      setSsoModalSlug((hintSlug || '').trim());
      setSsoModalOpen(true);
      toast.error(t('error'));
    } finally {
      setSsoModalPrepareLoading(false);
    }
  };

  const sessionResolving = Boolean(token && !user);

  const finalizeLoginAfterToken = useCallback(
    async (accessToken: string) => {
      setResolvingAccessibleCompanies(true);
      try {
        await login(accessToken);
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
        router.replace('/');
      } finally {
        setResolvingAccessibleCompanies(false);
      }
    },
    [login, router, setActiveCompanyId]
  );

  useEffect(() => {
    if (ssoErrorCode) return;
    if (resolvingAccessibleCompanies) return;
    if (step === 'company') return;
    if (isAuthenticated && user) {
      router.replace('/');
    }
  }, [
    isAuthenticated,
    user,
    router,
    ssoErrorCode,
    resolvingAccessibleCompanies,
    step
  ]);

  useEffect(() => {
    if (ssoErrorCode) return;
    if (isAuthLoading || sessionResolving) return;
    if (isAuthenticated && user) return;
    if (legacySessionRecoveryAttemptedRef.current) return;
    if (typeof window === 'undefined') return;
    const at = localStorage.getItem('access_token')?.trim();
    if (!at) return;
    legacySessionRecoveryAttemptedRef.current = true;
    void finalizeLoginAfterToken(at).catch(() => {
      legacySessionRecoveryAttemptedRef.current = false;
    });
  }, [
    isAuthLoading,
    sessionResolving,
    isAuthenticated,
    user,
    finalizeLoginAfterToken,
    ssoErrorCode
  ]);

  if (
    isAuthLoading ||
    sessionResolving ||
    (isAuthenticated && user && step !== 'company')
  ) {
    return (
      <div className='bg-background flex min-h-dvh items-center justify-center'>
        <Loader2 className='text-primary h-8 w-8 animate-spin' />
      </div>
    );
  }

  const confirmSsoRedirect = () => {
    const slugFromInput = ssoModalSlug.trim();
    const slugValidated = debouncedSsoModalSlug.trim();
    if (!slugFromInput) {
      toast.error(t('ssoSlugRequired'));
      return;
    }
    if (slugFromInput !== slugValidated) {
      toast.error(t('ssoSlugWaitValidation'));
      return;
    }
    if (!ssoReady) {
      toast.error(t('ssoNotEnabled'));
      return;
    }
    window.location.href =
      '/api' +
      getAuthSSOAuthorizeUrl({
        tenant: slugValidated,
        locale: toAuthSSOAuthorizeLocale(locale)
      });
  };

  const backToPickMethod = () => {
    setSubStep('pick_method');
    setPassword('');
    setHintSlug(null);
    setHintDisplay(null);
    setHintLoading(false);
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
        tenantSlug: passwordTenantSlug
      });

      if (response && response.accessToken) {
        await finalizeLoginAfterToken(response.accessToken);
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
    router.replace('/');
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
                {subStep === 'pick_method' ? (
                  <div className='space-y-4'>
                    <p className='text-muted-foreground text-center text-sm'>
                      {t('pickMethodDescription')}
                    </p>
                    <div className='grid gap-2'>
                      <Label htmlFor='email'>{t('workEmail')}</Label>
                      <Input
                        id='email'
                        name='username'
                        type='email'
                        inputMode='email'
                        autoComplete='username'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder={t('emailPlaceholder')}
                      />
                    </div>
                    <Button
                      type='button'
                      className='w-full'
                      disabled={hintLoading || ssoModalPrepareLoading}
                      onClick={() => void startPasswordFlow()}
                    >
                      {hintLoading ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        t('signInWithPassword')
                      )}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      className='w-full'
                      disabled={hintLoading || ssoModalPrepareLoading}
                      onClick={() => void openSsoModal()}
                    >
                      {ssoModalPrepareLoading ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        t('signInWithSso')
                      )}
                    </Button>
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
                        name='username'
                        type='email'
                        inputMode='email'
                        autoComplete='username'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder={t('emailPlaceholder')}
                      />
                    </div>

                    <div className='grid gap-2'>
                      <Label htmlFor='password'>{t('password')}</Label>
                      <Input
                        id='password'
                        name='password'
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
                      onClick={backToPickMethod}
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

      <Dialog
        open={ssoModalOpen}
        onOpenChange={(open) => {
          setSsoModalOpen(open);
          if (!open) {
            setSsoModalSlug('');
            setDebouncedSsoModalSlug('');
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('ssoDialogTitle')}</DialogTitle>
            <DialogDescription>{t('ssoDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='sso-modal-slug'>{t('tenantSlug')}</Label>
            <Input
              id='sso-modal-slug'
              value={ssoModalSlug}
              onChange={(e) => setSsoModalSlug(e.target.value)}
              placeholder={t('tenantSlugHint')}
              autoComplete='organization'
              disabled={ssoModalPrepareLoading}
            />
            {debouncedSsoModalSlug.length >= MIN_TENANT_SLUG_LENGTH ? (
              <p className='text-muted-foreground min-h-[1.25rem] text-sm'>
                {publicTenantForSso.isLoading ? (
                  <span className='inline-flex items-center gap-2'>
                    <Loader2 className='size-3.5 animate-spin' />…
                  </span>
                ) : ssoTenantResolved ? (
                  <>
                    <span className='text-foreground font-medium'>
                      {publicTenantPayload?.displayName}
                    </span>
                    {!publicTenantPayload?.ssoAvailable ? (
                      <span className='text-destructive block'>
                        {t('ssoNotEnabled')}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className='text-destructive'>
                    {t('ssoTenantNotFound')}
                  </span>
                )}
              </p>
            ) : null}
          </div>
          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setSsoModalOpen(false)}
            >
              {t('ssoDialogCancel')}
            </Button>
            <Button
              type='button'
              disabled={
                ssoModalPrepareLoading ||
                !ssoReady ||
                debouncedSsoModalSlug.length < MIN_TENANT_SLUG_LENGTH ||
                ssoModalSlug.trim() !== debouncedSsoModalSlug.trim()
              }
              onClick={confirmSsoRedirect}
            >
              {t('continueSso')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
