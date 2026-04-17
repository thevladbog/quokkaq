'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Bug } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import SupportReportDialog from '@/components/staff/SupportReportDialog';
import {
  pathWithoutLocale,
  shouldShowOperationalSupportFab
} from '@/lib/operational-support-fab-path';

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
