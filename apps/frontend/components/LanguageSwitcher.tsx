'use client';

import { useRouter, usePathname } from '@/src/i18n/navigation';
import { useLocale } from 'next-intl';

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className='flex space-x-2'>
      <button
        onClick={() => switchLocale(locale === 'en' ? 'ru' : 'en')}
        className={`rounded-md px-3 py-1 text-sm font-medium ${
          locale === 'en'
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
        }`}
      >
        {locale === 'en' ? 'RU' : 'EN'}
      </button>
    </div>
  );
}
