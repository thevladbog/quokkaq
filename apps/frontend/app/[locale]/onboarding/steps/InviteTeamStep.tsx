'use client';

import { useState } from 'react';
import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Plus, X, UserPlus, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingInvite, OnboardingWizardStepProps } from '../types';
import { newInviteRow, normalizeInviteRows } from '../types';

export function InviteTeamStep({
  state,
  onNext,
  onBack,
  onSkip
}: OnboardingWizardStepProps) {
  const t = useTranslations('onboarding.team');

  const [invites, setInvites] = useState<OnboardingInvite[]>(() =>
    state.invites && state.invites.length > 0
      ? normalizeInviteRows(state.invites)
      : [newInviteRow()]
  );

  const addInvite = () => {
    setInvites((prev) => [...prev, newInviteRow()]);
  };

  const removeInvite = (id: string) => {
    setInvites((prev) => prev.filter((inv) => inv.id !== id));
  };

  const updateInvite = (
    id: string,
    field: keyof Pick<OnboardingInvite, 'email' | 'role'>,
    value: string
  ) => {
    setInvites((prev) =>
      prev.map((inv) => (inv.id === id ? { ...inv, [field]: value } : inv))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validInvites = invites.filter((inv) => inv.email.trim() !== '');

    if (validInvites.length === 0) {
      onSkip();
      return;
    }

    onNext({ invites: validInvites });
  };

  const canAddMore = invites.length < 10;

  return (
    <form onSubmit={handleSubmit}>
      <CardHeader>
        <div className='mb-2 flex items-center gap-3'>
          <UserPlus className='h-8 w-8 text-blue-600' />
          <CardTitle className='text-2xl'>{t('title')}</CardTitle>
        </div>
        <p className='text-gray-600'>{t('subtitle')}</p>
      </CardHeader>

      <CardContent className='space-y-6'>
        <div className='space-y-4'>
          {invites.map((invite) => (
            <div
              key={invite.id}
              className='relative space-y-3 rounded-lg border p-4'
            >
              {invites.length > 1 && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute top-2 right-2'
                  onClick={() => removeInvite(invite.id)}
                  aria-label={t('removeInviteAria')}
                >
                  <X className='h-4 w-4' />
                </Button>
              )}

              <div className='grid gap-3 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor={`email-${invite.id}`}>
                    {t('emailLabel')}{' '}
                    <span className='text-red-500'>{t('required')}</span>
                  </Label>
                  <div className='relative'>
                    <Mail className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400' />
                    <Input
                      id={`email-${invite.id}`}
                      type='email'
                      placeholder={t('emailPlaceholder')}
                      value={invite.email}
                      onChange={(e) =>
                        updateInvite(invite.id, 'email', e.target.value)
                      }
                      className='pl-10'
                      required={invite.id === invites[0]?.id}
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor={`role-${invite.id}`}>
                    {t('roleLabel')}{' '}
                    <span className='text-red-500'>{t('required')}</span>
                  </Label>
                  <Select
                    value={invite.role}
                    onValueChange={(value) =>
                      updateInvite(invite.id, 'role', value)
                    }
                  >
                    <SelectTrigger id={`role-${invite.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='staff'>{t('roles.staff')}</SelectItem>
                      <SelectItem value='supervisor'>
                        {t('roles.supervisor')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {canAddMore && (
          <Button
            type='button'
            variant='outline'
            onClick={addInvite}
            className='w-full'
          >
            <Plus className='mr-2 h-4 w-4' />
            {t('addAnother')}
          </Button>
        )}

        <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
          <p className='mb-2 text-sm text-blue-800'>
            <strong>{t('rolesHelp.title')}</strong>
          </p>
          <ul className='ml-4 space-y-1 text-sm text-blue-800'>
            <li>
              <strong>{t('roles.staff')}</strong> - {t('rolesHelp.staff')}
            </li>
            <li>
              <strong>{t('roles.supervisor')}</strong> -{' '}
              {t('rolesHelp.supervisor')}
            </li>
          </ul>
        </div>

        <div className='rounded-lg border border-yellow-200 bg-yellow-50 p-4'>
          <p className='text-sm text-yellow-800'>
            <strong>{t('canSkip')}:</strong> {t('canSkipDesc')}
          </p>
        </div>
      </CardContent>

      <CardFooter className='flex justify-between'>
        <Button type='button' variant='outline' onClick={() => onBack?.()}>
          {t('back')}
        </Button>
        <div className='flex gap-2'>
          <Button type='button' variant='ghost' onClick={() => onSkip?.()}>
            {t('skip')}
          </Button>
          <Button type='submit'>{t('continue')}</Button>
        </div>
      </CardFooter>
    </form>
  );
}
