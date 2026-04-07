'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useLogin } from '@/lib/hooks';

export default function SetupPage() {
  const t = useTranslations('setup');
  const router = useRouter();
  const { login } = useAuthContext();
  const loginMutation = useLogin();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.password !== formData.confirmPassword) {
      setError(t('passwords_dont_match'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/system/setup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            password: formData.password
          })
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || t('error'));
      }

      setSuccess(t('success'));

      // Auto login after successful setup
      try {
        const response = await loginMutation.mutateAsync({
          email: formData.email,
          password: formData.password
        });

        if (response && response.accessToken) {
          login(response.accessToken);
          router.push('/admin');
        }
      } catch (loginError) {
        console.error('Auto-login failed:', loginError);
        // If auto-login fails, redirect to login page
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className='space-y-4'>
            {error && (
              <Alert variant='destructive'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className='border-green-200 bg-green-50 text-green-900'>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            <div className='space-y-2'>
              <Label htmlFor='name'>{t('name')}</Label>
              <Input
                id='name'
                name='name'
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='email'>{t('email')}</Label>
              <Input
                id='email'
                name='email'
                type='email'
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='password'>{t('password')}</Label>
              <Input
                id='password'
                name='password'
                type='password'
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='confirmPassword'>{t('confirm_password')}</Label>
              <Input
                id='confirmPassword'
                name='confirmPassword'
                type='password'
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          </CardContent>
          <CardFooter className='mt-6'>
            <Button
              type='submit'
              className='w-full'
              disabled={loading || !!success}
            >
              {loading ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  {t('submitting')}
                </>
              ) : (
                t('submit')
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
