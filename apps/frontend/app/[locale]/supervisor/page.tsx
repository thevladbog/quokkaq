'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { unitsApi, Unit } from '@/lib/api';
import { useAuthContext } from '@/contexts/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Loader2 } from 'lucide-react';
import ProtectedSidebarLayout from '@/components/ProtectedSidebarLayout';

export default function SupervisorSelectionPage() {
  const { user, isLoading: authLoading } = useAuthContext();
  const [userUnits, setUserUnits] = useState<{ unitId: string; unit: Unit }[]>(
    []
  );
  const [unitsLoading, setUnitsLoading] = useState(false);
  const t = useTranslations('supervisor');
  const router = useRouter();

  // Load detailed unit info
  useEffect(() => {
    const loadUnits = async () => {
      setUnitsLoading(true);
      try {
        if (user?.units && user.units.length > 0) {
          const data = await Promise.all(
            user.units.map((u: { unitId: string }) =>
              unitsApi.getById(u.unitId)
            )
          );
          const normalized = data.map((u) => ({ unitId: u.id, unit: u }));
          setUserUnits(normalized);
        } else {
          setUserUnits([]);
        }
      } catch (err) {
        console.error('Failed to load user units:', err);
        setUserUnits([]);
      } finally {
        setUnitsLoading(false);
      }
    };
    loadUnits();
  }, [user?.units]);

  // Auto-redirect if only one unit
  useEffect(() => {
    if (!authLoading && !unitsLoading && userUnits.length === 1) {
      router.push(`/supervisor/${userUnits[0].unitId}`);
    }
  }, [userUnits, authLoading, unitsLoading, router]);

  if (authLoading || unitsLoading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin' />
      </div>
    );
  }

  return (
    <ProtectedSidebarLayout
      allowedRoles={['admin', 'supervisor']}
      requiredPermission='ACCESS_SUPERVISOR_PANEL'
    >
      <div className='container mx-auto max-w-4xl p-4'>
        <h1 className='mb-8 text-center text-3xl font-bold'>{t('title')}</h1>

        {/* Unit Selection */}
        {userUnits.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('selectUnit')}</CardTitle>
              <CardDescription>{t('selectUnitDescription')}</CardDescription>
            </CardHeader>
            <CardContent className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {userUnits.map((uu) => (
                <Button
                  key={uu.unitId}
                  onClick={() => router.push(`/supervisor/${uu.unitId}`)}
                  className='h-24 text-lg'
                  variant='outline'
                >
                  {uu.unit?.name || uu.unitId}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {userUnits.length === 0 && (
          <Card>
            <CardContent className='text-muted-foreground p-8 text-center'>
              {t('noUnitsAssigned')}
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedSidebarLayout>
  );
}
