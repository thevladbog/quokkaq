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
import { unitsApi, countersApi, Unit } from '@/lib/api';
import { useAuthContext } from '@/contexts/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function StaffSelectionPage() {
  const { user, isLoading: authLoading } = useAuthContext();
  const [userUnits, setUserUnits] = useState<{ unitId: string; unit: Unit }[]>(
    []
  );
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const t = useTranslations('staff');
  const router = useRouter();

  // Load detailed unit info
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

    if (user) {
      loadUnits();
    }
  }, [user, user?.units]);

  // Auto-select unit if only one
  useEffect(() => {
    if (!selectedUnitId && userUnits.length === 1) {
      setSelectedUnitId(userUnits[0].unitId);
    }
  }, [userUnits, selectedUnitId]);

  // Fetch counters for selected unit
  const { data: counters, isLoading: countersLoading } = useQuery({
    queryKey: ['counters', selectedUnitId],
    queryFn: () => countersApi.getByUnitId(selectedUnitId!),
    enabled: !!selectedUnitId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always'
  });

  // Redirect if already occupied
  useEffect(() => {
    if (counters && user) {
      const myCounter = counters.find((c) => c.assignedTo === user.id);
      if (myCounter) {
        router.push(`/staff/${myCounter.unitId}/${myCounter.id}`);
      }
    }
  }, [counters, user, router]);

  const occupyMutation = useMutation({
    mutationFn: (counterId: string) => countersApi.occupy(counterId),
    onSuccess: (_, counterId) => {
      router.push(`/staff/${selectedUnitId}/${counterId}`);
    },
    onError: (error: Error) => {
      toast.error(t('occupyCounterError', { message: error.message }));
    }
  });

  if (authLoading || unitsLoading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin' />
      </div>
    );
  }

  return (
    <div className='container mx-auto max-w-4xl p-4'>
      <h1 className='mb-8 text-center text-3xl font-bold'>{t('title')}</h1>

      {/* Unit Selection */}
      {!selectedUnitId && userUnits.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('selectUnit')}</CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {userUnits.map((uu) => (
              <Button
                key={uu.unitId}
                onClick={() => setSelectedUnitId(uu.unitId)}
                className='h-24 text-lg'
                variant='outline'
              >
                {uu.unit?.name || uu.unitId}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {!selectedUnitId && userUnits.length === 0 && !unitsLoading && (
        <Card>
          <CardContent className='text-muted-foreground p-8 text-center'>
            {t('selectUnitNoUnits')}
          </CardContent>
        </Card>
      )}

      {/* Counter Selection */}
      {selectedUnitId && (
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <div>
                <CardTitle>{t('select_counter')}</CardTitle>
                <CardDescription>
                  {
                    userUnits.find((u) => u.unitId === selectedUnitId)?.unit
                      ?.name
                  }
                </CardDescription>
              </div>
              {userUnits.length > 1 && (
                <Button variant='ghost' onClick={() => setSelectedUnitId(null)}>
                  {t('back_to_selection')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {countersLoading ? (
              <div className='flex justify-center p-8'>
                <Loader2 className='animate-spin' />
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3'>
                {counters?.map((counter) => {
                  const isOccupied = !!counter.assignedTo;
                  const isOccupiedByMe = counter.assignedTo === user?.id;
                  const hasMyCounter = counters.some(
                    (c) => c.assignedTo === user?.id
                  );

                  return (
                    <Button
                      key={counter.id}
                      variant={isOccupied ? 'secondary' : 'default'}
                      className={`flex h-32 flex-col gap-2 ${
                        // Disable if:
                        // 1. Occupied by someone else
                        // 2. Occupied by me (but this button is enabled, others disabled) -> handled by disabled prop
                        // 3. Pending mutation
                        (isOccupied && !isOccupiedByMe) ||
                        (hasMyCounter && !isOccupiedByMe)
                          ? 'cursor-not-allowed opacity-50'
                          : ''
                      }`}
                      onClick={() => {
                        if (isOccupiedByMe) {
                          // Redirect if already occupied by me
                          router.push(`/staff/${counter.unitId}/${counter.id}`);
                        } else if (!isOccupied && !hasMyCounter) {
                          occupyMutation.mutate(counter.id);
                        }
                      }}
                      disabled={
                        (isOccupied && !isOccupiedByMe) ||
                        (hasMyCounter && !isOccupiedByMe) ||
                        occupyMutation.isPending
                      }
                    >
                      <span className='text-xl font-bold'>{counter.name}</span>
                      {isOccupied ? (
                        <span
                          className={`flex items-center gap-1 text-sm ${isOccupiedByMe ? 'font-medium text-green-600' : 'text-red-500'}`}
                        >
                          <UserIcon className='h-4 w-4' />
                          {isOccupiedByMe
                            ? t('occupiedByYou')
                            : counter.assignedUser?.name ||
                              t('occupiedUnknown')}
                        </span>
                      ) : (
                        <span className='text-sm text-green-500'>
                          {t('free')}
                        </span>
                      )}
                    </Button>
                  );
                })}
                {counters?.length === 0 && (
                  <div className='text-muted-foreground col-span-full p-8 text-center'>
                    {t('no_counters')}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
