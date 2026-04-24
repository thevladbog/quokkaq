'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { KIOSK_FORCED_HIGH_CONTRAST } from '@/lib/kiosk-hc-palette';

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false });

export type KioskTicketSuccessOverlayProps = {
  open: boolean;
  onClose: () => void;
  a11yLive: string;
  logoUrl?: string;
  showTicketHeader: boolean;
  headerText?: string;
  serviceName: string;
  queueNumber: string;
  successEtaMinutes: number | null;
  successPeopleAhead: number | null;
  serviceZoneName: string | null;
  showTicketFooter: boolean;
  footerText?: string;
  qrValue: string;
  highContrast: boolean;
  /** Computed surface color (including HC and custom kiosk). */
  bodyBackground: string;
  smsBlocking: boolean;
  closeButtonLabel: string;
  closeDisabled?: boolean;
  /** Manual print: require QuokkaQ Kiosk + config with `isAlwaysPrintTicket: false` and a print target. */
  showPrintTicketButton?: boolean;
  onPrintTicket?: () => void;
  printTicketPending?: boolean;
  children?: React.ReactNode;
};

/**
 * Full-screen success state after a ticket is issued. Scrolls on short viewports;
 * CTA stays in a bottom band (safe-area aware).
 */
export function KioskTicketSuccessOverlay({
  open,
  onClose,
  a11yLive,
  logoUrl,
  showTicketHeader,
  headerText,
  serviceName,
  queueNumber,
  successEtaMinutes,
  successPeopleAhead,
  serviceZoneName,
  showTicketFooter,
  footerText,
  qrValue,
  highContrast,
  bodyBackground,
  smsBlocking,
  closeButtonLabel,
  closeDisabled,
  showPrintTicketButton,
  onPrintTicket,
  printTicketPending,
  children
}: KioskTicketSuccessOverlayProps) {
  const t = useTranslations('kiosk');

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const textMain = highContrast ? 'text-white' : 'text-kiosk-ink';
  const textMuted = highContrast ? 'text-zinc-300' : 'text-kiosk-ink-muted';
  const qrBox = highContrast
    ? 'bg-white p-3 shadow-sm'
    : 'bg-white p-3 shadow-sm ring-1 ring-black/5';
  const metaCard = highContrast
    ? 'rounded-2xl border border-white/20 bg-white/5 px-4 py-3'
    : 'bg-kiosk-border/15 rounded-2xl px-4 py-3';

  return (
    <div
      className='z-layer-dialog fixed inset-0 flex min-h-0 w-full max-w-full flex-col'
      role='dialog'
      aria-modal='true'
      aria-labelledby='kiosk-ticket-success-title'
      style={{ backgroundColor: bodyBackground }}
    >
      <div className='sr-only' aria-live='polite' aria-atomic>
        {a11yLive}
      </div>

      <div
        className='flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain'
        style={{
          // iOS: allow scroll within overlay
          WebkitOverflowScrolling: 'touch' as const
        }}
      >
        <div className='mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 md:max-w-4xl md:py-8 lg:max-w-5xl'>
          {logoUrl ? (
            <div
              className='flex w-full items-center justify-center'
              style={
                highContrast
                  ? { backgroundColor: KIOSK_FORCED_HIGH_CONTRAST.logoSurround }
                  : undefined
              }
            >
              <div
                className={cn(
                  'h-14 w-auto sm:h-16 md:h-20',
                  highContrast && 'rounded-lg p-2'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt=''
                  className='h-full w-auto object-contain'
                />
              </div>
            </div>
          ) : null}

          {showTicketHeader && headerText ? (
            <p
              className={cn(
                'text-center text-base font-medium sm:text-lg',
                textMain
              )}
            >
              {headerText}
            </p>
          ) : null}

          <h2
            id='kiosk-ticket-success-title'
            className={cn(
              'w-full text-center text-lg font-semibold sm:text-xl md:text-2xl',
              textMain
            )}
          >
            {serviceName}
          </h2>

          <p
            className={cn(
              'w-full text-center font-bold tracking-tight break-words',
              'text-[clamp(2.25rem,11vmin,5.5rem)] leading-[1.05] sm:text-[clamp(2.75rem,12vmin,6.25rem)]',
              textMain
            )}
          >
            {queueNumber}
          </p>

          {successEtaMinutes != null ||
          successPeopleAhead != null ||
          serviceZoneName ? (
            <div className='grid w-full max-w-2xl gap-3 sm:grid-cols-2'>
              {successEtaMinutes != null && (
                <div className={metaCard}>
                  <p
                    className={cn(
                      'text-center text-sm font-medium sm:text-base',
                      textMain
                    )}
                  >
                    {t('ticket.success_eta', { minutes: successEtaMinutes })}
                  </p>
                </div>
              )}
              {successPeopleAhead != null && (
                <div className={metaCard}>
                  <p
                    className={cn(
                      'text-center text-sm font-medium sm:text-base',
                      textMain
                    )}
                  >
                    {t('ticket.success_ahead', { n: successPeopleAhead })}
                  </p>
                </div>
              )}
              {serviceZoneName ? (
                <div className='w-full sm:col-span-2'>
                  <div className={metaCard}>
                    <p
                      className={cn(
                        'text-center text-sm font-medium sm:text-base',
                        textMain
                      )}
                    >
                      {t('ticket.success_zone', {
                        zone: serviceZoneName.trim()
                      })}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <Separator
            className={cn(
              'my-1 w-full max-w-2xl',
              highContrast && 'bg-white/20'
            )}
          />

          <div
            className={cn(
              'w-full max-w-2xl text-center text-sm sm:text-base',
              textMuted
            )}
          >
            {t('ticket.scanQrCode')}
          </div>

          <div
            className={cn(
              'mb-1 flex w-full max-w-sm flex-col items-center',
              qrBox,
              'rounded-2xl'
            )}
          >
            <QRCode
              value={qrValue}
              size={200}
              className='h-auto w-full max-w-[200px]'
            />
          </div>

          {showTicketFooter && footerText ? (
            <>
              <Separator
                className={cn(
                  'w-full max-w-2xl',
                  highContrast && 'bg-white/20'
                )}
              />
              <p
                className={cn(
                  'max-w-2xl text-center text-sm leading-relaxed sm:text-base',
                  textMuted
                )}
              >
                {footerText}
              </p>
            </>
          ) : null}

          {children ? (
            <div
              className={cn(
                'w-full max-w-lg pb-2',
                highContrast &&
                  'text-zinc-200 [&_label.text-muted-foreground]:text-zinc-300 [&_p.text-muted-foreground]:text-zinc-400'
              )}
            >
              {children}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'shrink-0 border-t px-4 py-3 sm:px-6 sm:py-4',
          highContrast
            ? 'border-white/20 bg-black/20'
            : 'bg-background/80 border-border backdrop-blur-sm',
          'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
        )}
      >
        <div className='mx-auto flex w-full max-w-md flex-col gap-2 sm:gap-3'>
          {showPrintTicketButton && onPrintTicket ? (
            <Button
              type='button'
              className='kiosk-touch-min h-14 min-h-14 w-full text-lg font-semibold sm:h-16 sm:min-h-16 sm:text-xl'
              onClick={onPrintTicket}
              disabled={!!printTicketPending || closeDisabled || smsBlocking}
              aria-label={t('ticket.print_action')}
            >
              {printTicketPending
                ? t('ticket.print_sending')
                : t('ticket.print_action')}
            </Button>
          ) : null}
          <Button
            type='button'
            variant='secondary'
            className='kiosk-touch-min h-12 min-h-12 w-full text-base font-semibold sm:h-14 sm:min-h-14 sm:text-lg'
            onClick={onClose}
            disabled={closeDisabled || smsBlocking}
            aria-label={t('close')}
          >
            {closeButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
