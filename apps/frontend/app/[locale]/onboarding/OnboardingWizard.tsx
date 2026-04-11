'use client';

import { useState } from 'react';
import { useRouter } from '@/src/i18n/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { WelcomeStep } from './steps/WelcomeStep';
import { CreateUnitStep } from './steps/CreateUnitStep';
import { AddServicesStep } from './steps/AddServicesStep';
import { InviteTeamStep } from './steps/InviteTeamStep';
import { CompleteStep } from './steps/CompleteStep';
import { useTranslations } from 'next-intl';
import { companiesApiExt } from '@/lib/api';
import type { OnboardingState } from './types';

export function OnboardingWizard() {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<OnboardingState>({
    unit: null,
    services: [],
    invites: []
  });

  const completeMutation = useMutation({
    mutationFn: () => companiesApiExt.completeOnboarding(),
    onSuccess: () => {
      router.push('/settings');
    },
    onError: () => {
      toast.error(t('complete.completeError'));
    }
  });

  const steps = [
    { id: 'welcome', title: t('welcome.title'), component: WelcomeStep },
    { id: 'unit', title: t('unit.title'), component: CreateUnitStep },
    { id: 'services', title: t('services.title'), component: AddServicesStep },
    { id: 'team', title: t('team.title'), component: InviteTeamStep },
    { id: 'complete', title: t('complete.title'), component: CompleteStep }
  ];

  const currentStepData = steps[currentStep];
  const StepComponent = currentStepData.component;
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = (data?: Partial<OnboardingState>) => {
    if (data) {
      setState((prev) => ({ ...prev, ...data }));
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleComplete = () => {
    if (completeMutation.isPending) return;
    completeMutation.mutate();
  };

  return (
    <div className='container mx-auto max-w-4xl px-4 py-12'>
      {/* Progress Bar */}
      <div className='mb-8'>
        <div className='mb-2 flex items-center justify-between'>
          <span className='text-sm font-medium text-gray-700'>
            {t('step')} {currentStep + 1} {t('of')} {steps.length}
          </span>
          <span className='text-sm text-gray-500'>{currentStepData.title}</span>
        </div>
        <Progress value={progress} className='h-2' />
      </div>

      {/* Step Content */}
      <Card className='shadow-xl'>
        <StepComponent
          state={state}
          onNext={handleNext}
          onBack={handleBack}
          onSkip={handleSkip}
          onComplete={handleComplete}
          isPending={
            currentStepData.id === 'complete'
              ? completeMutation.isPending
              : undefined
          }
        />
      </Card>
    </div>
  );
}
