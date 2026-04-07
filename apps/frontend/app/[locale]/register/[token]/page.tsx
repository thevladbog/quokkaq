'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
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

interface Invitation {
  id: string;
  email: string;
  status: 'active' | 'accepted' | 'inactive';
  expiresAt: string;
  createdAt: string;
  targetRoles?: string;
  targetUnits?: string;
}

export default function RegisterPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('register');
  const token = params.token as string;

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const fetchInvitation = useCallback(async () => {
    try {
      const response = await fetch(`/api/invitations/token/${token}`);

      if (response.ok) {
        const data = await response.json();
        setInvitation(data);
      } else {
        toast.error(t('invalid_token'));
        setTimeout(() => router.push('/'), 3000);
      }
    } catch {
      toast.error(t('error'));
    } finally {
      setLoading(false);
    }
  }, [token, t, router]);

  useEffect(() => {
    if (token) {
      fetchInvitation();
    }
  }, [token, fetchInvitation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('passwords_dont_match'));
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/invitations/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          name,
          password
        })
      });

      if (response.ok) {
        toast.success(t('success'));
        setTimeout(() => router.push('/login'), 2000);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || t('error'));
      }
    } catch {
      toast.error(t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='text-center'>
          <p className='text-lg'>{t('description')}</p>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <Card className='w-full max-w-md'>
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('invalid_token')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className='from-background to-muted flex min-h-screen items-center justify-center bg-gradient-to-br p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <Label htmlFor='email' className='mb-2 block'>
                {t('email')}
              </Label>
              <Input
                id='email'
                type='email'
                value={invitation.email}
                disabled
                className='bg-muted'
              />
            </div>

            <div>
              <Label htmlFor='name' className='mb-2 block'>
                {t('name')}
              </Label>
              <Input
                id='name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name')}
                required
              />
            </div>

            <div>
              <Label htmlFor='password' className='mb-2 block'>
                {t('password')}
              </Label>
              <Input
                id='password'
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='••••••••'
                minLength={6}
                required
              />
            </div>

            <div>
              <Label htmlFor='confirmPassword' className='mb-2 block'>
                {t('confirm_password')}
              </Label>
              <Input
                id='confirmPassword'
                type='password'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder='••••••••'
                minLength={6}
                required
              />
            </div>

            <Button type='submit' className='w-full' disabled={submitting}>
              {submitting ? t('registering') : t('register_button')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
