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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  printReceiptFromKioskConfig,
  ticketReceiptLines
} from '@/lib/kiosk-print';
import {
  formatAppDate,
  formatAppTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';

export default function UnitKioskPage() {
  const params = useParams() as { unitId?: string };
  const unitId = params.unitId;
  const [selectedServicePath, setSelectedServicePath] = useState<Service[]>([]);
  const [, setMessage] = useState('');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const { data: unitServicesTree, isLoading: servicesLoading } =
    useUnitServicesTree(unitId!);
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

  // Custom colors from config
  const isCustomColorsEnabled =
    unit?.config?.kiosk?.isCustomColorsEnabled || false;
  const headerColor = isCustomColorsEnabled
    ? unit?.config?.kiosk?.headerColor || '#ffffff'
    : '#ffffff';
  const bodyColor = isCustomColorsEnabled
    ? unit?.config?.kiosk?.bodyColor || '#f3f4f6'
    : '#f3f4f6';
  const serviceGridColor = isCustomColorsEnabled
    ? unit?.config?.kiosk?.serviceGridColor || '#ffffff'
    : '#ffffff';

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

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Clear interval on component unmount
    return () => clearInterval(timer);
  }, []);

  // Cleanup any pending auto-close timer when unmounting
  useEffect(() => {
    return () => {
      if (autoCloseTimerId) {
        clearInterval(autoCloseTimerId);
      }
    };
  }, [autoCloseTimerId]);

  // Get current services based on selected path
  // unitServicesTree contains flat list of services, so we need to filter by parentId
  const currentServices = () => {
    if (!unitServicesTree) {
      return []; // Return empty array if services haven't loaded yet
    }

    if (selectedServicePath.length === 0) {
      // Top level services - services without parent (parentId is null or undefined)
      return unitServicesTree.filter((service) => !service.parentId);
    } else {
      // Services under the currently selected service
      const lastService = selectedServicePath[selectedServicePath.length - 1];
      return unitServicesTree.filter(
        (service) => service.parentId === lastService.id
      );
    }
  };

  const handleServiceSelection = async (service: Service) => {
    if (service.isLeaf) {
      // This is a leaf service, create a ticket
      setMessage('');
      try {
        const ticket = await createTicketMutation.mutateAsync({
          unitId: unitId!,
          serviceId: service.id
        });
        setCreatedTicket(ticket);
        setIsTicketModalOpen(true);
        setSelectedServicePath([]);

        // Reset countdown and start timer
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
            service: getLocalizedName(
              service.name,
              service.nameRu,
              service.nameEn,
              locale
            )
          })
        );
      } catch (error) {
        console.error('Failed to create ticket:', error);
        setMessage(
          t('ticketCreationFailed', {
            defaultValue: 'Failed to create ticket. Please try again.'
          })
        );
      }
    } else {
      // This is a parent service, navigate to its children
      setSelectedServicePath((prev) => [...prev, service]);
    }
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

  if (servicesLoading) {
    return (
      <div
        className='bg-background flex min-h-screen flex-col p-4'
        style={{ backgroundColor: bodyColor }}
      >
        {/* Header with date/time and language/theme toggles */}
        <div
          className='mb-4 flex items-center justify-between rounded-lg p-4'
          style={{ backgroundColor: headerColor }}
        >
          {/* Date and Time in two rows - time first, date second */}
          <div className='text-center'>
            <div className='text-3xl font-bold'>
              {formatAppTime(new Date(), intlLocale)}
            </div>
            <div className='mt-1 text-sm'>
              {formatAppDate(new Date(), intlLocale, 'full')}
            </div>
          </div>

          {/* Language and Theme toggles on the right */}
          <div className='flex space-x-2'>
            <KioskLanguageSwitcher />
          </div>
        </div>

        <div className='flex flex-1 items-center justify-center'>
          <div className='text-center'>
            <div className='border-primary mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2'></div>
            <p className='text-muted-foreground'>{t('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  // If no services are available at the current level
  if (currentServices().length === 0) {
    return (
      <div
        className='bg-background flex min-h-screen flex-col p-4'
        style={{ backgroundColor: bodyColor }}
      >
        {/* Header with date/time and language/theme toggles */}
        <div
          className='mb-4 flex items-center justify-between rounded-lg p-4'
          style={{ backgroundColor: headerColor }}
        >
          {/* Date and Time in two rows - time first, date second */}
          <div className='text-center'>
            <div className='text-3xl font-bold'>
              {formatAppTime(new Date(), intlLocale)}
            </div>
            <div className='mt-1 text-sm'>
              {formatAppDate(new Date(), intlLocale, 'full')}
            </div>
          </div>

          {/* Language and Theme toggles on the right */}
          <div className='flex space-x-2'>
            <KioskLanguageSwitcher />
          </div>
        </div>

        <div className='flex flex-1 items-center justify-center'>
          <div className='text-center'>
            <h2 className='mb-2 text-2xl font-bold'>
              {selectedServicePath.length > 0
                ? getLocalizedName(
                    selectedServicePath[selectedServicePath.length - 1].name,
                    selectedServicePath[selectedServicePath.length - 1].nameRu,
                    selectedServicePath[selectedServicePath.length - 1].nameEn,
                    locale
                  )
                : t('selectService')}
            </h2>
            <p className='text-muted-foreground mb-4'>
              {t('noServicesAvailable', {
                defaultValue: 'No services available at this level'
              })}
            </p>
            <Button onClick={handleGoBack}>
              {selectedServicePath.length > 0
                ? t('back')
                : t('changeLocation', { defaultValue: 'Change Location' })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className='bg-background flex min-h-screen flex-col p-4'
      style={{ backgroundColor: bodyColor }}
    >
      {/* Header with date/time and language/theme toggles */}
      <div
        className='mb-4 flex items-center justify-between rounded-lg p-4 shadow-sm'
        style={{ backgroundColor: headerColor }}
      >
        {/* Date and Time in two rows - time first, date second */}
        <div
          className='cursor-pointer text-center select-none'
          onClick={handleClockClick}
        >
          <div className='text-3xl font-bold'>
            {formatAppTime(currentTime, intlLocale)}
          </div>
          <div className='mt-1 text-sm'>
            {formatAppDate(currentTime, intlLocale, 'full')}
          </div>
        </div>

        {/* Language toggle and Logo on the right */}
        <div className='flex items-center gap-4 md:gap-8'>
          {unit?.config?.kiosk?.isPreRegistrationEnabled && (
            <Button
              variant='secondary'
              className='h-12 text-xl md:h-16 md:w-50'
              onClick={() => setIsRedemptionModalOpen(true)}
            >
              {t('pre_registration.button', { defaultValue: 'I have a code' })}
            </Button>
          )}

          <KioskLanguageSwitcher className='h-12 w-12 text-xl md:h-16 md:w-16' />
          {/* ThemeToggle removed as per request */}

          {unit?.config?.kiosk?.logoUrl && (
            <div className='relative h-12 w-auto md:h-16'>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={unit.config.kiosk.logoUrl}
                alt='Logo'
                className='h-full w-auto object-contain'
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation breadcrumbs and buttons */}
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center overflow-x-auto'>
          <span className='text-muted-foreground mr-2 whitespace-nowrap'>
            #
          </span>
          {selectedServicePath.length === 0 ? (
            <span className='text-muted-foreground'>
              {t('services', { defaultValue: 'Services' })}
            </span>
          ) : (
            selectedServicePath.map((service, index) => (
              <div key={index} className='flex items-center'>
                {index > 0 && (
                  <Separator orientation='vertical' className='mx-2 h-4' />
                )}
                <span className='whitespace-nowrap'>
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

        <div className='ml-4 flex shrink-0 items-center gap-2'>
          {selectedServicePath.length > 1 && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setSelectedServicePath([])}
            >
              <Home className='mr-2 h-4 w-4' />
              {t('home', { defaultValue: 'Home' })}
            </Button>
          )}
          {selectedServicePath.length > 0 && (
            <Button variant='outline' size='sm' onClick={handleGoBack}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              {t('back', { defaultValue: 'Back' })}
            </Button>
          )}
        </div>
      </div>

      {/* Services grid */}
      <div
        className='bg-muted grid h-full w-full flex-1 grid-cols-8 grid-rows-4 gap-4 overflow-auto rounded-lg p-4'
        style={{ backgroundColor: serviceGridColor }}
      >
        {/* Render services with their exact grid positions */}
        {currentServices().map((service) => {
          if (service.gridRow !== null && service.gridCol !== null) {
            // Calculate grid positions accounting for CSS Grid 1-indexed positions
            const startRow = (service.gridRow ?? 0) + 1; // Convert from 0-indexed to 1-indexed
            const startCol = (service.gridCol ?? 0) + 1; // Convert from 0-indexed to 1-indexed
            const rowSpan = service.gridRowSpan || 1;
            const colSpan = service.gridColSpan || 1;

            return (
              <div
                key={service.id}
                className='h-full w-full'
                style={{
                  gridRow: `${startRow} / span ${rowSpan}`,
                  gridColumn: `${startCol} / span ${colSpan}`
                }}
              >
                <Card
                  className='relative flex h-full w-full cursor-pointer flex-col overflow-hidden border-0 transition-all hover:shadow-lg'
                  onClick={() => handleServiceSelection(service)}
                  style={{
                    backgroundColor: service.backgroundColor || undefined,
                    color: service.textColor || undefined
                  }}
                >
                  <CardHeader className='relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-3'>
                    <CardTitle className='line-clamp-2 shrink-0 px-1 text-center text-2xl font-semibold wrap-break-word'>
                      {getLocalizedName(
                        service.name,
                        service.nameRu || '',
                        service.nameEn || '',
                        locale
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='relative z-10 shrink-0 p-2 pt-0'>
                    {service.description && (
                      <p className='text-muted-foreground line-clamp-2 px-1 text-center text-base wrap-break-word'>
                        {getLocalizedName(
                          service.description,
                          service.descriptionRu,
                          service.descriptionEn,
                          locale
                        )}
                      </p>
                    )}
                  </CardContent>
                  {service.imageUrl && (
                    <div className='absolute inset-0 z-0 p-4'>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={service.imageUrl}
                        alt={service.name}
                        className='object-contain opacity-20'
                      />
                    </div>
                  )}
                </Card>
              </div>
            );
          }

          return null;
        })}

        {/* Add empty cells to fill up the grid structure where no services are positioned */}
        {Array.from({ length: 32 }).map((_, index) => {
          const row = Math.floor(index / 8);
          const col = index % 8;

          // Check if this cell is already occupied by a service
          const isOccupied = currentServices().some((service) => {
            if (service.gridRow === null || service.gridCol === null) {
              return false;
            }

            // Check if this cell falls within the service's grid position
            return (
              row >= (service.gridRow || 0) &&
              row < (service.gridRow || 0) + (service.gridRowSpan || 1) &&
              col >= (service.gridCol || 0) &&
              col < (service.gridCol || 0) + (service.gridColSpan || 1)
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

            {/* Header text (if set) */}
            {unit?.config?.kiosk?.headerText && (
              <div className='mb-2 text-center text-lg font-medium'>
                {unit.config.kiosk.headerText}
              </div>
            )}

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

              {/* Show Footer if configured */}
              {unit?.config?.kiosk?.footerText && (
                <>
                  <Separator className='my-4 w-full' />
                  <div className='text-muted-foreground text-center text-sm'>
                    {unit.config.kiosk.footerText}
                  </div>
                </>
              )}
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

      <PreRegRedemptionModal
        isOpen={isRedemptionModalOpen}
        onClose={() => setIsRedemptionModalOpen(false)}
        unitId={unitId!}
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
