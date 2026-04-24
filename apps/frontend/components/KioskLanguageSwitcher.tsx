'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/src/i18n/navigation';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface KioskLanguageSwitcherProps {
  className?: string;
}

export default function KioskLanguageSwitcher({
  className
}: KioskLanguageSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLanguage = (newLocale: string) => {
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
      onClick={() => switchLanguage(locale === 'en' ? 'ru' : 'en')}
      className={cn('font-bold', className)}
    >
      {locale === 'en' ? 'RU' : 'EN'}
    </Button>
  );
}
