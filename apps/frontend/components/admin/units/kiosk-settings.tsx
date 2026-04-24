'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { usePatchKioskConfig } from '@/lib/hooks';
import { toast } from 'sonner';
import { LogoUpload } from '@/components/ui/logo-upload';
import type {
  KioskAttractInactivityMode,
  KioskConfig
} from '@quokkaq/shared-types';
import { useKioskHeaderFields } from '@/hooks/use-kiosk-header-fields';
import { isTauriKiosk, printKioskJob, testPrintLines } from '@/lib/kiosk-print';
import { KIOSK_FEEDBACK_URL_EXAMPLE } from '@/lib/kiosk-feedback-url';
import { KioskAttractSignageAdminBlock } from '@/components/admin/units/kiosk-attract-signage-admin';
import { Link } from '@/src/i18n/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { KioskAttractSignageMode } from '@/lib/kiosk-attract-config';

interface KioskSettingsProps {
  unitId: string;
  /** Default header label when kiosk unit label is empty. */
  unitName: string;
  currentConfig: Record<string, unknown>;
  /**
   * Branch (subdivision) id used to list playlists and media for kiosk attract overrides.
   * For a service zone, pass the parent subdivision id; otherwise the unit id.
   */
  branchUnitIdForSignage: string;
}

function attractSignageInit(k: KioskConfig): {
  mode: KioskAttractSignageMode;
  playlistId: string;
  materialIds: string[];
  slideDurationSec: number | '';
} {
  if (k.kioskAttractSignageMode === 'materials') {
    return {
      mode: 'materials',
      playlistId: k.kioskAttractPlaylistId?.trim() ?? '',
      materialIds: [...(k.kioskAttractActiveMaterialIds ?? [])],
      slideDurationSec: k.kioskAttractSlideDurationSec ?? ''
    };
  }
  if (
    k.kioskAttractSignageMode === 'playlist' &&
    (k.kioskAttractPlaylistId?.trim() ?? '') !== ''
  ) {
    return {
      mode: 'playlist',
      playlistId: k.kioskAttractPlaylistId?.trim() ?? '',
      materialIds: [...(k.kioskAttractActiveMaterialIds ?? [])],
      slideDurationSec: k.kioskAttractSlideDurationSec ?? ''
    };
  }
  return {
    mode: 'inherit',
    playlistId: k.kioskAttractPlaylistId?.trim() ?? '',
    materialIds: [...(k.kioskAttractActiveMaterialIds ?? [])],
    slideDurationSec: k.kioskAttractSlideDurationSec ?? ''
  };
}

export function KioskSettings({
  unitId,
  unitName,
  currentConfig,
  branchUnitIdForSignage
}: KioskSettingsProps) {
  const t = useTranslations('admin.kiosk_settings');
  const patchKioskMutation = usePatchKioskConfig();

  const typedConfig = currentConfig as { kiosk?: KioskConfig };
  const kioskConfig = typedConfig.kiosk || {};

  const {
    showUnitInHeader,
    setShowUnitInHeader,
    kioskUnitLabelText,
    setKioskUnitLabelText,
    headerKioskSaveFields
  } = useKioskHeaderFields(kioskConfig);

  const [pin, setPin] = useState(kioskConfig.pin || '');
  const [welcomeTitle, setWelcomeTitle] = useState(
    kioskConfig.welcomeTitle || ''
  );
  const [welcomeSubtitle, setWelcomeSubtitle] = useState(
    kioskConfig.welcomeSubtitle || ''
  );
  const [headerText, setHeaderText] = useState(kioskConfig.headerText || '');
  const [footerText, setFooterText] = useState(kioskConfig.footerText || '');
  const inferConn = (): 'network' | 'system' => {
    if (
      kioskConfig.printerConnection === 'system' ||
      kioskConfig.printerConnection === 'network'
    ) {
      return kioskConfig.printerConnection;
    }
    if (kioskConfig.systemPrinterName?.trim()) {
      return 'system';
    }
    return 'network';
  };
  const [printerConnection, setPrinterConnection] = useState(inferConn);
  const [systemPrinterName, setSystemPrinterName] = useState(
    kioskConfig.systemPrinterName || ''
  );
  const [printerIp, setPrinterIp] = useState(kioskConfig.printerIp || '');
  const [printerPort, setPrinterPort] = useState(
    kioskConfig.printerPort || '9100'
  );
  const [printerType, setPrinterType] = useState(
    kioskConfig.printerType || 'receipt'
  );
  const [isPrintEnabled, setIsPrintEnabled] = useState(
    kioskConfig.isPrintEnabled ?? true
  );
  const [isAlwaysPrintTicket, setIsAlwaysPrintTicket] = useState(
    kioskConfig.isAlwaysPrintTicket !== false
  );
  const [logoUrl, setLogoUrl] = useState(kioskConfig.logoUrl || '');
  const [printerLogoUrl, setPrinterLogoUrl] = useState(
    kioskConfig.printerLogoUrl || ''
  );
  const [feedbackUrl, setFeedbackUrl] = useState(kioskConfig.feedbackUrl || '');
  const [isPreRegistrationEnabled, setIsPreRegistrationEnabled] = useState(
    kioskConfig.isPreRegistrationEnabled ?? false
  );
  const [isAppointmentCheckinEnabled, setIsAppointmentCheckinEnabled] =
    useState(
      kioskConfig.isAppointmentCheckinEnabled ??
        kioskConfig.isPreRegistrationEnabled ??
        false
    );
  const [isAppointmentPhoneLookupEnabled, setIsAppointmentPhoneLookupEnabled] =
    useState(kioskConfig.isAppointmentPhoneLookupEnabled ?? true);

  // New color settings
  const [isCustomColorsEnabled, setIsCustomColorsEnabled] = useState(
    kioskConfig.isCustomColorsEnabled || false
  );
  const [headerColor, setHeaderColor] = useState(
    kioskConfig.headerColor || '#ffffff'
  );
  const [bodyColor, setBodyColor] = useState(
    kioskConfig.bodyColor || '#f3f4f6'
  ); // Default gray-100
  const [serviceGridColor, setServiceGridColor] = useState(
    kioskConfig.serviceGridColor || '#ffffff'
  );
  const [sessionIdleBeforeWarningSec, setSessionIdleBeforeWarningSec] =
    useState(kioskConfig.sessionIdleBeforeWarningSec ?? 45);
  const [sessionIdleCountdownSec, setSessionIdleCountdownSec] = useState(
    kioskConfig.sessionIdleCountdownSec ?? 15
  );
  const [kioskAttractInactivityMode, setKioskAttractInactivityMode] =
    useState<KioskAttractInactivityMode>(
      kioskConfig.kioskAttractInactivityMode ?? 'session_then_attract'
    );
  const [showAttractAfterSessionEnd, setShowAttractAfterSessionEnd] = useState(
    kioskConfig.showAttractAfterSessionEnd !== false
  );
  const [attractIdleSec, setAttractIdleSec] = useState(
    Math.min(600, Math.max(10, kioskConfig.attractIdleSec ?? 60))
  );
  const [showQueueDepthOnAttract, setShowQueueDepthOnAttract] = useState(
    kioskConfig.showQueueDepthOnAttract !== false
  );
  const [attractSignage, setAttractSignage] = useState(() =>
    attractSignageInit(kioskConfig)
  );
  const [ticketSuccessAutoCloseSec, setTicketSuccessAutoCloseSec] = useState(
    kioskConfig.ticketSuccessAutoCloseSec ?? 12
  );

  // Sync state with currentConfig when it changes - REMOVED
  // We now use a key on the component to reset state when config changes.
  // This avoids "setState in useEffect" warnings and potential loops.

  const handleSave = () => {
    if (
      attractSignage.mode === 'playlist' &&
      !attractSignage.playlistId.trim()
    ) {
      toast.error(t('attract_signage_playlist_required'));
      return;
    }
    const typedConfig = currentConfig as { kiosk?: KioskConfig };
    const beforeSec = Math.min(
      3600,
      Math.max(15, sessionIdleBeforeWarningSec || 45)
    );
    const countSec = Math.min(300, Math.max(5, sessionIdleCountdownSec || 15));
    const attractSec = Math.min(600, Math.max(10, attractIdleSec || 60));
    const ticketCloseSec = Math.min(
      120,
      Math.max(1, ticketSuccessAutoCloseSec || 12)
    );
    const newConfig = {
      ...(currentConfig || {}),
      kiosk: {
        ...(typedConfig.kiosk || {}),
        pin,
        welcomeTitle: welcomeTitle.trim() || undefined,
        welcomeSubtitle: welcomeSubtitle.trim() || undefined,
        headerText,
        footerText,
        printerConnection,
        systemPrinterName:
          printerConnection === 'system'
            ? systemPrinterName.trim() || undefined
            : undefined,
        printerIp,
        printerPort,
        printerType,
        isPrintEnabled,
        isAlwaysPrintTicket,
        logoUrl,
        printerLogoUrl: printerLogoUrl.trim() || undefined,
        ...headerKioskSaveFields(),
        feedbackUrl,
        isPreRegistrationEnabled,
        isAppointmentCheckinEnabled,
        isAppointmentPhoneLookupEnabled,
        isCustomColorsEnabled,
        headerColor,
        bodyColor,
        serviceGridColor,
        sessionIdleBeforeWarningSec: beforeSec,
        sessionIdleCountdownSec: countSec,
        kioskAttractInactivityMode,
        showAttractAfterSessionEnd,
        attractIdleSec: attractSec,
        showQueueDepthOnAttract,
        ticketSuccessAutoCloseSec: ticketCloseSec,
        kioskAttractSignageMode: attractSignage.mode,
        kioskAttractPlaylistId:
          attractSignage.mode === 'playlist' && attractSignage.playlistId.trim()
            ? attractSignage.playlistId.trim()
            : undefined,
        kioskAttractActiveMaterialIds:
          attractSignage.mode === 'materials'
            ? attractSignage.materialIds
            : undefined,
        kioskAttractSlideDurationSec:
          attractSignage.slideDurationSec === ''
            ? undefined
            : attractSignage.slideDurationSec
      }
    };

    patchKioskMutation.mutate(
      { id: unitId, config: newConfig as Record<string, unknown> },
      {
        onSuccess: () => {
          toast.success(t('save_success'));
        },
        onError: () => {
          toast.error(t('save_error'));
        }
      }
    );
  };

  const handleTestPrint = async () => {
    if (!isTauriKiosk()) {
      return;
    }
    if (printerType === 'label') {
      toast.info(t('test_print_label_unsupported'));
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
          t('printer_test_error', {
            message: t('test_print_target_missing')
          })
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t('printer_test_error', { message }));
    }
  };

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Alert>
            <Info className='h-4 w-4' />
            <AlertTitle>{t('attract_signage_info_title')}</AlertTitle>
            <AlertDescription className='text-muted-foreground'>
              {t('attract_signage_info_description')}{' '}
              <Link
                href={`/settings/units/${branchUnitIdForSignage ?? unitId}?display=content`}
                className='text-foreground font-medium underline underline-offset-2'
              >
                {t('attract_signage_info_link')}
              </Link>
            </AlertDescription>
          </Alert>
          <KioskAttractSignageAdminBlock
            branchUnitId={branchUnitIdForSignage}
            linkUnitId={unitId}
            value={attractSignage}
            onChange={setAttractSignage}
          />
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
                <Label htmlFor='admin-show-unit'>
                  {t('show_unit_in_header')}
                </Label>
                <p className='text-muted-foreground text-sm'>
                  {t('show_unit_in_header_desc')}
                </p>
              </div>
              <Switch
                id='admin-show-unit'
                checked={showUnitInHeader}
                onCheckedChange={setShowUnitInHeader}
              />
            </div>
            {showUnitInHeader ? (
              <div className='space-y-2'>
                <Label htmlFor='admin-unit-label'>
                  {t('kiosk_unit_label_text')}
                </Label>
                <Input
                  id='admin-unit-label'
                  value={kioskUnitLabelText}
                  onChange={(e) => setKioskUnitLabelText(e.target.value)}
                  placeholder={t('kiosk_unit_label_placeholder', {
                    unitName: unitName.trim() || '—'
                  })}
                />
                <p className='text-muted-foreground text-xs'>
                  {t('kiosk_unit_label_help')}
                </p>
              </div>
            ) : null}
          </div>

          {/* Color Settings Section */}
          <div className='space-y-4 border-b pt-2 pb-4'>
            <div className='flex items-center justify-between'>
              <Label htmlFor='custom-colors'>
                {t('use_custom_colors', { defaultValue: 'Use custom colors' })}
              </Label>
              <Switch
                id='custom-colors'
                checked={isCustomColorsEnabled}
                onCheckedChange={setIsCustomColorsEnabled}
              />
            </div>

            {isCustomColorsEnabled && (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                <div className='space-y-2'>
                  <Label htmlFor='header-color'>
                    {t('header_color', { defaultValue: 'Header Color' })}
                  </Label>
                  <div className='flex items-center gap-2'>
                    <Input
                      id='header-color'
                      type='color'
                      value={headerColor}
                      onChange={(e) => setHeaderColor(e.target.value)}
                      className='h-10 w-12 cursor-pointer p-1'
                    />
                    <Input
                      type='text'
                      value={headerColor}
                      onChange={(e) => setHeaderColor(e.target.value)}
                      className='flex-1'
                      placeholder={t('color_placeholder', {
                        defaultValue: '#ffffff'
                      })}
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='body-color'>
                    {t('body_color', { defaultValue: 'Body Color' })}
                  </Label>
                  <div className='flex items-center gap-2'>
                    <Input
                      id='body-color'
                      type='color'
                      value={bodyColor}
                      onChange={(e) => setBodyColor(e.target.value)}
                      className='h-10 w-12 cursor-pointer p-1'
                    />
                    <Input
                      type='text'
                      value={bodyColor}
                      onChange={(e) => setBodyColor(e.target.value)}
                      className='flex-1'
                      placeholder={t('color_placeholder', {
                        defaultValue: '#f3f4f6'
                      })}
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='grid-color'>
                    {t('grid_color', { defaultValue: 'Service Grid Color' })}
                  </Label>
                  <div className='flex items-center gap-2'>
                    <Input
                      id='grid-color'
                      type='color'
                      value={serviceGridColor}
                      onChange={(e) => setServiceGridColor(e.target.value)}
                      className='h-10 w-12 cursor-pointer p-1'
                    />
                    <Input
                      type='text'
                      value={serviceGridColor}
                      onChange={(e) => setServiceGridColor(e.target.value)}
                      className='flex-1'
                      placeholder={t('color_placeholder', {
                        defaultValue: '#ffffff'
                      })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='kiosk-pin'>{t('pin_code')}</Label>
            <Input
              id='kiosk-pin'
              type='text'
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={t('pin_code_placeholder', { defaultValue: '1234' })}
              maxLength={6}
            />
            <p className='text-muted-foreground text-xs'>{t('pin_help')}</p>
          </div>

          <div className='space-y-4 border-t pt-4'>
            <p className='text-muted-foreground text-sm'>
              {t('welcome_section_desc')}
            </p>
            <div className='space-y-2'>
              <Label htmlFor='welcome-title'>{t('welcome_title')}</Label>
              <Input
                id='welcome-title'
                value={welcomeTitle}
                onChange={(e) => setWelcomeTitle(e.target.value)}
                placeholder={t('welcome_title_placeholder')}
              />
              <p className='text-muted-foreground text-xs'>
                {t('welcome_title_help')}
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='welcome-subtitle'>{t('welcome_subtitle')}</Label>
              <Textarea
                id='welcome-subtitle'
                value={welcomeSubtitle}
                onChange={(e) => setWelcomeSubtitle(e.target.value)}
                placeholder={t('welcome_subtitle_placeholder')}
                rows={2}
              />
              <p className='text-muted-foreground text-xs'>
                {t('welcome_subtitle_help')}
              </p>
            </div>
          </div>

          <div className='space-y-4 border-t pt-4'>
            <p className='text-muted-foreground text-sm'>
              {t('ticket_text_section_desc')}
            </p>
            <div className='space-y-2'>
              <Label htmlFor='ticket-header'>{t('ticket_header')}</Label>
              <Textarea
                id='ticket-header'
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder={t('header_placeholder')}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='ticket-footer'>{t('ticket_footer')}</Label>
              <Textarea
                id='ticket-footer'
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder={t('footer_placeholder')}
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='feedback-url'>{t('feedback_url')}</Label>
            <Input
              id='feedback-url'
              value={feedbackUrl}
              onChange={(e) => setFeedbackUrl(e.target.value)}
              placeholder={KIOSK_FEEDBACK_URL_EXAMPLE}
            />
            <p className='text-muted-foreground text-xs'>
              {t('feedback_url_help')}
            </p>
          </div>

          <div className='space-y-4 border-t pt-4'>
            <div className='flex items-center justify-between'>
              <Label htmlFor='enable-printing'>{t('enable_printing')}</Label>
              <Switch
                id='enable-printing'
                checked={isPrintEnabled}
                onCheckedChange={setIsPrintEnabled}
              />
            </div>

            {isPrintEnabled && printerType === 'receipt' && (
              <div className='space-y-1 border-t border-dashed py-2'>
                <div className='flex items-center justify-between'>
                  <div>
                    <Label htmlFor='admin-always-print-ticket'>
                      {t('always_print_ticket')}
                    </Label>
                    <p className='text-muted-foreground text-xs'>
                      {t('always_print_ticket_hint')}
                    </p>
                  </div>
                  <Switch
                    id='admin-always-print-ticket'
                    checked={isAlwaysPrintTicket}
                    onCheckedChange={setIsAlwaysPrintTicket}
                  />
                </div>
              </div>
            )}

            <div className='flex items-center justify-between'>
              <Label htmlFor='enable-pre-registration'>
                {t('enable_pre_registration', {
                  defaultValue: 'Enable Pre-registration Redemption'
                })}
              </Label>
              <Switch
                id='enable-pre-registration'
                checked={isPreRegistrationEnabled}
                onCheckedChange={setIsPreRegistrationEnabled}
              />
            </div>

            <div className='space-y-1 border-t pt-3'>
              <div className='flex items-center justify-between'>
                <div>
                  <Label htmlFor='admin-appointment-checkin'>
                    {t('enable_appointment_checkin')}
                  </Label>
                  <p className='text-muted-foreground text-xs'>
                    {t('enable_appointment_checkin_hint')}
                  </p>
                </div>
                <Switch
                  id='admin-appointment-checkin'
                  checked={isAppointmentCheckinEnabled}
                  onCheckedChange={setIsAppointmentCheckinEnabled}
                />
              </div>
              <div className='flex items-center justify-between pt-1'>
                <div>
                  <Label htmlFor='admin-appointment-phone-lookup'>
                    {t('enable_appointment_phone_lookup')}
                  </Label>
                  <p className='text-muted-foreground text-xs'>
                    {t('enable_appointment_phone_lookup_hint')}
                  </p>
                </div>
                <Switch
                  id='admin-appointment-phone-lookup'
                  disabled={!isAppointmentCheckinEnabled}
                  checked={
                    isAppointmentCheckinEnabled &&
                    isAppointmentPhoneLookupEnabled
                  }
                  onCheckedChange={setIsAppointmentPhoneLookupEnabled}
                />
              </div>
            </div>

            <div className='space-y-0 border-t py-2'>
              <div className='border-b pb-3'>
                <p className='text-foreground text-sm font-medium'>
                  {t('session_and_timing_group_label')}
                </p>
                <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                  {t('session_and_timing_explain')}
                </p>
              </div>
              <div className='grid grid-cols-1 gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start'>
                <div className='min-w-0 space-y-0.5 pr-0 sm:pr-2'>
                  <Label
                    htmlFor='admin-sess-warn'
                    className='text-sm font-medium'
                  >
                    {t('session_idle_before_label')}
                  </Label>
                  <p className='text-muted-foreground text-sm leading-snug'>
                    {t('session_idle_before_hint')}
                  </p>
                </div>
                <div className='flex w-full max-w-48 min-w-0 justify-end sm:shrink-0 sm:pt-0.5'>
                  <Input
                    id='admin-sess-warn'
                    className='h-10 w-24'
                    type='number'
                    min={15}
                    max={3600}
                    value={sessionIdleBeforeWarningSec}
                    onChange={(e) =>
                      setSessionIdleBeforeWarningSec(
                        Number(e.target.value) || 0
                      )
                    }
                  />
                </div>
              </div>
              <div className='grid grid-cols-1 gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start'>
                <div className='min-w-0 space-y-0.5 pr-0 sm:pr-2'>
                  <Label
                    htmlFor='admin-sess-count'
                    className='text-sm font-medium'
                  >
                    {t('session_idle_countdown_label')}
                  </Label>
                  <p className='text-muted-foreground text-sm leading-snug'>
                    {t('session_idle_countdown_hint')}
                  </p>
                </div>
                <div className='flex w-full max-w-48 min-w-0 justify-end sm:shrink-0 sm:pt-0.5'>
                  <Input
                    id='admin-sess-count'
                    className='h-10 w-24'
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
              <p className='text-muted-foreground border-b py-3 text-sm font-medium'>
                {t('attract_section_label')}
              </p>
              <div className='grid grid-cols-1 gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start'>
                <div className='min-w-0 space-y-0.5 pr-0 sm:pr-2'>
                  <Label
                    htmlFor='kiosk-attract-mode'
                    className='text-sm font-medium'
                  >
                    {t('kiosk_attract_inactivity_mode_label')}
                  </Label>
                  <p className='text-muted-foreground text-sm leading-snug'>
                    {t('kiosk_attract_inactivity_mode_hint')}
                  </p>
                </div>
                <div className='w-full min-w-0 sm:shrink-0 sm:pt-0.5'>
                  <Select
                    value={kioskAttractInactivityMode}
                    onValueChange={(v) =>
                      setKioskAttractInactivityMode(
                        v as KioskAttractInactivityMode
                      )
                    }
                  >
                    <SelectTrigger
                      className='h-10 w-full min-w-0 sm:max-w-[12rem]'
                      id='kiosk-attract-mode'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='session_then_attract'>
                        {t('kiosk_attract_mode_session_then_attract')}
                      </SelectItem>
                      <SelectItem value='attract_only'>
                        {t('kiosk_attract_mode_attract_only')}
                      </SelectItem>
                      <SelectItem value='off'>
                        {t('kiosk_attract_mode_off')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className='grid grid-cols-1 gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start'>
                <div className='min-w-0 space-y-0.5 pr-0 sm:pr-2'>
                  <Label
                    htmlFor='kiosk-show-attract-after-session'
                    className='text-sm font-medium'
                  >
                    {t('show_attract_after_session_end_label')}
                  </Label>
                  <p className='text-muted-foreground text-sm leading-snug'>
                    {t('show_attract_after_session_end_hint')}
                  </p>
                </div>
                <div className='flex h-10 w-full max-w-48 min-w-0 items-center justify-end sm:shrink-0 sm:pt-0.5'>
                  <Switch
                    id='kiosk-show-attract-after-session'
                    disabled={
                      kioskAttractInactivityMode !== 'session_then_attract'
                    }
                    checked={showAttractAfterSessionEnd}
                    onCheckedChange={setShowAttractAfterSessionEnd}
                  />
                </div>
              </div>
              <div className='grid grid-cols-1 gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start'>
                <div className='min-w-0 space-y-0.5 pr-0 sm:pr-2'>
                  <Label
                    htmlFor='kiosk-attract-idle-sec'
                    className='text-sm font-medium'
                  >
                    {t('attract_idle_sec_label')}
                  </Label>
                  <p className='text-muted-foreground text-sm leading-snug'>
                    {t('attract_idle_sec_hint')}
                  </p>
                </div>
                <div className='flex w-full max-w-48 min-w-0 justify-end sm:shrink-0 sm:pt-0.5'>
                  <Input
                    id='kiosk-attract-idle-sec'
                    className='h-10 w-24'
                    type='number'
                    min={10}
                    max={600}
                    disabled={kioskAttractInactivityMode !== 'attract_only'}
                    value={attractIdleSec}
                    onChange={(e) =>
                      setAttractIdleSec(Number(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className='grid grid-cols-1 gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start'>
                <div className='min-w-0 space-y-0.5 pr-0 sm:pr-2'>
                  <Label
                    htmlFor='kiosk-show-queue-on-attract'
                    className='text-sm font-medium'
                  >
                    {t('show_queue_depth_on_attract_label')}
                  </Label>
                  <p className='text-muted-foreground text-sm leading-snug'>
                    {t('show_queue_depth_on_attract_hint')}
                  </p>
                </div>
                <div className='flex h-10 w-full max-w-48 min-w-0 items-center justify-end sm:shrink-0 sm:pt-0.5'>
                  <Switch
                    id='kiosk-show-queue-on-attract'
                    checked={showQueueDepthOnAttract}
                    onCheckedChange={setShowQueueDepthOnAttract}
                  />
                </div>
              </div>
              <div className='grid grid-cols-1 gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start'>
                <div className='min-w-0 space-y-0.5 pr-0 sm:pr-2'>
                  <Label
                    htmlFor='admin-ticket-success-close'
                    className='text-sm font-medium'
                  >
                    {t('ticket_success_auto_close_label')}
                  </Label>
                  <p className='text-muted-foreground text-sm leading-snug'>
                    {t('ticket_success_auto_close_hint')}
                  </p>
                </div>
                <div className='flex w-full max-w-48 min-w-0 justify-end sm:shrink-0 sm:pt-0.5'>
                  <Input
                    id='admin-ticket-success-close'
                    className='h-10 w-24'
                    type='number'
                    min={1}
                    max={120}
                    value={ticketSuccessAutoCloseSec}
                    onChange={(e) =>
                      setTicketSuccessAutoCloseSec(Number(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
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
                      className='min-w-0 break-words whitespace-normal'
                    >
                      {t('printer_connection_network')}
                    </Button>
                    <Button
                      type='button'
                      variant={
                        printerConnection === 'system' ? 'default' : 'outline'
                      }
                      onClick={() => setPrinterConnection('system')}
                      className='min-w-0 break-words whitespace-normal'
                    >
                      {t('printer_connection_system')}
                    </Button>
                  </div>
                  <p className='text-muted-foreground text-sm'>
                    {t('printer_connection_admin_hint')}
                  </p>
                </div>

                {printerConnection === 'network' ? (
                  <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
                    <div className='space-y-2 sm:col-span-2'>
                      <Label htmlFor='printer-ip'>{t('printer_ip')}</Label>
                      <Input
                        id='printer-ip'
                        value={printerIp}
                        onChange={(e) => setPrinterIp(e.target.value)}
                        placeholder={t('printer_ip_placeholder', {
                          defaultValue: '192.168.1.100'
                        })}
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='printer-port'>{t('printer_port')}</Label>
                      <Input
                        id='printer-port'
                        value={printerPort}
                        onChange={(e) => setPrinterPort(e.target.value)}
                        placeholder={t('printer_port_placeholder', {
                          defaultValue: '9100'
                        })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className='space-y-2'>
                    <Label htmlFor='system-printer-name'>
                      {t('system_printer')}
                    </Label>
                    <Input
                      id='system-printer-name'
                      value={systemPrinterName}
                      onChange={(e) => setSystemPrinterName(e.target.value)}
                      placeholder={t('system_printer_placeholder')}
                    />
                  </div>
                )}

                <div className='space-y-2'>
                  <Label>{t('printer_type')}</Label>
                  <div className='grid w-full grid-cols-2 gap-2'>
                    <Button
                      variant={
                        printerType === 'receipt' ? 'default' : 'outline'
                      }
                      onClick={() => setPrinterType('receipt')}
                      className='min-w-0 break-words whitespace-normal'
                      type='button'
                    >
                      {t('printer_type_receipt')}
                    </Button>
                    <Button
                      variant={printerType === 'label' ? 'default' : 'outline'}
                      onClick={() => setPrinterType('label')}
                      className='min-w-0 break-words whitespace-normal'
                      type='button'
                    >
                      {t('printer_type_label')}
                    </Button>
                  </div>
                </div>

                {isTauriKiosk() ? (
                  <Button
                    type='button'
                    variant='outline'
                    className='w-full'
                    onClick={() => void handleTestPrint()}
                    disabled={printerType === 'label'}
                  >
                    {t('test_print')}
                  </Button>
                ) : null}
              </>
            )}
          </div>

          <Button
            className='w-full sm:w-auto'
            onClick={handleSave}
            disabled={patchKioskMutation.isPending}
          >
            {patchKioskMutation.isPending ? t('saving') : t('save_changes')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
