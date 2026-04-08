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
import { Building2 } from 'lucide-react';
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

interface CreateUnitStepProps {
  state: OnboardingState;
  onNext: (data: Partial<OnboardingState>) => void;
  onBack: () => void;
}

export function CreateUnitStep({ state, onNext, onBack }: CreateUnitStepProps) {
  const t = useTranslations('onboarding.unit');

  const [formData, setFormData] = useState({
    name: state.unit?.name || '',
    code: state.unit?.code || '',
    timezone: state.unit?.timezone || 'Europe/Moscow'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const timezones = [
    { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
    { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
    { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
    { value: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)' },
    { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('nameRequired');
    }

    if (!formData.code.trim()) {
      newErrors.code = t('codeRequired');
    } else if (!/^[A-Z0-9]{2,6}$/.test(formData.code)) {
      newErrors.code = t('codeInvalid');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onNext({ unit: formData });
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardHeader>
        <div className='mb-2 flex items-center gap-3'>
          <Building2 className='h-8 w-8 text-blue-600' />
          <CardTitle className='text-2xl'>{t('title')}</CardTitle>
        </div>
        <p className='text-gray-600'>{t('subtitle')}</p>
      </CardHeader>

      <CardContent className='space-y-6'>
        <div className='space-y-2'>
          <Label htmlFor='name'>
            {t('nameLabel')}{' '}
            <span className='text-red-500'>{t('required')}</span>
          </Label>
          <Input
            id='name'
            placeholder={t('namePlaceholder')}
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            className={errors.name ? 'border-red-500' : ''}
          />
          {errors.name && <p className='text-sm text-red-500'>{errors.name}</p>}
          <p className='text-xs text-gray-500'>{t('nameHelp')}</p>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='code'>
            {t('codeLabel')}{' '}
            <span className='text-red-500'>{t('required')}</span>
          </Label>
          <Input
            id='code'
            placeholder={t('codePlaceholder')}
            value={formData.code}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                code: e.target.value.toUpperCase()
              }))
            }
            maxLength={6}
            className={errors.code ? 'border-red-500' : ''}
          />
          {errors.code && <p className='text-sm text-red-500'>{errors.code}</p>}
          <p className='text-xs text-gray-500'>{t('codeHelp')}</p>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='timezone'>
            {t('timezoneLabel')}{' '}
            <span className='text-red-500'>{t('required')}</span>
          </Label>
          <Select
            value={formData.timezone}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, timezone: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='text-xs text-gray-500'>{t('timezoneHelp')}</p>
        </div>

        <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
          <p className='text-sm text-blue-800'>
            <strong>💡 {t('tip')}:</strong> {t('tipDesc')}
          </p>
        </div>
      </CardContent>

      <CardFooter className='flex justify-between'>
        <Button type='button' variant='outline' onClick={onBack}>
          {t('back')}
        </Button>
        <Button type='submit'>{t('continue')}</Button>
      </CardFooter>
    </form>
  );
}
