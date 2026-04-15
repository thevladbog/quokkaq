'use client';

import { useState, useEffect, Suspense } from 'react';
import { Link } from '@/src/i18n/navigation';
import { useSearchParams } from 'next/navigation';
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
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { postAuthResetPassword } from '@/lib/api/generated/auth';
import { ApiHttpError } from '@/lib/api';

function ResetPasswordContent() {
  const t = useTranslations('resetPassword');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error(t('error'));
    }
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('passwordsDontMatch'));
      return;
    }

    if (!token) {
      toast.error(t('error'));
      return;
    }

    setIsSubmitting(true);

    try {
      await postAuthResetPassword({ token, newPassword: password });
      setIsSuccess(true);
      toast.success(t('success'));
    } catch (error) {
      console.error('Reset password error:', error);
      const msg =
        error instanceof ApiHttpError
          ? error.message || t('error')
          : t('error');
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className='space-y-4 text-center'>
        <p className='text-green-600'>{t('success')}</p>
        <Button asChild className='w-full' variant='outline'>
          <Link href='/login'>{t('backToLogin')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='grid gap-2'>
        <Label htmlFor='password'>{t('password')}</Label>
        <Input
          id='password'
          type='password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder={t('passwordPlaceholder')}
        />
      </div>

      <div className='grid gap-2'>
        <Label htmlFor='confirmPassword'>{t('confirmPassword')}</Label>
        <Input
          id='confirmPassword'
          type='password'
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          placeholder={t('passwordPlaceholder')}
        />
      </div>

      <Button
        type='submit'
        className='w-full'
        disabled={isSubmitting || !token}
      >
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>

      <div className='text-center'>
        <Link
          href='/login'
          className='text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline'
        >
          {t('backToLogin')}
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations('resetPassword');

  return (
    <div className='bg-background relative flex min-h-screen items-center justify-center overflow-hidden p-4'>
      <Card className='relative z-10 w-full max-w-md'>
        <div className='mb-6 flex justify-center'>
          <div className='relative h-48 w-48'>
            <Image
              src='/quokka-logo.svg'
              alt='QuokkaQ Mascot'
              fill
              className='object-contain'
              priority
            />
          </div>
        </div>
        <CardHeader className='text-center'>
          <CardTitle className='text-2xl'>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading...</div>}>
            <ResetPasswordContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
