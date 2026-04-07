'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { socketClient } from '@/lib/socket';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import { ticketsApi, servicesApi, Ticket, Service } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getLocalizedName } from '@/lib/utils';
import { useUnit } from '@/lib/hooks';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

export default function TicketPage() {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [error, setError] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const locale = useLocale();
  const t = useTranslations('ticket_page');
  const tStaff = useTranslations('staff.statuses');

  const { ticketId } = useParams() as { ticketId?: string };

  const { data: unit } = useUnit(ticket?.unitId || '');

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        if (!ticketId) return;
        const t_data = await ticketsApi.getById(ticketId);
        setTicket(t_data);
        // Try to fetch service details as well
        if (t_data?.serviceId) {
          try {
            const s = await servicesApi.getById(t_data.serviceId);
            setService(s);
          } catch {
            // ignore
          }
        }
        // Connect to WS to listen for updates for this unit (if available) and show a toast when ticket is called
        if (t_data?.unitId) {
          try {
            socketClient.connect(t_data.unitId);
            socketClient.onTicketCalled((data) => {
              if (data?.ticket?.id === t_data.id) {
                const counterName =
                  data.ticket?.counter?.name ||
                  (data.ticket as { counterId?: string })?.counterId ||
                  'the counter';
                toast.success(
                  t('your_ticket_called', {
                    number: t_data.queueNumber,
                    counter: counterName
                  })
                );
                // Update ticket status in real-time
                setTicket((prev) =>
                  prev ? { ...prev, status: 'called' } : prev
                );
              }
            });
          } catch (e) {
            // ignore socket errors in public page
            console.warn('Socket connect failed', e);
          }
        }
      } catch (e) {
        console.error('Failed to fetch ticket:', e);
        setError(t('error_loading'));
      }
    };
    fetchTicket();

    return () => {
      // Clean up socket listeners for this page
      socketClient.off('ticket.called');
      socketClient.disconnect();
    };
  }, [ticketId, t]);

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        {error}
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        {t('loading')}
      </div>
    );
  }

  return (
    <div className='bg-background flex min-h-screen items-center justify-center p-4'>
      <Card className='flex w-full max-w-md flex-col items-center pt-6'>
        {/* Logo (top) */}
        {unit?.config?.kiosk?.logoUrl && (
          <div className='mb-4 h-16 w-auto'>
            <Image
              src={unit.config.kiosk.logoUrl}
              alt='Logo'
              className='h-full w-auto object-contain'
            />
          </div>
        )}

        {/* Header text (if set) */}
        {unit?.config?.kiosk?.headerText && (
          <div className='mb-2 px-4 text-center text-lg font-medium'>
            {unit.config.kiosk.headerText}
          </div>
        )}

        <CardHeader className='w-full pb-2 text-center'>
          <CardTitle className='flex w-full justify-center text-center text-xl'>
            {service
              ? getLocalizedName(
                  service.name,
                  service.nameRu,
                  service.nameEn,
                  locale
                )
              : `Ticket`}
          </CardTitle>
        </CardHeader>

        <CardContent className='flex w-full flex-col items-center pb-8 text-center'>
          <div className='mb-2 text-7xl leading-none font-bold'>
            {ticket.queueNumber}
          </div>

          <Badge
            variant={ticket.status === 'called' ? 'default' : 'secondary'}
            className='mb-4 px-4 py-1 text-lg'
          >
            {tStaff(ticket.status)}
          </Badge>

          {/* Show Footer if configured */}
          {unit?.config?.kiosk?.footerText && (
            <>
              <Separator className='my-4 w-full' />
              <div className='text-muted-foreground text-center text-sm'>
                {unit.config.kiosk.footerText}
              </div>
            </>
          )}

          {/* Rate Visit Button */}
          {unit?.config?.kiosk?.feedbackUrl && (
            <>
              <Separator className='my-4 w-full' />
              <Button
                variant='outline'
                className='w-full'
                onClick={() => setShowFeedback(!showFeedback)}
              >
                {t('rate_visit')}
              </Button>

              {showFeedback && (
                <div className='mt-4 h-96 w-full overflow-hidden rounded-md border'>
                  <iframe
                    src={unit.config.kiosk.feedbackUrl.replace(
                      '{{ticketId}}',
                      ticket.id
                    )}
                    className='h-full w-full'
                    title='Feedback Form'
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
