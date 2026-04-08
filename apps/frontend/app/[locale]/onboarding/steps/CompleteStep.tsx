'use client';

import { CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Sparkles, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface OnboardingState {
  unit?: {
    name: string;
    code: string;
    timezone: string;
  } | null;
  services?: Array<{
    name: string;
    description: string;
  }>;
  invites?: Array<{
    email: string;
    role: string;
  }>;
}

interface CompleteStepProps {
  state: OnboardingState;
  onComplete: () => void;
}

export function CompleteStep({ state, onComplete }: CompleteStepProps) {
  const t = useTranslations('onboarding.complete');
  
  const summary = {
    unit: state.unit?.name || t('canAddLater'),
    services: state.services?.length || 0,
    invites: state.invites?.length || 0
  };

  return (
    <>
      <CardHeader className="text-center pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-green-100 rounded-full">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
        </div>
        <CardTitle className="text-3xl mb-2">{t('title')}</CardTitle>
        <p className="text-gray-600 text-lg">
          {t('subtitle')}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="bg-gray-50 rounded-lg p-6 space-y-3">
          <h3 className="font-semibold mb-3">{t('summary')}</h3>
          
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium">{t('summaryUnit')}</p>
              <p className="text-sm text-gray-600">{summary.unit}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium">{t('summaryServices')}</p>
              <p className="text-sm text-gray-600">
                {summary.services > 0 ? t('servicesAdded', { count: summary.services }) : t('canAddLater')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium">{t('summaryTeam')}</p>
              <p className="text-sm text-gray-600">
                {summary.invites > 0 ? t('teamInvited', { count: summary.invites }) : t('canAddLater')}
              </p>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            {t('nextSteps')}
          </h3>
          
          <div className="space-y-2 ml-7">
            <p className="text-sm text-gray-700">• {t('steps.counters')}</p>
            <p className="text-sm text-gray-700">• {t('steps.kiosk')}</p>
            <p className="text-sm text-gray-700">• {t('steps.printer')}</p>
            <p className="text-sm text-gray-700">• {t('steps.screen')}</p>
          </div>
        </div>

        {/* Trial Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800 mb-2">
            <strong>🎉 {t('trialActive')}</strong>
          </p>
          <p className="text-sm text-blue-800">
            {t('trialDesc')}
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex justify-center">
        <Button onClick={onComplete} size="lg" className="px-8">
          {t('goToDashboard')}
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </CardFooter>
    </>
  );
}
