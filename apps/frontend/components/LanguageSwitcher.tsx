'use client';

import { useRouter, usePathname } from '@/src/i18n/navigation';
import { useLocale } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  const languages = {
    en: { flag: '🇬🇧', name: 'English' },
    ru: { flag: '🇷🇺', name: 'Русский' }
  };

  return (
    <Select value={locale} onValueChange={switchLocale}>
      <SelectTrigger size='sm' className='w-[140px]'>
        <SelectValue>
          <span className='flex items-center gap-2'>
            {languages[locale as keyof typeof languages].flag}{' '}
            {languages[locale as keyof typeof languages].name}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='en'>
          <span className='flex items-center gap-2'>
            {languages.en.flag} {languages.en.name}
          </span>
        </SelectItem>
        <SelectItem value='ru'>
          <span className='flex items-center gap-2'>
            {languages.ru.flag} {languages.ru.name}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
