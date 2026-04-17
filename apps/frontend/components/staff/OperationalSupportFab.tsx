'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Bug } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import SupportReportDialog from '@/components/staff/SupportReportDialog';

function pathWithoutLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}\//, '/').replace(/^\/[a-z]{2}$/, '/');
}

function shouldShowOperationalSupportFab(normalized: string): boolean {
  if (normalized.startsWith('/settings')) return false;
  if (normalized.startsWith('/platform')) return false;
  if (normalized.startsWith('/staff')) return true;
  if (normalized.startsWith('/supervisor')) return true;
  if (normalized === '/statistics' || normalized.startsWith('/statistics/'))
    return true;
  if (normalized.startsWith('/pre-registrations')) return true;
  if (normalized.startsWith('/journal')) return true;
  if (normalized.startsWith('/clients')) return true;
  if (normalized === '/onboarding' || normalized.startsWith('/onboarding/'))
    return true;
  return false;
}

export default function OperationalSupportFab() {
  const pathname = usePathname();
  const t = useTranslations('staff.support');
  const normalized = useMemo(() => pathWithoutLocale(pathname), [pathname]);

  if (!shouldShowOperationalSupportFab(normalized)) return null;

  return (
    <SupportReportDialog
      trigger={
        <Button
          type='button'
          size='icon'
          className='bg-primary text-primary-foreground hover:bg-primary/90 fixed right-6 bottom-6 z-50 h-14 w-14 rounded-full shadow-lg'
          aria-label={t('fabAria')}
        >
          <Bug className='h-6 w-6' aria-hidden />
        </Button>
      }
    />
  );
}
