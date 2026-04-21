'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { unitsApi } from '@/lib/api';
import type { Service } from '@/lib/api';
import { getLocalizedName } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

interface QueueStatus {
  queueLength: number;
  estimatedWaitMinutes: number;
  activeCounters: number;
}

export default function VirtualQueuePage() {
  const { unitId } = useParams() as { unitId?: string };
  const locale = useLocale();
  const t = useTranslations('virtual_queue');
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!unitId) return;

    const load = async () => {
      try {
        const [svcs, status] = await Promise.all([
          unitsApi.getServices(unitId),
          unitsApi.getQueueStatus(unitId)
        ]);
        setServices(svcs);
        setQueueStatus(status);
      } catch {
        setError(t('not_enabled'));
      } finally {
        setLoading(false);
      }
    };

    void load();

    // Refresh queue status every 30 seconds so stats stay current while the user fills the form.
    const pollInterval = setInterval(() => {
      unitsApi
        .getQueueStatus(unitId)
        .then(setQueueStatus)
        .catch(() => null);
    }, 30_000);

    return () => clearInterval(pollInterval);
  }, [unitId, t]);

  const handleJoin = async () => {
    if (!unitId || !selectedServiceId) return;
    setJoining(true);
    try {
      const result = await unitsApi.joinVirtualQueue(unitId, {
        serviceId: selectedServiceId,
        phone: phone.trim() || undefined,
        locale
      });
      router.push(result.ticketPageUrl || `/ticket/${result.ticket.id}`);
    } catch (e) {
      toast.error(t('join_error'));
      console.error(e);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <Spinner className='h-8 w-8' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center p-4 text-center'>
        <p className='text-muted-foreground'>{error}</p>
      </div>
    );
  }

  return (
    <div className='bg-background flex min-h-screen items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='text-center'>
          <CardTitle className='text-2xl'>{t('title')}</CardTitle>
          <p className='text-muted-foreground text-sm'>{t('subtitle')}</p>
        </CardHeader>

        <CardContent className='space-y-6'>
          {/* Queue status pills */}
          {queueStatus && (
            <div className='flex flex-wrap justify-center gap-2'>
              <span className='bg-muted rounded-full px-3 py-1 text-sm'>
                {t('queue_length', { count: queueStatus.queueLength })}
              </span>
              {queueStatus.estimatedWaitMinutes > 0 && (
                <span className='bg-muted rounded-full px-3 py-1 text-sm'>
                  {t('estimated_wait', {
                    minutes: Math.round(queueStatus.estimatedWaitMinutes)
                  })}
                </span>
              )}
              <span className='bg-muted rounded-full px-3 py-1 text-sm'>
                {t('active_counters', { count: queueStatus.activeCounters })}
              </span>
            </div>
          )}

          {/* Service selector */}
          <div className='space-y-2'>
            <Label htmlFor='service-select'>{t('select_service')}</Label>
            <Select
              value={selectedServiceId}
              onValueChange={setSelectedServiceId}
            >
              <SelectTrigger id='service-select'>
                <SelectValue placeholder={t('service_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {services.map((svc) => (
                  <SelectItem key={svc.id} value={svc.id}>
                    {getLocalizedName(
                      svc.name,
                      svc.nameRu ?? null,
                      svc.nameEn ?? null,
                      locale
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Phone (optional) */}
          <div className='space-y-2'>
            <Label htmlFor='phone-input'>{t('phone_label')}</Label>
            <Input
              id='phone-input'
              type='tel'
              placeholder={t('phone_placeholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>{t('phone_hint')}</p>
          </div>

          {/* Submit */}
          <Button
            className='w-full'
            onClick={handleJoin}
            disabled={joining || !selectedServiceId}
          >
            {joining ? (
              <>
                <Spinner className='mr-2 size-4' />
                {t('joining')}
              </>
            ) : (
              t('join_button')
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
