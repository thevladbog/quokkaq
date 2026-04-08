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
import { Textarea } from '@/components/ui/textarea';
import { Plus, X, Briefcase } from 'lucide-react';
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

interface AddServicesStepProps {
  state: OnboardingState;
  onNext: (data: Partial<OnboardingState>) => void;
  onBack: () => void;
  onSkip: () => void;
}

export function AddServicesStep({
  state,
  onNext,
  onBack,
  onSkip
}: AddServicesStepProps) {
  const t = useTranslations('onboarding.services');

  const [services, setServices] = useState(
    state.services && state.services.length > 0
      ? state.services
      : [{ name: '', description: '' }]
  );

  const addService = () => {
    setServices([...services, { name: '', description: '' }]);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const updateService = (index: number, field: string, value: string) => {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validServices = services.filter((s) => s.name.trim() !== '');

    if (validServices.length === 0) {
      // Can skip if no services
      onSkip();
      return;
    }

    onNext({ services: validServices });
  };

  const canAddMore = services.length < 10;

  return (
    <form onSubmit={handleSubmit}>
      <CardHeader>
        <div className='mb-2 flex items-center gap-3'>
          <Briefcase className='h-8 w-8 text-blue-600' />
          <CardTitle className='text-2xl'>{t('title')}</CardTitle>
        </div>
        <p className='text-gray-600'>{t('subtitle')}</p>
      </CardHeader>

      <CardContent className='space-y-6'>
        <div className='space-y-4'>
          {services.map((service, index) => (
            <div
              key={index}
              className='relative space-y-3 rounded-lg border p-4'
            >
              {services.length > 1 && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute top-2 right-2'
                  onClick={() => removeService(index)}
                >
                  <X className='h-4 w-4' />
                </Button>
              )}

              <div className='space-y-2'>
                <Label htmlFor={`service-name-${index}`}>
                  {t('nameLabel')}{' '}
                  {index === 0 && <span className='text-red-500'>*</span>}
                </Label>
                <Input
                  id={`service-name-${index}`}
                  placeholder={t('namePlaceholder')}
                  value={service.name}
                  onChange={(e) => updateService(index, 'name', e.target.value)}
                  required={index === 0}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor={`service-description-${index}`}>
                  {t('descLabel')}
                </Label>
                <Textarea
                  id={`service-description-${index}`}
                  placeholder={t('descPlaceholder')}
                  value={service.description}
                  onChange={(e) =>
                    updateService(index, 'description', e.target.value)
                  }
                  rows={2}
                />
              </div>
            </div>
          ))}
        </div>

        {canAddMore && (
          <Button
            type='button'
            variant='outline'
            onClick={addService}
            className='w-full'
          >
            <Plus className='mr-2 h-4 w-4' />
            {t('addAnother')}
          </Button>
        )}

        <div className='rounded-lg border border-yellow-200 bg-yellow-50 p-4'>
          <p className='text-sm text-yellow-800'>
            <strong>{t('canSkip')}:</strong> {t('canSkipDesc')}
          </p>
        </div>
      </CardContent>

      <CardFooter className='flex justify-between'>
        <Button type='button' variant='outline' onClick={onBack}>
          {t('back')}
        </Button>
        <div className='flex gap-2'>
          <Button type='button' variant='ghost' onClick={onSkip}>
            {t('skip')}
          </Button>
          <Button type='submit'>{t('continue')}</Button>
        </div>
      </CardFooter>
    </form>
  );
}
