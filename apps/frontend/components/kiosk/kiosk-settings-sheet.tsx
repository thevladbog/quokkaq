'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations, type _Translator } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Lock } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet';
import { usePatchKioskConfig } from '@/lib/hooks';
import { toast } from 'sonner';
import { LogoUpload } from '@/components/ui/logo-upload';
import { preRegistrationsApi, type UnitConfig } from '@/lib/api';
import {
  listKioskSerialPorts,
  testKioskSerialPort
} from '@/lib/kiosk-scanner-agent';
import { Link } from '@/src/i18n/navigation';
import {
  isTauriKiosk,
  listPrintersViaTauri,
  printKioskJob,
  testPrintLines,
  type PrinterInfo
} from '@/lib/kiosk-print';
import { useKioskHeaderFields } from '@/hooks/use-kiosk-header-fields';
import type { KioskConfig } from '@quokkaq/shared-types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  evaluateKioskConfigSurfaces,
  type KioskColorContrastCheck,
  WCAG
} from '@/lib/kiosk-wcag-contrast';

const DEFAULT_IDLE_WARNING_SEC = 45;
const DEFAULT_IDLE_COUNTDOWN_SEC = 15;

function KioskSettingsColorColumn({
  inputId,
  color,
  onColorChange,
  label,
  textPlaceholder,
  check,
  surfaceName,
  t
}: {
  inputId: string;
  color: string;
  onColorChange: (v: string) => void;
  label: string;
  textPlaceholder: string;
  check: KioskColorContrastCheck;
  surfaceName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- use-intl `IntlMessages` is `Record<string, any>` without strict locale types
  t: _Translator<Record<string, any>, 'kiosk.settings'>;
}) {
  const r = check.ratio == null ? '—' : check.ratio.toFixed(2);
  const minN = String(WCAG.AA_NORMAL);
  const minL = String(WCAG.AA_LARGE);
  return (
    <div className='space-y-2'>
      <Label htmlFor={inputId}>{label}</Label>
      <div className='flex items-center gap-2'>
        <Input
          id={inputId}
          type='color'
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className='h-10 w-12 cursor-pointer p-1'
        />
        <Input
          type='text'
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className='flex-1'
          placeholder={textPlaceholder}
        />
      </div>
      <p
        className={
          check.passNormal
            ? 'text-muted-foreground text-xs'
            : 'text-destructive text-xs font-medium'
        }
      >
        {check.passNormal
          ? t('contrast_body_ok', {
              label: surfaceName,
              ratio: r,
              min: minN
            })
          : t('contrast_body_fail', {
              label: surfaceName,
              ratio: r,
              min: minN
            })}
      </p>
      <p
        className={
          check.passLarge
            ? check.passNormal
              ? 'text-muted-foreground text-xs'
              : 'text-xs font-medium text-amber-600 dark:text-amber-500'
            : 'text-destructive text-xs font-medium'
        }
      >
        {check.passLarge
          ? check.passNormal
            ? t('contrast_large_ok', { minLarge: minL })
            : t('contrast_large_headings_only', {
                ratio: r,
                minLarge: minL
              })
          : t('contrast_large_fail', { minLarge: minL })}
      </p>
    </div>
  );
}

interface KioskSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  /** Unit display name for placeholder (header label default). */
  unitName?: string;
  currentConfig?: UnitConfig | null;
  onLock: () => void;
  isLocked: boolean;
  onUnlock: () => void;
  /** Whether the last unit load succeeded (data present). */
  hasUnit: boolean;
  unitQueryError: boolean;
  unitPending: boolean;
}

export function KioskSettingsSheet({
  isOpen,
  onClose,
  unitId,
  unitName = '',
  currentConfig,
  onLock,
  isLocked,
  onUnlock,
  hasUnit,
  unitQueryError,
  unitPending
}: KioskSettingsSheetProps) {
  const t = useTranslations('kiosk.settings');

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side='right'
        className='w-full overflow-y-auto sm:w-[600px] sm:max-w-[800px] sm:px-12'
      >
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>

        {isOpen && (
          <KioskSettingsForm
            isOpen={isOpen}
            unitId={unitId}
            unitName={unitName}
            currentConfig={currentConfig}
            onClose={onClose}
            onLock={onLock}
            isLocked={isLocked}
            onUnlock={onUnlock}
            hasUnit={hasUnit}
            unitQueryError={unitQueryError}
            unitPending={unitPending}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function KioskSettingsForm({
  isOpen,
  unitId,
  unitName,
  currentConfig,
  onClose,
  onLock,
  isLocked,
  onUnlock,
  hasUnit,
  unitQueryError,
  unitPending
}: {
  isOpen: boolean;
  unitId: string;
  unitName: string;
  currentConfig?: UnitConfig | null;
  onClose: () => void;
  onLock: () => void;
  isLocked: boolean;
  onUnlock: () => void;
  hasUnit: boolean;
  unitQueryError: boolean;
  unitPending: boolean;
}) {
  const t = useTranslations('kiosk.settings');
  const tAdmin = useTranslations('admin.kiosk_settings');
  const patchKioskMutation = usePatchKioskConfig();

  const k0 = currentConfig?.kiosk;

  const [showHeader, setShowHeader] = useState(
    currentConfig?.kiosk?.showHeader !== false
  );
  const [showFooter, setShowFooter] = useState(
    currentConfig?.kiosk?.showFooter !== false
  );
  const inferPrinterConnection = (): 'network' | 'system' => {
    const k = currentConfig?.kiosk;
    if (
      k?.printerConnection === 'system' ||
      k?.printerConnection === 'network'
    ) {
      return k.printerConnection;
    }
    if (k?.systemPrinterName?.trim()) {
      return 'system';
    }
    return 'network';
  };
  const [printerConnection, setPrinterConnection] = useState<
    'network' | 'system'
  >(inferPrinterConnection);
  const [systemPrinterName, setSystemPrinterName] = useState(
    currentConfig?.kiosk?.systemPrinterName || ''
  );
  const [printerIp, setPrinterIp] = useState(
    currentConfig?.kiosk?.printerIp || ''
  );
  const [printerPort, setPrinterPort] = useState(
    currentConfig?.kiosk?.printerPort || '9100'
  );
  const [printerType, setPrinterType] = useState(
    currentConfig?.kiosk?.printerType || 'receipt'
  );
  const [isPrintEnabled, setIsPrintEnabled] = useState(
    currentConfig?.kiosk?.isPrintEnabled !== false
  );
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [logoUrl, setLogoUrl] = useState(currentConfig?.kiosk?.logoUrl || '');
  const [printerLogoUrl, setPrinterLogoUrl] = useState(
    currentConfig?.kiosk?.printerLogoUrl || ''
  );
  const {
    showUnitInHeader,
    setShowUnitInHeader,
    kioskUnitLabelText,
    setKioskUnitLabelText,
    headerKioskSaveFields
  } = useKioskHeaderFields(currentConfig?.kiosk ?? undefined);

  const [welcomeTitle, setWelcomeTitle] = useState(
    (k0 as KioskConfig | undefined)?.welcomeTitle || ''
  );
  const [welcomeSubtitle, setWelcomeSubtitle] = useState(
    (k0 as KioskConfig | undefined)?.welcomeSubtitle || ''
  );
  const [headerText, setHeaderText] = useState(
    (k0 as KioskConfig | undefined)?.headerText || ''
  );
  const [footerText, setFooterText] = useState(
    (k0 as KioskConfig | undefined)?.footerText || ''
  );
  const [feedbackUrl, setFeedbackUrl] = useState(
    (k0 as KioskConfig | undefined)?.feedbackUrl || ''
  );
  const [isPreRegistrationEnabled, setIsPreRegistrationEnabled] = useState(
    (k0 as KioskConfig | undefined)?.isPreRegistrationEnabled ?? false
  );
  const [isAppointmentCheckinEnabled, setIsAppointmentCheckinEnabled] =
    useState(
      (k0 as KioskConfig | undefined)?.isAppointmentCheckinEnabled ??
        (k0 as KioskConfig | undefined)?.isPreRegistrationEnabled ??
        false
    );
  const [isAppointmentPhoneLookupEnabled, setIsAppointmentPhoneLookupEnabled] =
    useState(
      (k0 as KioskConfig | undefined)?.isAppointmentPhoneLookupEnabled !== false
    );
  const [serialBaud, setSerialBaud] = useState(9600);
  const [serialPath, setSerialPath] = useState('');
  const [serialList, setSerialList] = useState<{ path: string }[]>([]);
  const [serialChal, setSerialChal] = useState<string | null>(null);
  const [isCustomColorsEnabled, setIsCustomColorsEnabled] = useState(
    (k0 as KioskConfig | undefined)?.isCustomColorsEnabled || false
  );
  const [headerColor, setHeaderColor] = useState(
    (k0 as KioskConfig | undefined)?.headerColor || '#ffffff'
  );
  const [bodyColor, setBodyColor] = useState(
    (k0 as KioskConfig | undefined)?.bodyColor || '#f3f4f6'
  );
  const [serviceGridColor, setServiceGridColor] = useState(
    (k0 as KioskConfig | undefined)?.serviceGridColor || '#ffffff'
  );
  const [sessionIdleBeforeWarningSec, setSessionIdleBeforeWarningSec] =
    useState(
      (k0 as KioskConfig | undefined)?.sessionIdleBeforeWarningSec ??
        DEFAULT_IDLE_WARNING_SEC
    );
  const [sessionIdleCountdownSec, setSessionIdleCountdownSec] = useState(
    (k0 as KioskConfig | undefined)?.sessionIdleCountdownSec ??
      DEFAULT_IDLE_COUNTDOWN_SEC
  );
  const [visitorSmsAfterTicket, setVisitorSmsAfterTicket] = useState(
    (k0 as KioskConfig | undefined)?.visitorSmsAfterTicket !== false
  );
  const [idOcrEnabled, setIdOcrEnabled] = useState(
    Boolean((k0 as KioskConfig | undefined)?.idOcrEnabled)
  );
  const [idOcrPreferNative, setIdOcrPreferNative] = useState(
    (k0 as KioskConfig | undefined)?.idOcrPreferNative !== false
  );
  const [idOcrWedgeMrz, setIdOcrWedgeMrz] = useState(
    (k0 as KioskConfig | undefined)?.idOcrWedgeMrz !== false
  );
  const [idOcrWedgeRuDriverLicense, setIdOcrWedgeRuDriverLicense] = useState(
    (k0 as KioskConfig | undefined)?.idOcrWedgeRuDriverLicense !== false
  );
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(
    Boolean((k0 as KioskConfig | undefined)?.offlineModeEnabled)
  );

  const [appVersionLabel, setAppVersionLabel] = useState<string>('');
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  const refreshOnline = useCallback(() => {
    setBrowserOnline(
      typeof navigator === 'undefined' ? true : navigator.onLine
    );
  }, []);

  useEffect(() => {
    window.addEventListener('online', refreshOnline);
    window.addEventListener('offline', refreshOnline);
    return () => {
      window.removeEventListener('online', refreshOnline);
      window.removeEventListener('offline', refreshOnline);
    };
  }, [refreshOnline]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!isTauriKiosk()) {
      setAppVersionLabel(t('info_version_web'));
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const v = await getVersion();
        if (!cancel) {
          setAppVersionLabel(v);
        }
      } catch {
        if (!cancel) {
          setAppVersionLabel('—');
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [isOpen, t]);

  useEffect(() => {
    if (!isOpen || !isTauriKiosk()) {
      return;
    }
    const p = localStorage.getItem('kioskSerialPath') || '';
    const b = Number(localStorage.getItem('kioskSerialBaud') || '9600') || 9600;
    setSerialPath(p);
    setSerialBaud(b);
    void listKioskSerialPorts()
      .then((r) =>
        setSerialList(
          (r.ports || []).map((x) => ({
            path: x.path
          }))
        )
      )
      .catch(() => {
        setSerialList([]);
      });
  }, [isOpen]);

  const connectionKey = (() => {
    if (!browserOnline) {
      return 'connection_offline' as const;
    }
    if (unitPending) {
      return 'connection_checking' as const;
    }
    if (unitQueryError) {
      return 'connection_degraded' as const;
    }
    if (hasUnit) {
      return 'connection_online' as const;
    }
    return 'connection_degraded' as const;
  })();

  const colorA11y = useMemo(
    () =>
      evaluateKioskConfigSurfaces({
        headerBackground: headerColor,
        bodyBackground: bodyColor,
        gridBackground: serviceGridColor
      }),
    [headerColor, bodyColor, serviceGridColor]
  );

  const canSaveKioskColors = !isCustomColorsEnabled || colorA11y.canSave;

  const handleSave = () => {
    if (isCustomColorsEnabled && !colorA11y.canSave) {
      toast.error(
        t('contrast_server_invalid', {
          defaultValue:
            'The selected colors do not meet 4.5:1. Adjust all three before saving.'
        })
      );
      return;
    }
    const beforeSec = Math.min(
      3600,
      Math.max(15, sessionIdleBeforeWarningSec || DEFAULT_IDLE_WARNING_SEC)
    );
    const countSec = Math.min(
      300,
      Math.max(5, sessionIdleCountdownSec || DEFAULT_IDLE_COUNTDOWN_SEC)
    );
    if (isTauriKiosk()) {
      if (serialPath.trim()) {
        localStorage.setItem('kioskSerialPath', serialPath.trim());
      } else {
        localStorage.removeItem('kioskSerialPath');
      }
      localStorage.setItem('kioskSerialBaud', String(serialBaud));
    }
    const newConfig = {
      ...currentConfig,
      kiosk: {
        ...(currentConfig?.kiosk || {}),
        showHeader,
        showFooter,
        ...headerKioskSaveFields(),
        welcomeTitle: welcomeTitle.trim() || undefined,
        welcomeSubtitle: welcomeSubtitle.trim() || undefined,
        headerText,
        footerText,
        feedbackUrl: feedbackUrl.trim() || undefined,
        isPreRegistrationEnabled,
        isAppointmentCheckinEnabled,
        isAppointmentPhoneLookupEnabled,
        isCustomColorsEnabled,
        headerColor,
        bodyColor,
        serviceGridColor,
        sessionIdleBeforeWarningSec: beforeSec,
        sessionIdleCountdownSec: countSec,
        visitorSmsAfterTicket,
        idOcrEnabled: idOcrEnabled,
        idOcrPreferNative: idOcrPreferNative,
        idOcrWedgeMrz: idOcrWedgeMrz,
        idOcrWedgeRuDriverLicense: idOcrWedgeRuDriverLicense,
        offlineModeEnabled: offlineModeEnabled,
        printerConnection,
        systemPrinterName:
          printerConnection === 'system'
            ? systemPrinterName.trim() || undefined
            : undefined,
        printerIp,
        printerPort,
        printerType,
        isPrintEnabled,
        logoUrl,
        printerLogoUrl: printerLogoUrl.trim() || undefined
      } as KioskConfig & Record<string, unknown>
    };

    patchKioskMutation.mutate(
      { id: unitId, config: newConfig as Record<string, unknown> },
      {
        onSuccess: () => {
          toast.success(t('save_success'));
          onClose();
        },
        onError: () => {
          toast.error(t('save_error'));
        }
      }
    );
  };

  const refreshPrinters = async () => {
    if (!isTauriKiosk()) {
      toast.info(
        t('test_print_desktop_only', {
          defaultValue:
            'Hardware print runs only in the QuokkaQ Kiosk desktop application.'
        })
      );
      return;
    }
    setLoadingPrinters(true);
    try {
      const { printers: list, error } = await listPrintersViaTauri();
      if (error) {
        toast.error(t('printerListError', { message: error }));
      }
      setPrinters(list);
      setSystemPrinterName((prev) => {
        if (prev.trim()) {
          return prev;
        }
        const def = list.find((p) => p.isDefault)?.name ?? list[0]?.name;
        return def ?? '';
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t('printerListError', { message }));
    } finally {
      setLoadingPrinters(false);
    }
  };

  const handleTestPrint = async () => {
    if (!isTauriKiosk()) {
      toast.info(
        t('test_print_desktop_only', {
          defaultValue:
            'Hardware print runs only in the QuokkaQ Kiosk desktop application.'
        })
      );
      return;
    }
    if (!isPrintEnabled) {
      return;
    }
    if (printerType === 'label') {
      toast.info(
        t('test_print_desktop_only', {
          defaultValue:
            'Label printer test from the desktop app is not implemented yet.'
        })
      );
      return;
    }
    try {
      let native = false;
      if (printerConnection === 'system') {
        if (!systemPrinterName.trim()) {
          toast.error(t('system_printer_required'));
          return;
        }
        native = await printKioskJob(
          'system',
          systemPrinterName.trim(),
          testPrintLines()
        );
      } else {
        if (!printerIp.trim()) {
          toast.error(t('printer_ip_required'));
          return;
        }
        native = await printKioskJob(
          'tcp',
          `${printerIp.trim()}:${printerPort.trim() || '9100'}`,
          testPrintLines()
        );
      }
      if (native) {
        toast.success(t('test_print_sent'));
      } else {
        toast.error(
          t('printerTestError', {
            message: t('test_print_target_missing', {
              defaultValue: 'Check printer IP or queue name'
            })
          })
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t('printerTestError', { message }));
    }
  };

  return (
    <>
      <div className='space-y-6 py-6'>
        <div className='bg-muted/40 space-y-2 rounded-lg border p-3 text-sm'>
          <p className='text-foreground font-medium'>
            {t('info_section_title')}
          </p>
          <div className='text-muted-foreground space-y-1.5'>
            <p>
              <span className='text-foreground font-medium'>
                {t('info_version_label')}:{' '}
              </span>
              {appVersionLabel}
            </p>
            <p>
              <span className='text-foreground font-medium'>
                {t('info_unit_label')}:{' '}
              </span>
              {unitName ? `${unitName} ` : ''}({unitId})
            </p>
            <p>
              <span className='text-foreground font-medium'>
                {t('info_connection_label')}:{' '}
              </span>
              {t(connectionKey)}
            </p>
          </div>
        </div>

        <div className='space-y-2'>
          <LogoUpload
            label={t('logo_screen')}
            hint={t('logo_screen_hint')}
            currentLogoUrl={logoUrl}
            onLogoUploaded={async (url) => {
              setLogoUrl(url);
            }}
            onLogoRemoved={async () => {
              setLogoUrl('');
            }}
          />
        </div>

        <div className='space-y-4 border-b pb-4'>
          <div className='flex items-center justify-between gap-4'>
            <div className='space-y-0.5'>
              <Label htmlFor='sheet-show-unit'>
                {t('show_unit_in_header')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t('show_unit_in_header_desc')}
              </p>
            </div>
            <Switch
              id='sheet-show-unit'
              checked={showUnitInHeader}
              onCheckedChange={setShowUnitInHeader}
            />
          </div>
          {showUnitInHeader ? (
            <div className='space-y-2'>
              <Label htmlFor='sheet-unit-label'>
                {t('kiosk_unit_label_text')}
              </Label>
              <Input
                id='sheet-unit-label'
                value={kioskUnitLabelText}
                onChange={(e) => setKioskUnitLabelText(e.target.value)}
                placeholder={t('kiosk_unit_label_placeholder', {
                  unitName: unitName || '—'
                })}
              />
              <p className='text-muted-foreground text-xs'>
                {t('kiosk_unit_label_help')}
              </p>
            </div>
          ) : null}
        </div>

        <div className='space-y-4 border-b pt-1 pb-4'>
          <div className='flex items-center justify-between'>
            <Label htmlFor='sheet-custom-colors'>
              {tAdmin('use_custom_colors')}
            </Label>
            <Switch
              id='sheet-custom-colors'
              checked={isCustomColorsEnabled}
              onCheckedChange={setIsCustomColorsEnabled}
            />
          </div>
          {isCustomColorsEnabled && (
            <>
              <p className='text-muted-foreground text-xs'>
                {t('contrast_legend')}
              </p>
              {!colorA11y.canSave ? (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {t('contrast_server_invalid')}
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          )}
          {isCustomColorsEnabled && (
            <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
              <KioskSettingsColorColumn
                inputId='sheet-header-color'
                label={tAdmin('header_color')}
                textPlaceholder={tAdmin('color_placeholder')}
                color={headerColor}
                onColorChange={setHeaderColor}
                check={colorA11y.checks.find((c) => c.label === 'header')!}
                surfaceName={t('contrast_label_header')}
                t={t}
              />
              <KioskSettingsColorColumn
                inputId='sheet-body-color'
                label={tAdmin('body_color')}
                textPlaceholder={tAdmin('color_placeholder')}
                color={bodyColor}
                onColorChange={setBodyColor}
                check={colorA11y.checks.find((c) => c.label === 'body')!}
                surfaceName={t('contrast_label_body')}
                t={t}
              />
              <KioskSettingsColorColumn
                inputId='sheet-grid-color'
                label={tAdmin('grid_color')}
                textPlaceholder={tAdmin('color_placeholder')}
                color={serviceGridColor}
                onColorChange={setServiceGridColor}
                check={colorA11y.checks.find((c) => c.label === 'grid')!}
                surfaceName={t('contrast_label_grid')}
                t={t}
              />
            </div>
          )}
        </div>

        <div className='space-y-3 border-b pb-4'>
          <p className='text-muted-foreground text-sm'>
            {tAdmin('welcome_section_desc')}
          </p>
          <div className='space-y-2'>
            <Label htmlFor='sheet-welcome-title'>
              {tAdmin('welcome_title')}
            </Label>
            <Input
              id='sheet-welcome-title'
              value={welcomeTitle}
              onChange={(e) => setWelcomeTitle(e.target.value)}
              placeholder={tAdmin('welcome_title_placeholder')}
            />
            <p className='text-muted-foreground text-xs'>
              {tAdmin('welcome_title_help')}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='sheet-welcome-sub'>
              {tAdmin('welcome_subtitle')}
            </Label>
            <Textarea
              id='sheet-welcome-sub'
              value={welcomeSubtitle}
              onChange={(e) => setWelcomeSubtitle(e.target.value)}
              placeholder={tAdmin('welcome_subtitle_placeholder')}
              rows={2}
            />
            <p className='text-muted-foreground text-xs'>
              {tAdmin('welcome_subtitle_help')}
            </p>
          </div>
        </div>

        <div className='space-y-3 border-b pb-4'>
          <p className='text-muted-foreground text-sm'>
            {tAdmin('ticket_text_section_desc')}
          </p>
          <div className='space-y-2'>
            <Label htmlFor='sheet-ticket-header'>
              {tAdmin('ticket_header')}
            </Label>
            <Textarea
              id='sheet-ticket-header'
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder={tAdmin('header_placeholder')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='sheet-ticket-footer'>
              {tAdmin('ticket_footer')}
            </Label>
            <Textarea
              id='sheet-ticket-footer'
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder={tAdmin('footer_placeholder')}
            />
          </div>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='sheet-feedback'>{tAdmin('feedback_url')}</Label>
          <Input
            id='sheet-feedback'
            value={feedbackUrl}
            onChange={(e) => setFeedbackUrl(e.target.value)}
            placeholder={tAdmin('feedback_url_placeholder')}
          />
          <p className='text-muted-foreground text-xs'>
            {tAdmin('feedback_url_help')}
          </p>
        </div>

        <div className='space-y-4 border-t pt-4'>
          <div className='flex items-center justify-between gap-2'>
            <div>
              <Label htmlFor='sheet-idle-warn'>
                {t('session_idle_before_label')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t('session_idle_before_hint')}
              </p>
            </div>
            <Input
              id='sheet-idle-warn'
              className='w-24'
              type='number'
              min={15}
              max={3600}
              value={sessionIdleBeforeWarningSec}
              onChange={(e) =>
                setSessionIdleBeforeWarningSec(Number(e.target.value) || 0)
              }
            />
          </div>
          <div className='flex items-center justify-between gap-2'>
            <div>
              <Label htmlFor='sheet-idle-count'>
                {t('session_idle_countdown_label')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t('session_idle_countdown_hint')}
              </p>
            </div>
            <Input
              id='sheet-idle-count'
              className='w-24'
              type='number'
              min={5}
              max={300}
              value={sessionIdleCountdownSec}
              onChange={(e) =>
                setSessionIdleCountdownSec(Number(e.target.value) || 0)
              }
            />
          </div>
        </div>

        <div className='border-t pt-4'>
          <div className='flex items-center justify-between gap-2'>
            <div>
              <Label htmlFor='sheet-visitor-sms'>
                {t('visitor_sms_after_ticket')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t('visitor_sms_after_ticket_hint')}
              </p>
            </div>
            <Switch
              id='sheet-visitor-sms'
              checked={visitorSmsAfterTicket}
              onCheckedChange={setVisitorSmsAfterTicket}
            />
          </div>
        </div>

        <div className='border-t pt-4'>
          <div className='flex items-center justify-between gap-2'>
            <div>
              <Label htmlFor='sheet-id-ocr'>{tAdmin('id_ocr_enable')}</Label>
              <p className='text-muted-foreground text-sm'>
                {tAdmin('id_ocr_enable_hint')}
              </p>
            </div>
            <Switch
              id='sheet-id-ocr'
              checked={idOcrEnabled}
              onCheckedChange={setIdOcrEnabled}
            />
          </div>
        </div>

        {idOcrEnabled && isTauriKiosk() ? (
          <div className='flex items-center justify-between border-t pt-2'>
            <div>
              <Label htmlFor='sheet-id-ocr-native'>
                {tAdmin('id_ocr_prefer_native')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {tAdmin('id_ocr_prefer_native_hint')}
              </p>
            </div>
            <Switch
              id='sheet-id-ocr-native'
              checked={idOcrPreferNative}
              onCheckedChange={setIdOcrPreferNative}
            />
          </div>
        ) : null}

        {idOcrEnabled ? (
          <div className='space-y-2 border-t pt-2'>
            <div className='flex items-center justify-between gap-2'>
              <div>
                <Label htmlFor='sheet-id-ocr-mrz'>
                  {tAdmin('id_ocr_wedge_mrz')}
                </Label>
                <p className='text-muted-foreground text-sm'>
                  {tAdmin('id_ocr_wedge_mrz_hint')}
                </p>
              </div>
              <Switch
                id='sheet-id-ocr-mrz'
                checked={idOcrWedgeMrz}
                onCheckedChange={setIdOcrWedgeMrz}
              />
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div>
                <Label htmlFor='sheet-id-ocr-ru'>
                  {tAdmin('id_ocr_wedge_ru')}
                </Label>
                <p className='text-muted-foreground text-sm'>
                  {tAdmin('id_ocr_wedge_ru_hint')}
                </p>
              </div>
              <Switch
                id='sheet-id-ocr-ru'
                checked={idOcrWedgeRuDriverLicense}
                onCheckedChange={setIdOcrWedgeRuDriverLicense}
              />
            </div>
          </div>
        ) : null}

        <div className='border-t pt-4'>
          <div className='flex items-center justify-between gap-2'>
            <div>
              <Label htmlFor='sheet-offline'>
                {tAdmin('offline_mode_enable')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {tAdmin('offline_mode_hint')}
              </p>
            </div>
            <Switch
              id='sheet-offline'
              checked={offlineModeEnabled}
              onCheckedChange={setOfflineModeEnabled}
            />
          </div>
        </div>

        <div className='flex items-center justify-between border-t pt-4'>
          <div>
            <Label htmlFor='sheet-header-sw'>{t('show_header')}</Label>
            <p className='text-muted-foreground text-sm'>
              {t('show_header_desc')}
            </p>
          </div>
          <Switch
            id='sheet-header-sw'
            checked={showHeader}
            onCheckedChange={setShowHeader}
          />
        </div>

        <div className='flex items-center justify-between'>
          <div>
            <Label htmlFor='sheet-footer-sw'>{t('show_footer')}</Label>
            <p className='text-muted-foreground text-sm'>
              {t('show_footer_desc')}
            </p>
          </div>
          <Switch
            id='sheet-footer-sw'
            checked={showFooter}
            onCheckedChange={setShowFooter}
          />
        </div>

        <div className='flex items-center justify-between border-t pt-2'>
          <div>
            <Label htmlFor='sheet-pre-reg'>
              {tAdmin('enable_pre_registration')}
            </Label>
            <p className='text-muted-foreground text-xs'>
              {t('identification_per_service_note')}
            </p>
          </div>
          <Switch
            id='sheet-pre-reg'
            checked={isPreRegistrationEnabled}
            onCheckedChange={setIsPreRegistrationEnabled}
          />
        </div>

        <div className='flex items-center justify-between'>
          <div>
            <Label htmlFor='sheet-appt'>
              {t('enable_appointment_checkin')}
            </Label>
            <p className='text-muted-foreground text-xs'>
              {t('enable_appointment_checkin_hint')}
            </p>
          </div>
          <Switch
            id='sheet-appt'
            checked={isAppointmentCheckinEnabled}
            onCheckedChange={setIsAppointmentCheckinEnabled}
          />
        </div>

        <div className='flex items-center justify-between'>
          <div>
            <Label htmlFor='sheet-phone'>{t('enable_phone_lookup')}</Label>
            <p className='text-muted-foreground text-xs'>
              {t('enable_phone_lookup_hint')}
            </p>
          </div>
          <Switch
            id='sheet-phone'
            checked={isAppointmentPhoneLookupEnabled}
            onCheckedChange={setIsAppointmentPhoneLookupEnabled}
            disabled={!isAppointmentCheckinEnabled}
          />
        </div>

        {isTauriKiosk() && (
          <div className='space-y-2 border-t pt-2'>
            <p className='text-sm font-medium'>{t('serial_scanner')}</p>
            <p className='text-muted-foreground text-xs'>{t('serial_hint')}</p>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <select
                className='border-input bg-background min-h-11 w-full flex-1 rounded-md border px-2 text-sm'
                value={serialPath}
                onChange={(e) => setSerialPath(e.target.value)}
              >
                <option value=''>{t('serial_pick_port')}</option>
                {serialList.map((s) => (
                  <option key={s.path} value={s.path}>
                    {s.path}
                  </option>
                ))}
              </select>
              <Input
                type='number'
                className='w-28'
                value={serialBaud}
                onChange={(e) => setSerialBaud(Number(e.target.value) || 9600)}
              />
            </div>
            {serialChal ? (
              <p className='text-center font-mono text-sm'>{serialChal}</p>
            ) : null}
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                size='sm'
                variant='secondary'
                onClick={async () => {
                  if (!isTauriKiosk()) {
                    return;
                  }
                  const r = await testKioskSerialPort({
                    port: serialPath.trim() || serialList[0]?.path || '',
                    baud: serialBaud
                  });
                  if (r.challenge) {
                    setSerialChal(r.challenge);
                    toast.info(
                      t('serial_scan_test_label', { code: r.challenge })
                    );
                  }
                  if (r.ok) {
                    toast.success(t('serial_test_ok'));
                    setSerialChal(null);
                  } else {
                    toast.error(r.message || r.read || t('serial_test_fail'));
                  }
                }}
              >
                {t('serial_test')}
              </Button>
            </div>
          </div>
        )}

        <div className='border-t pt-2'>
          <p className='mb-1 text-sm font-medium'>
            {t('appointments_staff_link')}
          </p>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Button type='button' asChild size='sm' variant='secondary'>
              <Link href={`/pre-registrations/${unitId}`}>
                {t('open_appointments_admin')}
              </Link>
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={async () => {
                try {
                  const r = await preRegistrationsApi.bulkRemind(unitId);
                  toast.success(t('bulk_remind_toast', { n: r.sent }));
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : t('bulk_remind_fail')
                  );
                }
              }}
            >
              {t('bulk_remind_today')}
            </Button>
          </div>
        </div>

        <div className='flex items-center justify-between'>
          <div>
            <Label htmlFor='sheet-print'>{t('enable_printing')}</Label>
            <p className='text-muted-foreground text-sm'>
              {t('enable_printing_desc')}
            </p>
          </div>
          <Switch
            id='sheet-print'
            checked={isPrintEnabled}
            onCheckedChange={setIsPrintEnabled}
          />
        </div>

        {isPrintEnabled && (
          <>
            <div className='space-y-2 border-b pb-4'>
              <LogoUpload
                label={t('printer_logo_upload')}
                hint={t('printer_logo_upload_hint')}
                currentLogoUrl={printerLogoUrl}
                onLogoUploaded={async (url) => {
                  setPrinterLogoUrl(url);
                }}
                onLogoRemoved={async () => {
                  setPrinterLogoUrl('');
                }}
                uploadTarget='printer'
                allowBmpByExtension
                accept='image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/bmp,.bmp,.dib'
              />
            </div>

            <div className='space-y-2'>
              <Label>{t('printer_connection')}</Label>
              <div className='grid w-full grid-cols-2 gap-2'>
                <Button
                  type='button'
                  variant={
                    printerConnection === 'network' ? 'default' : 'outline'
                  }
                  onClick={() => setPrinterConnection('network')}
                  className='min-w-0'
                >
                  {t('printer_connection_network')}
                </Button>
                <Button
                  type='button'
                  variant={
                    printerConnection === 'system' ? 'default' : 'outline'
                  }
                  onClick={() => setPrinterConnection('system')}
                  className='min-w-0'
                >
                  {t('printer_connection_system')}
                </Button>
              </div>
              <p className='text-muted-foreground text-sm'>
                {t('printer_connection_hint')}
              </p>
            </div>

            {printerConnection === 'network' ? (
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
                <div className='space-y-2 sm:col-span-2'>
                  <Label>{t('printer_ip')}</Label>
                  <Input
                    value={printerIp}
                    onChange={(e) => setPrinterIp(e.target.value)}
                    placeholder='192.168.1.100'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>{t('printer_port')}</Label>
                  <Input
                    value={printerPort}
                    onChange={(e) => setPrinterPort(e.target.value)}
                    placeholder='9100'
                  />
                </div>
              </div>
            ) : (
              <div className='space-y-2'>
                <Label>{t('system_printer')}</Label>
                <div className='flex gap-2'>
                  <Input
                    list='kiosk-system-printer-datalist'
                    value={systemPrinterName}
                    onChange={(e) => setSystemPrinterName(e.target.value)}
                    placeholder={t('system_printer_placeholder')}
                    className='min-w-0 flex-1'
                  />
                  <datalist id='kiosk-system-printer-datalist'>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name} />
                    ))}
                  </datalist>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    className='kiosk-touch-min h-12 min-w-12 shrink-0'
                    onClick={() => void refreshPrinters()}
                    disabled={loadingPrinters}
                    title={t('refresh_printers')}
                  >
                    <RefreshCw
                      className={`kiosk-a11y-respect-motion size-4 ${
                        loadingPrinters ? 'animate-spin' : ''
                      }`}
                    />
                  </Button>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t('system_printer_hint')}
                </p>
              </div>
            )}

            <div className='space-y-2'>
              <Label>{t('printer_type')}</Label>
              <div className='grid w-full grid-cols-2 gap-2'>
                <Button
                  type='button'
                  variant={printerType === 'receipt' ? 'default' : 'outline'}
                  onClick={() => setPrinterType('receipt')}
                  className='min-w-0'
                >
                  {t('printer_type_receipt')}
                </Button>
                <Button
                  type='button'
                  variant={printerType === 'label' ? 'default' : 'outline'}
                  onClick={() => setPrinterType('label')}
                  className='min-w-0'
                >
                  {t('printer_type_label')}
                </Button>
              </div>
            </div>
          </>
        )}

        <Button
          type='button'
          variant='outline'
          className='w-full'
          onClick={() => void handleTestPrint()}
          disabled={
            printerType === 'label' || (!isTauriKiosk() && !isPrintEnabled)
          }
        >
          {t('test_print')}
        </Button>

        <div className='border-t pt-4'>
          {isLocked ? (
            <Button
              variant='default'
              className='kiosk-touch-min flex min-h-12 w-full items-center gap-2'
              onClick={onUnlock}
            >
              <Lock className='h-4 w-4' />
              {t('unlock_kiosk', { defaultValue: 'Unlock Kiosk' })}
            </Button>
          ) : (
            <Button
              variant='destructive'
              className='kiosk-touch-min flex min-h-12 w-full items-center gap-2'
              onClick={onLock}
            >
              <Lock className='h-4 w-4' />
              {t('lock_kiosk')}
            </Button>
          )}
        </div>
      </div>

      <SheetFooter>
        <Button
          className='kiosk-touch-min min-h-12 w-full'
          onClick={handleSave}
          disabled={patchKioskMutation.isPending || !canSaveKioskColors}
        >
          {patchKioskMutation.isPending ? t('saving') : t('save_changes')}
        </Button>
      </SheetFooter>
    </>
  );
}
