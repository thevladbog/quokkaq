'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

function normalizeTheme(t: string | undefined): 'light' | 'dark' | 'system' {
  if (t === 'light' || t === 'dark' || t === 'system') return t;
  return 'system';
}

export default function ThemeSwitcher() {
  const t = useTranslations('profile');
  const { theme, setTheme } = useTheme();
  const current = normalizeTheme(theme);

  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;

  return (
    <Select value={current} onValueChange={setTheme}>
      <SelectTrigger size='sm' className='w-full max-w-full min-w-[13rem]'>
        <SelectValue>
          <span className='flex items-center gap-2'>
            <Icon className='h-4 w-4 shrink-0' />
            {current === 'light'
              ? t('theme_light')
              : current === 'dark'
                ? t('theme_dark')
                : t('theme_system')}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='light'>
          <span className='flex items-center gap-2'>
            <Sun className='h-4 w-4' />
            {t('theme_light')}
          </span>
        </SelectItem>
        <SelectItem value='dark'>
          <span className='flex items-center gap-2'>
            <Moon className='h-4 w-4' />
            {t('theme_dark')}
          </span>
        </SelectItem>
        <SelectItem value='system'>
          <span className='flex items-center gap-2'>
            <Monitor className='h-4 w-4' />
            {t('theme_system')}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
