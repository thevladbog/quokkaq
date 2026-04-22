'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { socketClient, type UnitETASnapshot } from '@/lib/socket';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import { ticketsApi, Ticket } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getLocalizedName } from '@/lib/utils';
import { useUnit } from '@/lib/hooks';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import Image from 'next/image';
import { Progress } from '@/components/ui/progress';

const POLLING_INTERVAL_MS = 30_000;

const TICKET_STEPS: { status: string; labelKey: string }[] = [
  { status: 'waiting', labelKey: 'step_waiting' },
  { status: 'called', labelKey: 'step_called' },
  { status: 'in_service', labelKey: 'step_in_service' },
  { status: 'served', labelKey: 'step_served' }
];

function getStepIndex(status: string): number {
  if (status === 'no_show' || status === 'cancelled') return -1;
  return TICKET_STEPS.findIndex((s) => s.status === status);
}

function formatEstimatedWait(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

export default function TicketPage() {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const ticketRef = useRef<Ticket | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // SMS opt-in state
  const [smsPhone, setSmsPhone] = useState('');
  const [smsSubmitting, setSmsSubmitting] = useState(false);
  const [smsSubmitted, setSmsSubmitted] = useState(false);
  const [liveEta, setLiveEta] = useState<{
    position: number;
    seconds: number;
  } | null>(null);
  const etaMaxRef = useRef<number | null>(null);

  const locale = useLocale();
  const t = useTranslations('ticket_page');
  const tStaff = useTranslations('staff.statuses');
  const router = useRouter();

  const { ticketId } = useParams() as { ticketId?: string };
  const { data: unit } = useUnit(ticket?.unitId || '');

  const refreshTicket = useCallback(async () => {
    if (!ticketId) return;
    try {
      const updated = await ticketsApi.getById(ticketId);
      ticketRef.current = updated;
      setTicket(updated);
      if (
        updated.estimatedWaitSeconds != null &&
        updated.estimatedWaitSeconds > 0 &&
        etaMaxRef.current == null
      ) {
        etaMaxRef.current = updated.estimatedWaitSeconds;
      }
    } catch {
      // Silently ignore refresh errors to not spam errors during polling
    }
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) return;

    let cancelled = false;
    let onCalledHandler: ((data: unknown) => void) | null = null;
    let onUpdatedHandler: ((data: unknown) => void) | null = null;
    let onEtaHandler: ((data: UnitETASnapshot) => void) | null = null;

    const load = async () => {
      try {
        const t_data = await ticketsApi.getById(ticketId);

        // Guard: if this effect was cleaned up while the request was in-flight
        // (e.g. React Strict Mode double-invoke or dependency change), bail out
        // before registering socket listeners — otherwise duplicate handlers pile up.
        if (cancelled) return;

        setLiveEta(null);
        etaMaxRef.current = null;

        ticketRef.current = t_data;
        setTicket(t_data);
        if (
          t_data.estimatedWaitSeconds != null &&
          t_data.estimatedWaitSeconds > 0
        ) {
          etaMaxRef.current = t_data.estimatedWaitSeconds;
        }

        if (t_data?.unitId) {
          try {
            socketClient.connect(t_data.unitId);

            onCalledHandler = (data) => {
              const update = data as {
                ticket?: { id?: string; counter?: { name?: string } };
              };
              if (update?.ticket?.id === t_data.id) {
                const counterName =
                  update.ticket?.counter?.name || t('counterUnknown');
                toast.success(
                  t('your_ticket_called', {
                    number: t_data.queueNumber,
                    counter: counterName
                  })
                );
                void refreshTicket();
              }
            };

            onUpdatedHandler = (data) => {
              const update = data as { ticket?: { id?: string } };
              if (update?.ticket?.id === t_data.id) {
                void refreshTicket();
              }
            };

            onEtaHandler = (snap: UnitETASnapshot) => {
              const row = snap.tickets?.find((x) => x.ticketId === t_data.id);
              if (row) {
                setLiveEta({
                  position: row.queuePosition,
                  seconds: row.estimatedWaitSeconds
                });
                if (row.estimatedWaitSeconds > 0 && etaMaxRef.current == null) {
                  etaMaxRef.current = row.estimatedWaitSeconds;
                }
              }
            };
            socketClient.on('ticket.called', onCalledHandler);
            socketClient.on('ticket.updated', onUpdatedHandler);
            socketClient.onEtaUpdate(onEtaHandler);
          } catch (e) {
            console.warn('Socket connect failed', e);
          }
        }

        // Start polling for live updates.
        pollingRef.current = setInterval(() => {
          if (
            !ticketRef.current ||
            ['served', 'no_show', 'cancelled'].includes(
              ticketRef.current.status
            )
          ) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            return;
          }
          void refreshTicket();
        }, POLLING_INTERVAL_MS);
      } catch {
        setError(t('error_loading'));
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (onCalledHandler) socketClient.off('ticket.called', onCalledHandler);
      if (onUpdatedHandler)
        socketClient.off('ticket.updated', onUpdatedHandler);
      if (onEtaHandler) socketClient.offEtaUpdate(onEtaHandler);
      socketClient.disconnect();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [ticketId, t, refreshTicket]);

  const getVisitorToken = () =>
    ticketId
      ? (sessionStorage.getItem(`visitor_token_${ticketId}`) ?? undefined)
      : undefined;

  const handleCancel = async () => {
    if (!ticketId) return;
    setCancelling(true);
    try {
      const updated = await ticketsApi.visitorCancel(
        ticketId,
        getVisitorToken()
      );
      ticketRef.current = updated;
      setTicket(updated);
    } catch {
      toast.error(t('cancel_error'));
    } finally {
      setCancelling(false);
    }
  };

  const handleSmsOptIn = async () => {
    if (!ticketId || !smsPhone.trim()) return;
    setSmsSubmitting(true);
    try {
      await ticketsApi.attachPhone(
        ticketId,
        smsPhone.trim(),
        locale,
        getVisitorToken()
      );
      setSmsSubmitted(true);
      toast.success(t('sms_optin_success'));
    } catch {
      toast.error(t('sms_optin_error'));
    } finally {
      setSmsSubmitting(false);
    }
  };

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

  const stepIndex = getStepIndex(ticket.status);
  // Derive terminal/cancelled state from ticket.status — survives page reloads.
  const isTerminal = ['served', 'no_show', 'cancelled'].includes(ticket.status);
  const isCancelled =
    ticket.status === 'no_show' || ticket.status === 'cancelled';
  const canCancel = ticket.status === 'waiting';

  // smsOptInAvailable is a virtual field returned by the backend (feature gate + SMS enabled).
  const smsOptInAvailable =
    (ticket as Ticket & { smsOptInAvailable?: boolean }).smsOptInAvailable ===
    true;

  const service = ticket.service;

  const displayPosition = liveEta?.position ?? ticket.queuePosition;
  const displayEtaSeconds =
    liveEta?.seconds ?? ticket.estimatedWaitSeconds ?? null;
  const etaProgressPct =
    ticket.status === 'waiting' &&
    displayEtaSeconds != null &&
    displayEtaSeconds > 0
      ? (() => {
          const max = Math.max(etaMaxRef.current ?? 0, displayEtaSeconds, 60);
          return Math.min(100, Math.round((displayEtaSeconds / max) * 100));
        })()
      : 0;

  return (
    <div className='bg-background flex min-h-screen items-center justify-center p-4'>
      <Card className='flex w-full max-w-md flex-col items-center pt-6'>
        {/* Logo */}
        {unit?.config?.kiosk?.logoUrl && (
          <div className='relative mb-4 h-16 w-48'>
            <Image
              src={unit.config.kiosk.logoUrl}
              alt='Logo'
              fill
              className='object-contain'
            />
          </div>
        )}

        {/* Header text */}
        {unit?.config?.kiosk?.headerText && (
          <div className='mb-2 px-4 text-center text-lg font-medium'>
            {unit.config.kiosk.headerText}
          </div>
        )}

        <CardHeader className='w-full pb-2 text-center'>
          <CardTitle className='flex w-full justify-center text-center text-xl'>
            {service
              ? getLocalizedName(
                  service.name ?? '',
                  service.nameRu ?? null,
                  service.nameEn ?? null,
                  locale
                )
              : 'Ticket'}
          </CardTitle>
        </CardHeader>

        <CardContent className='flex w-full flex-col items-center pb-8 text-center'>
          {/* Queue number */}
          <div className='mb-2 text-7xl leading-none font-bold'>
            {ticket.queueNumber}
          </div>

          {/* Status badge */}
          <Badge
            variant={ticket.status === 'called' ? 'default' : 'secondary'}
            className='mb-4 px-4 py-1 text-lg'
          >
            {tStaff(ticket.status)}
          </Badge>

          {/* Queue position + ETA (waiting only) */}
          {ticket.status === 'waiting' && (
            <div className='mb-4 flex w-full max-w-xs flex-col items-center gap-2'>
              {displayPosition != null && (
                <span className='text-muted-foreground text-sm font-medium transition-all duration-300'>
                  {displayPosition === 1
                    ? t('queue_position_first')
                    : t('queue_position', { position: displayPosition })}
                </span>
              )}
              {displayEtaSeconds != null && displayEtaSeconds > 0 && (
                <>
                  <span className='text-muted-foreground text-xs transition-all duration-300'>
                    {t('estimated_wait', {
                      minutes: formatEstimatedWait(displayEtaSeconds)
                    })}
                  </span>
                  <Progress
                    className='h-2 w-full'
                    value={etaProgressPct}
                    indicatorClassName='transition-all duration-500 ease-out'
                  />
                </>
              )}
            </div>
          )}

          {/* Lifecycle stepper — fixed flex layout with explicit connector lines */}
          {!isTerminal && (
            <div className='mb-4 flex w-full items-start px-2'>
              {TICKET_STEPS.map((step, idx) => (
                <div
                  key={step.status}
                  className='flex flex-1 flex-col items-center'
                >
                  <div className='flex w-full items-center'>
                    {/* Left connector */}
                    <div
                      className={`h-0.5 flex-1 ${idx === 0 ? 'invisible' : idx <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
                    />
                    {/* Step circle */}
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        idx < stepIndex
                          ? 'bg-primary text-primary-foreground'
                          : idx === stepIndex
                            ? 'bg-primary text-primary-foreground ring-primary ring-2 ring-offset-2'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    {/* Right connector */}
                    <div
                      className={`h-0.5 flex-1 ${idx === TICKET_STEPS.length - 1 ? 'invisible' : idx < stepIndex ? 'bg-primary' : 'bg-muted'}`}
                    />
                  </div>
                  <span className='text-muted-foreground mt-1 max-w-[60px] text-center text-[10px] leading-tight'>
                    {t(step.labelKey)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Cancelled state — derived from ticket.status so it survives page reloads */}
          {isCancelled && (
            <div className='mb-4 space-y-2 text-center'>
              <p className='font-medium'>{t('cancelled_title')}</p>
              <p className='text-muted-foreground text-sm'>
                {t('cancelled_description')}
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => router.push(`/${locale}/queue/${ticket.unitId}`)}
              >
                {t('get_new_ticket')}
              </Button>
            </div>
          )}

          {/* Cancel button */}
          {canCancel && (
            <div className='mb-4 w-full'>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full'
                    disabled={cancelling}
                  >
                    {cancelling ? '...' : t('cancel_ticket')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('cancel_confirm_title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('cancel_confirm_description')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('cancel_confirm_cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancel}>
                      {t('cancel_confirm_ok')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* SMS opt-in — visible when waiting and visitor_notifications feature is active */}
          {ticket.status === 'waiting' &&
            smsOptInAvailable &&
            !smsSubmitted && (
              <div className='mb-4 w-full space-y-2 rounded-lg border p-3 text-left'>
                <p className='text-sm font-medium'>{t('sms_optin_title')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t('sms_optin_hint')}
                </p>
                <div className='flex gap-2'>
                  <Input
                    type='tel'
                    placeholder={t('sms_optin_placeholder')}
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    className='h-8 text-sm'
                  />
                  <Button
                    size='sm'
                    onClick={handleSmsOptIn}
                    disabled={smsSubmitting || !smsPhone.trim()}
                  >
                    {smsSubmitting ? '...' : t('sms_optin_button')}
                  </Button>
                </div>
              </div>
            )}
          {ticket.status === 'waiting' && smsOptInAvailable && smsSubmitted && (
            <p className='text-muted-foreground mb-4 text-xs'>
              {t('sms_optin_confirmed')}
            </p>
          )}

          {/* Footer text */}
          {unit?.config?.kiosk?.footerText && (
            <>
              <Separator className='my-4 w-full' />
              <div className='text-muted-foreground text-center text-sm'>
                {unit.config.kiosk.footerText}
              </div>
            </>
          )}

          {/* Feedback */}
          {unit?.config?.kiosk?.feedbackUrl && isTerminal && (
            <>
              <Separator className='my-4 w-full' />
              <Button variant='outline' className='w-full' asChild>
                <a
                  href={unit.config.kiosk.feedbackUrl.replace(
                    '{{ticketId}}',
                    ticket.id
                  )}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  {t('rate_visit')}
                </a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
