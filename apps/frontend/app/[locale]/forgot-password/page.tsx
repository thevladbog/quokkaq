'use client';

import { useState } from 'react';
import { Link } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
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
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const t = useTranslations('forgotPassword');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        }
      );

      if (response.ok) {
        setIsSuccess(true);
        toast.success(t('success'));
      } else {
        setIsSuccess(true);
        toast.success(t('success'));
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      toast.error('An error occurred');
    } finally {
      setIsSubmitting(false);
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
          {isSuccess ? (
            <div className='space-y-4 text-center'>
              <p className='text-green-600'>{t('success')}</p>
              <Button asChild className='w-full' variant='outline'>
                <Link href='/login'>{t('backToLogin')}</Link>
              </Button>
            </div>
          ) : (
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

              <Button type='submit' className='w-full' disabled={isSubmitting}>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
