'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/src/i18n/navigation';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface KioskLanguageSwitcherProps {
  className?: string;
}

type KioskUiLocale = 'en' | 'ru';

export default function KioskLanguageSwitcher({
  className
}: KioskLanguageSwitcherProps) {
  const locale = useLocale() as KioskUiLocale;
  const router = useRouter();
  const pathname = usePathname();

  const switchLanguage = (newLocale: KioskUiLocale) => {
    try {
      localStorage.setItem('NEXT_LOCALE', newLocale);
    } catch {
      /* ignore */
    }
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <Button
      variant='secondary'
      type='button'
      onClick={() => switchLanguage(locale === 'en' ? 'ru' : 'en')}
      className={cn('font-bold', className)}
      aria-label={
        locale === 'en'
          ? 'Switch language to Russian'
          : 'Switch language to English'
      }
    >
      {locale === 'en' ? 'RU' : 'EN'}
    </Button>
  );
}
