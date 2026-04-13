'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useUnitServicesTree, useCreateTicketInUnit } from '@/lib/hooks';
import type { Ticket, Service } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '@/components/ui/dialog';
import { ArrowLeft, Home } from 'lucide-react';
import dynamic from 'next/dynamic';
const QRCode = dynamic(() => import('react-qr-code'), { ssr: false });
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useParams } from 'next/navigation';
import { useRouter } from '@/src/i18n/navigation';
import { useLocale } from 'next-intl';
import { getLocalizedName } from '@/lib/utils';
import KioskLanguageSwitcher from '@/components/KioskLanguageSwitcher';
import { useUnit } from '@/lib/hooks';
import { PinCodeModal } from '@/components/kiosk/pin-code-modal';
import { KioskSettingsSheet } from '@/components/kiosk/kiosk-settings-sheet';
import { LockScreen } from '@/components/kiosk/lock-screen';
import { PreRegRedemptionModal } from '@/components/kiosk/PreRegRedemptionModal';
import { KioskPhoneIdentificationModal } from '@/components/kiosk/kiosk-phone-identification-modal';
import { KioskTopBar } from '@/components/kiosk/kiosk-top-bar';
import { KioskWelcomeHero } from '@/components/kiosk/kiosk-welcome-hero';
import { KioskServiceTile } from '@/components/kiosk/kiosk-service-tile';
import {
  printReceiptFromKioskConfig,
  ticketReceiptLines
} from '@/lib/kiosk-print';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';
import {
  GRID_ZONE_SCOPE_NONE,
  SERVICE_GRID_CELL_COUNT,
  SERVICE_GRID_COLS,
  SERVICE_GRID_ROWS,
  isServicePlacedOnGrid,
  serviceMatchesGridZoneScope
} from '@/lib/service-grid';

export default function UnitKioskPage() {
  const params = useParams() as { unitId?: string };
  const unitId = params.unitId;
  const [selectedServicePath, setSelectedServicePath] = useState<Service[]>([]);
  const [, setMessage] = useState('');
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const createTicketMutation = useCreateTicketInUnit();
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [autoCloseTimerId, setAutoCloseTimerId] =
    useState<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState<number>(5);
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const t = useTranslations('kiosk');
  const [baseAppUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  });

  const { data: unit } = useUnit(unitId!, {
    refetchInterval: 120000,
    // Desktop WebView + React Query cache: always pick up fresh kiosk PIN / config.
    refetchOnMount: 'always'
  });

  /** Subdivision id for services API and ticket creation (always the branch unit). */
  const kioskApiUnitId = useMemo(() => {
    if (!unit) return undefined;
    if (unit.kind === 'service_zone') {
      return unit.parentId ?? undefined;
    }
    return unit.id;
  }, [unit]);

  /** Which grid column (pool) the kiosk shows: subdivision-wide vs this zone. */
  const kioskGridZoneScope = useMemo(() => {
    if (!unit || !unitId) return GRID_ZONE_SCOPE_NONE;
    if (unit.kind === 'service_zone') return unitId;
    return GRID_ZONE_SCOPE_NONE;
  }, [unit, unitId]);

  const {
    data: unitServicesTree,
    isLoading: servicesLoading,
    isError: servicesQueryError,
    refetch: refetchServicesTree
  } = useUnitServicesTree(kioskApiUnitId ?? '', {
    enabled: Boolean(kioskApiUnitId)
  });

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setSelectedServicePath([]);
    });
    return () => cancelAnimationFrame(id);
  }, [kioskGridZoneScope]);

  const tryPrintTicket = async (ticket: Ticket, serviceLabel: string) => {
    const kc = unit?.config?.kiosk;
    if (!kc || kc.isPrintEnabled === false) {
      return;
    }
    try {
      const printed = await printReceiptFromKioskConfig(
        kc,
        ticketReceiptLines(ticket, serviceLabel, unit?.name)
      );
      if (!printed) {
        return;
      }
    } catch (e) {
      console.error('Kiosk native print failed:', e);
    }
  };
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [, setClockClicks] = useState(0);
  const [isRedemptionModalOpen, setIsRedemptionModalOpen] = useState(false);
  const [isPhoneIdentificationOpen, setIsPhoneIdentificationOpen] =
    useState(false);
  const [pendingPhoneService, setPendingPhoneService] =
    useState<Service | null>(null);
  const [phoneIdentificationError, setPhoneIdentificationError] = useState('');
  const [phoneIdentificationSessionKey, setPhoneIdentificationSessionKey] =
    useState(0);

  // Custom colors from config
  const isCustomColorsEnabled =
    unit?.config?.kiosk?.isCustomColorsEnabled || false;
  const headerColor = isCustomColorsEnabled
    ? unit?.config?.kiosk?.headerColor || '#fff9f4'
    : '#fff9f4';
  const bodyColor = isCustomColorsEnabled
    ? unit?.config?.kiosk?.bodyColor || '#fef8f3'
    : '#fef8f3';
  const serviceGridColor = isCustomColorsEnabled
    ? unit?.config?.kiosk?.serviceGridColor || '#f2ebe6'
    : '#f2ebe6';

  const kioskCfg = unit?.config?.kiosk;
  const showTicketHeader = kioskCfg?.showHeader !== false;
  const showTicketFooter = kioskCfg?.showFooter !== false;

  const showUnitInHeader = kioskCfg?.showUnitInHeader !== false;
  const unitLabelOverride = kioskCfg?.kioskUnitLabelText?.trim();
  const resolvedHeaderUnitTitle =
    unitLabelOverride || unit?.name?.trim() || t('kioskTitle');

  const switcherClass =
    'text-kiosk-ink h-11 min-w-[3.25rem] rounded-full border-0 bg-[#f2ede8] px-4 text-base font-semibold shadow-sm hover:bg-[#ebe4de] md:h-12 md:min-w-[3.5rem]';

  const topBarLeading = (
    <>
      {kioskCfg?.logoUrl ? (
        <div className='relative h-10 w-auto shrink-0 md:h-14'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={kioskCfg.logoUrl}
            alt=''
            className='h-full w-auto object-contain'
          />
        </div>
      ) : null}
      {showUnitInHeader ? (
        <p className='text-kiosk-ink min-w-0 truncate text-lg font-bold tracking-tight sm:text-xl md:text-2xl'>
          {resolvedHeaderUnitTitle}
        </p>
      ) : null}
    </>
  );

  const topBarBeforeClock = (
    <>
      {kioskCfg?.isPreRegistrationEnabled ? (
        <Button
          variant='secondary'
          className='text-kiosk-ink h-11 shrink-0 rounded-full px-4 text-base font-semibold shadow-sm md:h-12'
          onClick={() => setIsRedemptionModalOpen(true)}
        >
          {t('pre_registration.button', { defaultValue: 'I have a code' })}
        </Button>
      ) : null}
      <KioskLanguageSwitcher className={switcherClass} />
    </>
  );

  const isServiceRoot = selectedServicePath.length === 0;
  const pathLeaf = selectedServicePath[selectedServicePath.length - 1];
  const heroTitle = isServiceRoot
    ? kioskCfg?.welcomeTitle?.trim() || t('welcome_default_title')
    : pathLeaf
      ? getLocalizedName(
          pathLeaf.name,
          pathLeaf.nameRu,
          pathLeaf.nameEn,
          locale
        )
      : t('selectService');
  const heroSubtitle = isServiceRoot
    ? kioskCfg?.welcomeSubtitle?.trim() || t('welcome_default_subtitle')
    : undefined;

  const handleClockClick = () => {
    setClockClicks((prev) => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setIsPinModalOpen(true);
        return 0;
      }
      return newCount;
    });
    // Reset clicks if not continued quickly
    setTimeout(() => setClockClicks(0), 2000);
  };

  // Update time every second (defer first tick to client to avoid SSR/client clock mismatch)
  useEffect(() => {
    const tick = () => setCurrentTime(new Date());
    const startId = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(timer);
    };
  }, []);

  // Cleanup any pending auto-close timer when unmounting
  useEffect(() => {
    return () => {
      if (autoCloseTimerId) {
        clearInterval(autoCloseTimerId);
      }
    };
  }, [autoCloseTimerId]);

  // Visible services for the current breadcrumb level (recomputed only when tree or path changes)
  const visibleServices = useMemo(() => {
    if (!unitServicesTree) {
      return [];
    }
    const atLevel =
      selectedServicePath.length === 0
        ? unitServicesTree.filter((service) => !service.parentId)
        : unitServicesTree.filter(
            (service) =>
              service.parentId ===
              selectedServicePath[selectedServicePath.length - 1].id
          );
    return atLevel.filter((service) => {
      if (!isServicePlacedOnGrid(service)) {
        return false;
      }
      if (unit?.kind === 'subdivision') {
        return true;
      }
      return serviceMatchesGridZoneScope(service, kioskGridZoneScope);
    });
  }, [unitServicesTree, selectedServicePath, kioskGridZoneScope, unit?.kind]);

  const openTicketSuccessFlow = (ticket: Ticket, service: Service) => {
    setCreatedTicket(ticket);
    setIsTicketModalOpen(true);
    setSelectedServicePath([]);
    setCountdown(5);
    if (autoCloseTimerId) {
      clearInterval(autoCloseTimerId);
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsTicketModalOpen(false);
          setCreatedTicket(null);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setAutoCloseTimerId(timer);
    const serviceLabel = getLocalizedName(
      service.name,
      service.nameRu || '',
      service.nameEn || '',
      locale
    );
    void tryPrintTicket(ticket, serviceLabel);
    setMessage(
      t('ticketCreated', {
        defaultValue: 'Ticket created successfully!',
        service: serviceLabel
      })
    );
  };

  const createTicketForService = async (
    service: Service,
    opts?: { visitorPhone: string; visitorLocale: 'en' | 'ru' },
    failTarget?: 'phoneModal' | 'page'
  ) => {
    setMessage('');
    try {
      const ticket = await createTicketMutation.mutateAsync(
        opts
          ? {
              unitId: kioskApiUnitId!,
              serviceId: service.id,
              visitorPhone: opts.visitorPhone,
              visitorLocale: opts.visitorLocale
            }
          : {
              unitId: kioskApiUnitId!,
              serviceId: service.id
            }
      );
      setPhoneIdentificationError('');
      setIsPhoneIdentificationOpen(false);
      setPendingPhoneService(null);
      openTicketSuccessFlow(ticket, service);
    } catch (error) {
      console.error('Failed to create ticket:', error);
      const failDefault = t('ticketCreationFailed', {
        defaultValue: 'Failed to create ticket. Please try again.'
      });
      if (failTarget === 'phoneModal') {
        setPhoneIdentificationError(
          t('phone_identification.submit_failed', {
            defaultValue: failDefault
          })
        );
      } else {
        setMessage(failDefault);
      }
    }
  };

  const handleServiceSelection = async (service: Service) => {
    if (service.isLeaf) {
      if (service.offerIdentification) {
        setPhoneIdentificationError('');
        setPendingPhoneService(service);
        setPhoneIdentificationSessionKey((k) => k + 1);
        setIsPhoneIdentificationOpen(true);
        return;
      }
      await createTicketForService(service);
      return;
    }
    setSelectedServicePath((prev) => [...prev, service]);
  };

  const handlePhoneIdentificationSkip = () => {
    setIsPhoneIdentificationOpen(false);
    setPhoneIdentificationError('');
    const svc = pendingPhoneService;
    setPendingPhoneService(null);
    if (svc) {
      void createTicketForService(svc, undefined, 'page');
    }
  };

  const handlePhoneIdentificationConfirm = (visitorPhone: string) => {
    const svc = pendingPhoneService;
    if (!svc) {
      return;
    }
    void createTicketForService(
      svc,
      {
        visitorPhone,
        visitorLocale: locale === 'ru' ? 'ru' : 'en'
      },
      'phoneModal'
    );
  };

  const handleGoBack = () => {
    if (selectedServicePath.length > 0) {
      const newPath = [...selectedServicePath];
      newPath.pop();
      setSelectedServicePath(newPath);
    } else {
      // If we're at the top level, navigate back to unit selection
      router.push('/kiosk');
    }
  };

  return (
    <div
      className='text-kiosk-ink flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4'
      style={{ backgroundColor: bodyColor }}
    >
      <KioskTopBar
        intlLocale={intlLocale}
        currentTime={currentTime}
        onClockClick={handleClockClick}
        headerColor={headerColor}
        leading={topBarLeading}
        beforeClock={topBarBeforeClock}
      />

      {!unit ? (
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='text-center'>
            <div className='border-kiosk-ink/30 mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-b-transparent'></div>
            <p className='text-kiosk-ink-muted'>{t('loading')}</p>
          </div>
        </div>
      ) : unit.kind === 'service_zone' && !unit.parentId ? (
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4'>
          <p className='text-kiosk-ink-muted text-center text-base'>
            {t('kiosk_zone_missing_parent', {
              defaultValue:
                'This service zone is not linked to a parent branch. Kiosk cannot load services.'
            })}
          </p>
        </div>
      ) : servicesLoading ? (
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='text-center'>
            <div className='border-kiosk-ink/30 mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-b-transparent'></div>
            <p className='text-kiosk-ink-muted'>{t('loading')}</p>
          </div>
        </div>
      ) : servicesQueryError ? (
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='max-w-md px-4 text-center'>
            <h2 className='mb-2 text-2xl font-bold tracking-tight sm:text-3xl'>
              {t('servicesUnavailableTitle', {
                defaultValue: 'Services unavailable'
              })}
            </h2>
            <p className='text-kiosk-ink-muted mb-6 text-base'>
              {t('servicesUnavailableMessage', {
                defaultValue:
                  "We could not load this unit's services. Check the connection and try again."
              })}
            </p>
            <Button
              className='rounded-full px-8'
              onClick={() => void refetchServicesTree()}
            >
              {t('retryServices', { defaultValue: 'Try again' })}
            </Button>
          </div>
        </div>
      ) : visibleServices.length === 0 ? (
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='max-w-md px-4 text-center'>
            <h2 className='mb-2 text-2xl font-bold tracking-tight sm:text-3xl'>
              {selectedServicePath.length > 0
                ? getLocalizedName(
                    selectedServicePath[selectedServicePath.length - 1].name,
                    selectedServicePath[selectedServicePath.length - 1].nameRu,
                    selectedServicePath[selectedServicePath.length - 1].nameEn,
                    locale
                  )
                : t('selectService')}
            </h2>
            <p className='text-kiosk-ink-muted mb-6 text-base'>
              {t('noServicesAvailable', {
                defaultValue: 'No services available at this level'
              })}
            </p>
            <Button className='rounded-full px-8' onClick={handleGoBack}>
              {selectedServicePath.length > 0
                ? t('back')
                : t('changeLocation', { defaultValue: 'Change Location' })}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <KioskWelcomeHero title={heroTitle} subtitle={heroSubtitle} />

          {/* Navigation breadcrumbs and buttons */}
          <div className='border-kiosk-border/50 mb-2 flex shrink-0 items-center justify-between rounded-xl border bg-white/40 px-3 py-2 sm:mb-3 sm:px-4'>
            <div className='text-kiosk-ink-muted flex min-w-0 items-center overflow-x-auto text-sm font-medium'>
              <span className='mr-2 shrink-0 opacity-70'>#</span>
              {selectedServicePath.length === 0 ? (
                <span>{t('services', { defaultValue: 'Services' })}</span>
              ) : (
                selectedServicePath.map((service, index) => (
                  <div key={index} className='flex items-center'>
                    {index > 0 && (
                      <Separator
                        orientation='vertical'
                        className='bg-kiosk-border mx-2 h-4'
                      />
                    )}
                    <span className='text-kiosk-ink whitespace-nowrap'>
                      {getLocalizedName(
                        service.name,
                        service.nameRu,
                        service.nameEn,
                        locale
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className='ml-3 flex shrink-0 items-center gap-2'>
              {selectedServicePath.length > 1 && (
                <Button
                  variant='outline'
                  size='sm'
                  className='border-kiosk-border/60 rounded-full'
                  onClick={() => setSelectedServicePath([])}
                >
                  <Home className='mr-2 h-4 w-4' />
                  {t('home', { defaultValue: 'Home' })}
                </Button>
              )}
              {selectedServicePath.length > 0 && (
                <Button
                  variant='outline'
                  size='sm'
                  className='border-kiosk-border/60 rounded-full'
                  onClick={handleGoBack}
                >
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  {t('back', { defaultValue: 'Back' })}
                </Button>
              )}
            </div>
          </div>

          {/* Services grid — fills remaining viewport height; no page scroll */}
          <div
            className='grid min-h-0 w-full min-w-0 flex-1 gap-1.5 overflow-hidden rounded-2xl p-2 sm:gap-2 sm:p-3 md:gap-3 md:p-4'
            style={{
              backgroundColor: serviceGridColor,
              gridTemplateColumns: `repeat(${SERVICE_GRID_COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${SERVICE_GRID_ROWS}, minmax(0, 1fr))`
            }}
          >
            {/* Render services with their exact grid positions */}
            {visibleServices.map((service) => {
              const startRow = (service.gridRow ?? 0) + 1;
              const startCol = (service.gridCol ?? 0) + 1;
              const rowSpan = service.gridRowSpan || 1;
              const colSpan = service.gridColSpan || 1;

              return (
                <div
                  key={service.id}
                  className='h-full min-h-0 w-full min-w-0'
                  style={{
                    gridRow: `${startRow} / span ${rowSpan}`,
                    gridColumn: `${startCol} / span ${colSpan}`
                  }}
                >
                  <KioskServiceTile
                    service={service}
                    locale={locale}
                    onSelect={handleServiceSelection}
                  />
                </div>
              );
            })}

            {/* Add empty cells to fill up the grid structure where no services are positioned */}
            {Array.from({ length: SERVICE_GRID_CELL_COUNT }).map((_, index) => {
              const row = Math.floor(index / SERVICE_GRID_COLS);
              const col = index % SERVICE_GRID_COLS;

              // Check if this cell is already occupied by a service
              const isOccupied = visibleServices.some((service) => {
                if (!isServicePlacedOnGrid(service)) {
                  return false;
                }

                // Check if this cell falls within the service's grid position
                return (
                  row >= (service.gridRow as number) &&
                  row <
                    (service.gridRow as number) + (service.gridRowSpan || 1) &&
                  col >= (service.gridCol as number) &&
                  col < (service.gridCol as number) + (service.gridColSpan || 1)
                );
              });

              // Only render empty cell if not occupied
              if (!isOccupied) {
                return (
                  <div
                    key={`empty-${row}-${col}`}
                    className='border-0 opacity-0'
                    style={{
                      gridRow: `${row + 1}`,
                      gridColumn: `${col + 1}`
                    }}
                  />
                );
              }

              return null;
            })}
          </div>
        </>
      )}

      {/* Ticket modal */}
      <Dialog
        open={isTicketModalOpen}
        onOpenChange={(open) => {
          setIsTicketModalOpen(open);
          if (!open) {
            setCreatedTicket(null);
            if (autoCloseTimerId) {
              clearInterval(autoCloseTimerId);
              setAutoCloseTimerId(null);
            }
          }
        }}
      >
        {createdTicket && (
          <DialogContent className='flex w-[320px] flex-col items-center sm:w-[420px]'>
            {/* Logo (top) */}
            {unit?.config?.kiosk?.logoUrl && (
              <div className='mb-4 h-16 w-auto'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={unit.config.kiosk.logoUrl} alt='Logo' />
              </div>
            )}

            {showTicketHeader && kioskCfg?.headerText ? (
              <div className='mb-2 text-center text-lg font-medium'>
                {kioskCfg.headerText}
              </div>
            ) : null}

            <DialogHeader>
              <DialogTitle className='text-center text-xl'>
                {getLocalizedName(
                  // If the service name might be in the ticket or use current selection fallback
                  unitServicesTree?.find(
                    (s) => s.id === createdTicket.serviceId
                  )?.name || '',
                  unitServicesTree?.find(
                    (s) => s.id === createdTicket.serviceId
                  )?.nameRu || '',
                  unitServicesTree?.find(
                    (s) => s.id === createdTicket.serviceId
                  )?.nameEn || '',
                  locale
                )}
              </DialogTitle>
            </DialogHeader>

            <div className='flex w-full flex-col items-center text-center'>
              <div className='mb-4 text-7xl leading-none font-bold'>
                {createdTicket.queueNumber}
              </div>

              <Separator className='my-4 w-full' />

              <div className='text-muted-foreground mb-4 text-sm'>
                {t('ticket.scanQrCode')}
              </div>

              <div className='mb-4 rounded-lg bg-white p-2'>
                {/* QR code component will be dynamically imported to avoid SSR issues */}
                <QRCode
                  value={`${baseAppUrl}/${locale}/ticket/${createdTicket.id}`}
                  size={180}
                />
              </div>

              {showTicketFooter && kioskCfg?.footerText ? (
                <>
                  <Separator className='my-4 w-full' />
                  <div className='text-muted-foreground text-center text-sm'>
                    {kioskCfg.footerText}
                  </div>
                </>
              ) : null}
            </div>
            <DialogFooter className='w-full sm:justify-center'>
              <DialogClose asChild>
                <Button
                  variant='secondary'
                  className='w-full min-w-[120px] sm:w-auto'
                >
                  {t('close')} ({countdown})
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <PinCodeModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => setIsSettingsOpen(true)}
        correctPin={unit?.config?.kiosk?.pin || '0000'}
      />

      <KioskSettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        unitId={unitId!}
        unitName={unit?.name ?? ''}
        currentConfig={unit?.config}
        onLock={() => {
          setIsSettingsOpen(false);
          setIsLocked(true);
        }}
        isLocked={isLocked}
        onUnlock={() => {
          setIsLocked(false);
          setIsSettingsOpen(false);
        }}
      />

      <LockScreen
        isLocked={isLocked}
        onUnlockRequest={() => setIsPinModalOpen(true)}
      />

      <KioskPhoneIdentificationModal
        isOpen={isPhoneIdentificationOpen}
        sessionKey={phoneIdentificationSessionKey}
        onSkip={handlePhoneIdentificationSkip}
        onConfirm={handlePhoneIdentificationConfirm}
        isPending={createTicketMutation.isPending}
        errorMessage={phoneIdentificationError || undefined}
      />

      <PreRegRedemptionModal
        isOpen={isRedemptionModalOpen}
        onClose={() => setIsRedemptionModalOpen(false)}
        unitId={kioskApiUnitId ?? unitId!}
        onSuccess={(ticket) => {
          setCreatedTicket(ticket);
          setIsTicketModalOpen(true);
          setSelectedServicePath([]);
          // Start auto-close timer logic (copied from handleServiceSelection)
          setCountdown(5);
          if (autoCloseTimerId) {
            clearInterval(autoCloseTimerId);
          }
          const timer = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                setIsTicketModalOpen(false);
                setCreatedTicket(null);
                clearInterval(timer);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          setAutoCloseTimerId(timer);
          const svc = unitServicesTree?.find((s) => s.id === ticket.serviceId);
          const label = svc
            ? getLocalizedName(
                svc.name,
                svc.nameRu || '',
                svc.nameEn || '',
                locale
              )
            : '';
          void tryPrintTicket(ticket, label);
        }}
      />
    </div>
  );
}
