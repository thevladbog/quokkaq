'use client';

import { useState } from 'react';
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
import { useTranslations } from 'next-intl';
import { useAuthContext } from '@/contexts/AuthContext';

export default function LoginPage() {
  const t = useTranslations('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  const loginMutation = useLogin();
  const { login } = useAuthContext(); // Get the login function from auth context

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await loginMutation.mutateAsync({ email, password });

      // Use the login function from context to update auth state
      if (response && response.accessToken) {
        login(response.accessToken);
      }

      // Redirect to home page (locale is handled by router)
      router.push('/');
    } catch (error) {
      console.error('Login failed:', error);
      // Handle login error (show message to user)
    }
  };

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
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='grid gap-2'>
              <Label htmlFor='email'>{t('email')}</Label>
              <Input
                id='email'
                type='email'
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
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={t('passwordPlaceholder')}
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
