'use client';

import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingWizardStepProps } from '../types';

export function CompleteStep({
  state,
  onComplete,
  isPending = false
}: OnboardingWizardStepProps) {
  const t = useTranslations('onboarding.complete');

  const summary = {
    unit: state.unit?.name || t('canAddLater'),
    services: state.services?.length || 0,
    invites: state.invites?.length || 0
  };

  return (
    <>
      <CardHeader className='pb-6 text-center'>
        <div className='mb-4 flex justify-center'>
          <div className='rounded-full bg-green-100 p-4'>
            <CheckCircle className='h-16 w-16 text-green-600' />
          </div>
        </div>
        <CardTitle className='mb-2 text-3xl'>{t('title')}</CardTitle>
        <p className='text-lg text-gray-600'>{t('subtitle')}</p>
      </CardHeader>

      <CardContent className='space-y-6'>
        {/* Summary */}
        <div className='space-y-3 rounded-lg bg-gray-50 p-6'>
          <h3 className='mb-3 font-semibold'>{t('summary')}</h3>

          <div className='flex items-center gap-3'>
            <CheckCircle className='h-5 w-5 flex-shrink-0 text-green-600' />
            <div>
              <p className='font-medium'>{t('summaryUnit')}</p>
              <p className='text-sm text-gray-600'>{summary.unit}</p>
            </div>
          </div>

          <div className='flex items-center gap-3'>
            <CheckCircle className='h-5 w-5 flex-shrink-0 text-green-600' />
            <div>
              <p className='font-medium'>{t('summaryServices')}</p>
              <p className='text-sm text-gray-600'>
                {summary.services > 0
                  ? t('servicesAdded', { count: summary.services })
                  : t('canAddLater')}
              </p>
            </div>
          </div>

          <div className='flex items-center gap-3'>
            <CheckCircle className='h-5 w-5 flex-shrink-0 text-green-600' />
            <div>
              <p className='font-medium'>{t('summaryTeam')}</p>
              <p className='text-sm text-gray-600'>
                {summary.invites > 0
                  ? t('teamInvited', { count: summary.invites })
                  : t('canAddLater')}
              </p>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className='space-y-3'>
          <h3 className='flex items-center gap-2 font-semibold'>
            <Sparkles className='h-5 w-5 text-yellow-500' />
            {t('nextSteps')}
          </h3>

          <div className='ml-7 space-y-2'>
            <p className='text-sm text-gray-700'>• {t('steps.counters')}</p>
            <p className='text-sm text-gray-700'>• {t('steps.kiosk')}</p>
            <p className='text-sm text-gray-700'>• {t('steps.printer')}</p>
            <p className='text-sm text-gray-700'>• {t('steps.screen')}</p>
          </div>
        </div>

        {/* Trial Info */}
        <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
          <p className='mb-2 text-sm text-blue-800'>
            <strong>🎉 {t('trialActive')}</strong>
          </p>
          <p className='text-sm text-blue-800'>{t('trialDesc')}</p>
        </div>
      </CardContent>

      <CardFooter className='flex justify-center'>
        <Button
          onClick={() => onComplete?.()}
          size='lg'
          className='px-8'
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className='mr-2 h-5 w-5 animate-spin' aria-hidden />
          ) : (
            <ArrowRight className='mr-2 h-5 w-5' aria-hidden />
          )}
          {t('goToDashboard')}
        </Button>
      </CardFooter>
    </>
  );
}
