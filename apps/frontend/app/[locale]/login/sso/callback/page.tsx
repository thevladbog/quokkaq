'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { useAuthContext } from '@/contexts/AuthContext';
import { authSSOExchange } from '@/lib/api/generated/auth';
import { logger } from '@/lib/logger';
import { Loader2 } from 'lucide-react';

export default function SSOLoginCallbackPage() {
  const t = useTranslations('login');
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const router = useRouter();
  const { login } = useAuthContext();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('missing_code');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authSSOExchange({ code });
        if (res.status !== 200 || !res.data?.accessToken) {
          throw new Error('exchange_failed');
        }
        if (cancelled) return;
        await login(res.data.accessToken);
        router.replace('/');
      } catch (e) {
        logger.error('SSO exchange failed', e);
        if (!cancelled) setError('exchange_failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, login, router]);

  if (error) {
    const message =
      error === 'missing_code'
        ? t('ssoCallbackErrorMissingCode')
        : error === 'exchange_failed'
          ? t('ssoCallbackErrorExchangeFailed')
          : t('ssoCallbackError');
    return (
      <div className='flex min-h-dvh flex-col items-center justify-center gap-4 p-6'>
        <p className='text-destructive text-center text-sm'>{message}</p>
      </div>
    );
  }

  return (
    <div className='flex min-h-dvh flex-col items-center justify-center gap-2'>
      <Loader2 className='text-muted-foreground size-8 animate-spin' />
      <p className='text-muted-foreground text-sm'>{t('ssoCallbackWorking')}</p>
    </div>
  );
}
