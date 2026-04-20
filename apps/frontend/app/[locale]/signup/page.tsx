'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/src/i18n/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { marketingPrivacyPolicyUrl } from '@/lib/marketing-privacy-url';
import { authSignup } from '@/lib/api/generated/auth';
import { useLocale, useTranslations } from 'next-intl';
import { useAuthContext } from '@/contexts/AuthContext';
import { useActiveCompany } from '@/contexts/ActiveCompanyContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { authAccessibleCompanies } from '@/lib/api/generated/auth';
import { isValidTenantSlug, normalizeTenantSlug } from '@quokkaq/shared-types';
import { getWordmarkSrc } from '@/lib/wordmark-src';

export default function SignupPage() {
  const t = useTranslations('signup');
  const locale = useLocale();
  const wordmarkSrc = getWordmarkSrc(locale);
  const searchParams = useSearchParams();
  const planCode = searchParams.get('plan')?.trim() || undefined;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySlugRaw, setCompanySlugRaw] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();
  const { login } = useAuthContext();
  const { setActiveCompanyId } = useActiveCompany();

  const normalizedSlug = useMemo(
    () => normalizeTenantSlug(companySlugRaw),
    [companySlugRaw]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    const cn = companyName.trim();
    if (!n || !em || !password || !cn) {
      toast.error(t('error'));
      return;
    }
    if (!privacyAccepted) {
      toast.error(t('privacyConsentRequired'));
      return;
    }
    const slugTrim = companySlugRaw.trim();
    let companySlug: string | undefined;
    if (slugTrim !== '') {
      const norm = normalizeTenantSlug(slugTrim);
      if (!isValidTenantSlug(norm)) {
        toast.error(t('companySlugInvalid'));
        return;
      }
      companySlug = norm;
    }

    setSubmitting(true);
    try {
      const res = await authSignup({
        name: n,
        email: em,
        password,
        companyName: cn,
        planCode,
        companySlug
      });
      if (res.status === 201 && res.data) {
        const token = res.data.accessToken ?? res.data.token;
        if (!token) {
          toast.error(t('error'));
          return;
        }
        await login(token);
        const acRes = await authAccessibleCompanies();
        if (acRes.status === 200 && (acRes.data.companies?.length ?? 0) === 1) {
          const id = acRes.data.companies?.[0]?.id;
          if (id) setActiveCompanyId(id);
        }
        router.push('/');
        return;
      }
      if (res.status === 409) {
        toast.error(t('conflict'));
        return;
      }
      toast.error(t('error'));
    } catch (err) {
      logger.error('Signup failed:', err);
      toast.error(t('error'));
    } finally {
      setSubmitting(false);
    }
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
              alt='QuokkaQ'
              fill
              className='object-contain object-left'
              priority
            />
          </div>
        </Link>
        <Card className='relative z-10 mx-auto w-full max-w-md'>
          <CardHeader className='text-center'>
            <CardTitle className='text-2xl'>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className='space-y-4'>
              <div className='grid gap-2'>
                <Label htmlFor='signup-name'>{t('name')}</Label>
                <Input
                  id='signup-name'
                  autoComplete='name'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='signup-email'>{t('email')}</Label>
                <Input
                  id='signup-email'
                  type='email'
                  autoComplete='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='signup-password'>{t('password')}</Label>
                <Input
                  id='signup-password'
                  type='password'
                  autoComplete='new-password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='signup-company'>{t('companyName')}</Label>
                <Input
                  id='signup-company'
                  autoComplete='organization'
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='signup-slug'>{t('companySlug')}</Label>
                <Input
                  id='signup-slug'
                  value={companySlugRaw}
                  onChange={(e) => setCompanySlugRaw(e.target.value)}
                  autoComplete='off'
                  placeholder='acme-corp'
                />
                <p className='text-muted-foreground text-xs'>
                  {t('companySlugHint')}
                </p>
                {companySlugRaw.trim() !== '' && normalizedSlug !== '' ? (
                  <p className='text-muted-foreground text-xs'>
                    → <span className='font-mono'>{normalizedSlug}</span>
                  </p>
                ) : null}
              </div>
              <div className='flex items-start gap-2'>
                <Checkbox
                  id='signup-privacy-consent'
                  checked={privacyAccepted}
                  onCheckedChange={(v) => setPrivacyAccepted(v === true)}
                  className='mt-0.5'
                />
                <label
                  htmlFor='signup-privacy-consent'
                  className='text-muted-foreground text-sm leading-snug'
                >
                  {t.rich('privacyConsent', {
                    link: (chunks) => (
                      <a
                        href={marketingPrivacyPolicyUrl(locale)}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-primary underline-offset-4 hover:underline'
                      >
                        {chunks}
                      </a>
                    )
                  })}
                </label>
              </div>
              <Button type='submit' className='w-full' disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    {t('submitting')}
                  </>
                ) : (
                  t('submit')
                )}
              </Button>
              <p className='text-muted-foreground text-center text-sm'>
                {t('hasAccount')}{' '}
                <Link
                  href='/login'
                  className='text-primary underline-offset-4 hover:underline'
                >
                  {t('signIn')}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className='relative hidden min-h-dvh flex-col items-center justify-center overflow-hidden lg:flex'>
        <div
          aria-hidden
          className='from-primary/10 via-chart-1/15 to-chart-2/20 dark:from-primary/12 dark:via-chart-2/12 dark:to-chart-1/8 absolute inset-0 bg-gradient-to-br'
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
        </div>
      </div>
    </div>
  );
}
