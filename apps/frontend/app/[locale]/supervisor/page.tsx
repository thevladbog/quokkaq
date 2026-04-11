'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { useAuthContext } from '@/contexts/AuthContext';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

export default function SupervisorSelectionPage() {
  const { user, isLoading: authLoading } = useAuthContext();
  const { activeUnitId, assignableUnitIds } = useActiveUnit();
  const router = useRouter();
  const t = useTranslations('supervisor');

  useEffect(() => {
    if (authLoading) return;
    if (assignableUnitIds.length === 0) return;
    const target =
      activeUnitId && assignableUnitIds.includes(activeUnitId)
        ? activeUnitId
        : assignableUnitIds[0];
    router.replace(`/supervisor/${target}`);
  }, [authLoading, activeUnitId, assignableUnitIds, router]);

  if (authLoading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (!user?.units?.length) {
    return (
      <div className='container mx-auto max-w-4xl p-4'>
        <h1 className='mb-8 text-center text-3xl font-bold'>{t('title')}</h1>
        <Card>
          <CardHeader>
            <CardTitle>{t('selectUnit')}</CardTitle>
            <CardDescription>{t('selectUnitDescription')}</CardDescription>
          </CardHeader>
          <CardContent className='text-muted-foreground text-center'>
            {t('noUnitsAssigned')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className='flex min-h-[40vh] items-center justify-center p-4'
      data-testid='e2e-supervisor-selection-redirecting'
    >
      <Loader2 className='h-8 w-8 animate-spin' />
    </div>
  );
}
