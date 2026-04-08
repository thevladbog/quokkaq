'use client';

import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  CheckCircle,
  Users,
  Building2,
  Settings
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const t = useTranslations('onboarding.welcome');

  return (
    <>
      <CardHeader className='pb-6 text-center'>
        <div className='mb-4 flex justify-center'>
          <div className='rounded-full bg-blue-100 p-4'>
            <Sparkles className='h-12 w-12 text-blue-600' />
          </div>
        </div>
        <CardTitle className='mb-2 text-3xl'>{t('title')}</CardTitle>
        <p className='text-lg text-gray-600'>{t('subtitle')}</p>
      </CardHeader>

      <CardContent className='space-y-6'>
        <div className='space-y-4'>
          <div className='flex items-start gap-4 rounded-lg bg-gray-50 p-4'>
            <Building2 className='mt-1 h-6 w-6 flex-shrink-0 text-blue-600' />
            <div>
              <h3 className='mb-1 font-semibold'>{t('steps.unit.title')}</h3>
              <p className='text-sm text-gray-600'>{t('steps.unit.desc')}</p>
            </div>
          </div>

          <div className='flex items-start gap-4 rounded-lg bg-gray-50 p-4'>
            <Settings className='mt-1 h-6 w-6 flex-shrink-0 text-blue-600' />
            <div>
              <h3 className='mb-1 font-semibold'>
                {t('steps.services.title')}
              </h3>
              <p className='text-sm text-gray-600'>
                {t('steps.services.desc')}
              </p>
            </div>
          </div>

          <div className='flex items-start gap-4 rounded-lg bg-gray-50 p-4'>
            <Users className='mt-1 h-6 w-6 flex-shrink-0 text-blue-600' />
            <div>
              <h3 className='mb-1 font-semibold'>{t('steps.team.title')}</h3>
              <p className='text-sm text-gray-600'>{t('steps.team.desc')}</p>
            </div>
          </div>

          <div className='flex items-start gap-4 rounded-lg bg-gray-50 p-4'>
            <CheckCircle className='mt-1 h-6 w-6 flex-shrink-0 text-green-600' />
            <div>
              <h3 className='mb-1 font-semibold'>
                {t('steps.complete.title')}
              </h3>
              <p className='text-sm text-gray-600'>
                {t('steps.complete.desc')}
              </p>
            </div>
          </div>
        </div>

        <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
          <p className='text-sm text-blue-800'>
            <strong>💡 {t('tip')}:</strong> {t('tipDesc')}
          </p>
        </div>
      </CardContent>

      <CardFooter className='flex justify-end'>
        <Button onClick={onNext} size='lg'>
          {t('start')}
        </Button>
      </CardFooter>
    </>
  );
}
