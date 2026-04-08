'use client';

import { useState } from 'react';
import { z } from 'zod';
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
import type { OnboardingWizardStepProps } from '../types';

const TIMEZONES = [
  { value: 'Europe/Moscow', labelKey: 'moscow' },
  { value: 'Europe/Samara', labelKey: 'samara' },
  { value: 'Asia/Yekaterinburg', labelKey: 'yekaterinburg' },
  { value: 'Asia/Novosibirsk', labelKey: 'novosibirsk' },
  { value: 'Asia/Vladivostok', labelKey: 'vladivostok' }
] as const;

const TIMEZONE_VALUES = TIMEZONES.map((z) => z.value);

const unitFormSchema = z.object({
  name: z.string().trim().min(1, { message: 'nameRequired' }),
  code: z
    .string()
    .trim()
    .min(1, { message: 'codeRequired' })
    .regex(/^[A-Z0-9]{2,6}$/, { message: 'codeInvalid' }),
  timezone: z
    .string()
    .refine((v) => TIMEZONE_VALUES.includes(v), {
      message: 'timezoneRequired'
    })
});

export function CreateUnitStep({
  state,
  onNext,
  onBack
}: OnboardingWizardStepProps) {
  const t = useTranslations('onboarding.unit');

  const [formData, setFormData] = useState({
    name: state.unit?.name || '',
    code: state.unit?.code || '',
    timezone: state.unit?.timezone || 'Europe/Moscow'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = unitFormSchema.safeParse(formData);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        const msgKey = issue.message;
        if (key === 'name' && msgKey === 'nameRequired') {
          next.name = t('nameRequired');
        } else if (key === 'code') {
          if (msgKey === 'codeRequired') next.code = t('codeRequired');
          else next.code = t('codeInvalid');
        } else if (key === 'timezone' && msgKey === 'timezoneRequired') {
          next.timezone = t('timezoneRequired');
        }
      }
      setErrors(next);
      return;
    }

    setErrors({});
    onNext({
      unit: {
        name: parsed.data.name,
        code: parsed.data.code,
        timezone: parsed.data.timezone
      }
    });
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
            <SelectTrigger
              id='timezone'
              className={errors.timezone ? 'border-red-500' : ''}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {t(`timezone.${tz.labelKey}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.timezone && (
            <p className='text-sm text-red-500'>{errors.timezone}</p>
          )}
          <p className='text-xs text-gray-500'>{t('timezoneHelp')}</p>
        </div>

        <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
          <p className='text-sm text-blue-800'>
            <strong>💡 {t('tip')}:</strong> {t('tipDesc')}
          </p>
        </div>
      </CardContent>

      <CardFooter className='flex justify-between'>
        <Button type='button' variant='outline' onClick={() => onBack?.()}>
          {t('back')}
        </Button>
        <Button type='submit'>{t('continue')}</Button>
      </CardFooter>
    </form>
  );
}
