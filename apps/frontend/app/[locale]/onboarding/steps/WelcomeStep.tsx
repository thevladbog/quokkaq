'use client';

import { CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle, Users, Building2, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const t = useTranslations('onboarding.welcome');
  
  return (
    <>
      <CardHeader className="text-center pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-blue-100 rounded-full">
            <Sparkles className="h-12 w-12 text-blue-600" />
          </div>
        </div>
        <CardTitle className="text-3xl mb-2">{t('title')}</CardTitle>
        <p className="text-gray-600 text-lg">
          {t('subtitle')}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
            <Building2 className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-1">{t('steps.unit.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('steps.unit.desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
            <Settings className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-1">{t('steps.services.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('steps.services.desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
            <Users className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-1">{t('steps.team.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('steps.team.desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
            <CheckCircle className="h-6 w-6 text-green-600 mt-1 flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-1">{t('steps.complete.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('steps.complete.desc')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>💡 {t('tip')}:</strong> {t('tipDesc')}
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end">
        <Button onClick={onNext} size="lg">
          {t('start')}
        </Button>
      </CardFooter>
    </>
  );
}
