'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useUnitServicesTree, useCreateTicketInUnit } from '@/lib/hooks';
import {
  ticketsApi,
  preRegistrationsApi,
  type Ticket,
  type Service
} from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ArrowLeft, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/src/i18n/navigation';
import { useLocale } from 'next-intl';
import { getLocalizedName, cn } from '@/lib/utils';
import { KIOSK_FORCED_HIGH_CONTRAST } from '@/lib/kiosk-hc-palette';
import { KioskAccessibilityToolbar } from '@/components/kiosk/kiosk-accessibility-toolbar';
import { useKioskA11y } from '@/contexts/kiosk-accessibility-context';
import { useKioskA11yAudio } from '@/hooks/use-kiosk-a11y-audio';
import { useKioskSpeech } from '@/hooks/use-kiosk-speech';
import KioskLanguageSwitcher from '@/components/KioskLanguageSwitcher';
import { useUnit } from '@/lib/hooks';
import {
  getGetUnitByIDQueryKey,
  getGetUnitsUnitIdMaterialsQueryKey
} from '@/lib/api/generated/units';
import {
  type KioskConfig,
  type KioskConfigForDeviceRuntime,
  mergeKioskWithTauriLocalDevice
} from '@quokkaq/shared-types';
import {
  ensureKioskTauriLocalMigrated,
  KIOSK_TAURI_DEVICE_CHANGED_EVENT,
  readKioskTauriLocalDevice
} from '@/lib/kiosk-tauri-device-config';
import { PinCodeModal } from '@/components/kiosk/pin-code-modal';
import { KioskSettingsSheet } from '@/components/kiosk/kiosk-settings-sheet';
import { LockScreen } from '@/components/kiosk/lock-screen';
import { PreRegRedemptionModal } from '@/components/kiosk/PreRegRedemptionModal';
import { KioskPhoneIdentificationModal } from '@/components/kiosk/kiosk-phone-identification-modal';
import { KioskTopBar } from '@/components/kiosk/kiosk-top-bar';
import { KioskWelcomeHero } from '@/components/kiosk/kiosk-welcome-hero';
import { KioskServiceTile } from '@/components/kiosk/kiosk-service-tile';
import { KioskTicketSuccessOverlay } from '@/components/kiosk/kiosk-ticket-success-overlay';
import { KioskSessionIdleBar } from '@/components/kiosk/kiosk-session-idle-bar';
import { KioskAttractScreen } from '@/components/kiosk/kiosk-attract-screen';
import {
  KioskBuildStatusBar,
  type KioskRuntimeStatus
} from '@/components/kiosk/kiosk-build-status-bar';
import {
  buildKioskTicketEscPos,
  hasKioskPrintTarget,
  isTauriKiosk,
  printReceiptBytesFromKioskConfig,
  resetDesktopPairingViaTauri
} from '@/lib/kiosk-print';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';
import { logger } from '@/lib/logger';
import { reportKioskPrinterTelemetry } from '@/lib/kiosk-printer-telemetry';
import { socketClient, type UnitETASnapshot } from '@/lib/socket';
import { getUnitDisplayName } from '@/lib/unit-display';
import { isQuotaExceededError } from '@/lib/quota-error';
import { getServiceIdentificationMode } from '@/lib/kiosk-service-identification';
import { KioskEmployeeIdFlow } from '@/components/kiosk/kiosk-employee-id-flow';
import {
  buildAutolayoutPageSlots,
  clampAutolayoutPageIndex,
  getAutolayoutGridDimensions,
  getAutolayoutPageCount,
  getAutolayoutPageSlice,
  isKioskServiceGridAuto,
  sortServicesForKioskAutolayout
} from '@/lib/service-grid-autolayout';
import {
  GRID_ZONE_SCOPE_NONE,
  SERVICE_GRID_CELL_COUNT,
  SERVICE_GRID_COLS,
  SERVICE_GRID_ROWS,
  isServicePlacedOnGrid,
  serviceMatchesGridZoneScope
} from '@/lib/service-grid';
import { useKioskSessionIdle } from '@/hooks/use-kiosk-session-idle';
import { useKioskAttractInactivity } from '@/hooks/use-kiosk-attract-inactivity';
import { useSignageContentSlides } from '@/hooks/use-signage-content-slides';
import {
  getSignageActivePlaylistQueryKey,
  getSignagePlaylistPublicQueryKey,
  resolveKioskSignageUnitId
} from '@/lib/signage-content-slides';
import {
  getKioskAttractMode,
  getShowAttractAfterSessionEnd,
  getAttractIdleSec,
  getShowQueueDepthOnAttract,
  resolveKioskAttractSignageMode
} from '@/lib/kiosk-attract-config';
import { useKioskPrinterPaperOutPoll } from '@/hooks/use-kiosk-printer-paper-poll';
import { KioskIdOcrDialog } from '@/components/kiosk/kiosk-id-ocr-dialog';
import { useKioskTelemetryPing } from '@/hooks/use-kiosk-telemetry-ping';
import {
  persistKioskServiceTreeSnapshot,
  persistKioskUnitSnapshot
} from '@/lib/kiosk-snapshot-cache';
import { toast } from 'sonner';

const DEFAULT_TICKET_SUCCESS_AUTOCLOSE_SEC = 12;

export default function UnitKioskPage() {
  const queryClient = useQueryClient();
  const params = useParams() as { unitId?: string };
  const unitId = params.unitId;
  const searchParams = useSearchParams();
  const [selectedServicePath, setSelectedServicePath] = useState<Service[]>([]);
  const [kioskAutolayoutPage, setKioskAutolayoutPage] = useState(0);
  const [, setMessage] = useState('');
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const createTicketMutation = useCreateTicketInUnit();
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [ticketManualPrintBusy, setTicketManualPrintBusy] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [autoCloseTimerId, setAutoCloseTimerId] =
    useState<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState<number>(
    DEFAULT_TICKET_SUCCESS_AUTOCLOSE_SEC
  );
  const [successEtaMinutes, setSuccessEtaMinutes] = useState<number | null>(
    null
  );
  const [successPeopleAhead, setSuccessPeopleAhead] = useState<number | null>(
    null
  );
  /** When true, success modal does not auto-close until SMS step is done or declined. */
  const [kioskSmsBlocking, setKioskSmsBlocking] = useState(false);
  const [kioskSmsAgreed, setKioskSmsAgreed] = useState(false);
  const [kioskSmsDigits, setKioskSmsDigits] = useState('');
  const [kioskSmsError, setKioskSmsError] = useState<string | null>(null);
  const [kioskSmsBusy, setKioskSmsBusy] = useState(false);
  const [showAttract, setShowAttract] = useState(false);
  const [unitEtaSnapshot, setUnitEtaSnapshot] =
    useState<UnitETASnapshot | null>(null);
  const isTicketModalOpenRef = useRef(false);
  const createdTicketRef = useRef<Ticket | null>(null);
  const [idOcrOpen, setIdOcrOpen] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof window === 'undefined' || navigator.onLine
  );
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const t = useTranslations('kiosk');
  const tEmployee = useTranslations('kiosk.employee_id');
  const tA11y = useTranslations('kiosk.a11y');
  const a11y = useKioskA11y();
  const kioskAudio = useKioskA11yAudio({ ttsEnabled: a11y.ttsEnabled });
  const tts = useKioskSpeech(kioskAudio);
  const { resetA11yToDefaults } = a11y;
  const { cancel: cancelKioskTts } = tts;
  const ttsKeyRef = useRef('');
  const [baseAppUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  });

  const {
    data: unit,
    isError: unitQueryError,
    isPending: unitPending
  } = useUnit(unitId ?? '', {
    enabled: Boolean(unitId),
    refetchInterval: (query) => {
      const u = query.state.data;
      return u?.operations?.kioskFrozen ? 10_000 : 120_000;
    },
    // Desktop WebView + React Query cache: always pick up fresh kiosk PIN / config.
    refetchOnMount: 'always',
    kioskReadCache: true
  });

  const serverKioskFrozen = Boolean(unit?.operations?.kioskFrozen);
  const serverK = unit?.config?.kiosk;
  const [kioskTauriDeviceBump, setKioskTauriDeviceBump] = useState(0);
  useLayoutEffect(() => {
    if (!isTauriKiosk() || !unitId) {
      return;
    }
    ensureKioskTauriLocalMigrated(unitId, serverK);
    setKioskTauriDeviceBump((b) => b + 1);
  }, [unitId, serverK]);
  useEffect(() => {
    const f = () => setKioskTauriDeviceBump((b) => b + 1);
    window.addEventListener(KIOSK_TAURI_DEVICE_CHANGED_EVENT, f);
    return () => {
      window.removeEventListener(KIOSK_TAURI_DEVICE_CHANGED_EVENT, f);
    };
  }, []);
  const kioskCfg = useMemo((): KioskConfigForDeviceRuntime | undefined => {
    // Re-merge when Tauri local device config changes (bump) or server kiosk updates.
    void kioskTauriDeviceBump;
    if (!isTauriKiosk()) {
      return (serverK ?? undefined) as KioskConfigForDeviceRuntime | undefined;
    }
    return mergeKioskWithTauriLocalDevice(
      serverK,
      readKioskTauriLocalDevice(unitId ?? '')
    ) as KioskConfigForDeviceRuntime;
  }, [serverK, unitId, kioskTauriDeviceBump]);

  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const invalidateUnitQuery = useCallback(() => {
    if (!unitId) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: getGetUnitByIDQueryKey(unitId)
    });
  }, [queryClient, unitId]);

  const [unitSlowLoad, setUnitSlowLoad] = useState(false);
  useEffect(() => {
    if (!unitPending) {
      return undefined;
    }
    const t = window.setTimeout(() => setUnitSlowLoad(true), 20000);
    return () => {
      window.clearTimeout(t);
      setUnitSlowLoad(false);
    };
  }, [unitPending]);

  const handleResetDesktopPairing = async () => {
    try {
      await resetDesktopPairingViaTauri();
    } catch (e) {
      logger.error('resetDesktopPairingViaTauri failed', { unitId, error: e });
    }
  };

  /** Subdivision id for services API and ticket creation (always the branch unit). */
  const kioskApiUnitId = useMemo(() => {
    if (!unit) return undefined;
    if (unit.kind === 'service_zone') {
      return unit.parentId ?? undefined;
    }
    return unit.id;
  }, [unit]);

  const { contentSlides, defaultImageSeconds } = useSignageContentSlides(
    kioskApiUnitId,
    unit
  );

  useKioskTelemetryPing(
    kioskApiUnitId,
    Boolean(kioskApiUnitId) && !serverKioskFrozen
  );

  useEffect(() => {
    isTicketModalOpenRef.current = isTicketModalOpen;
    createdTicketRef.current = createdTicket;
  }, [isTicketModalOpen, createdTicket]);

  useEffect(() => {
    if (!kioskApiUnitId) {
      return;
    }
    socketClient.connect(kioskApiUnitId);
    const h = (snap: UnitETASnapshot) => {
      setUnitEtaSnapshot(snap);
      const open = isTicketModalOpenRef.current;
      const ticket = createdTicketRef.current;
      if (open && ticket) {
        const row = snap.tickets?.find((x) => x.ticketId === ticket.id);
        if (row && row.estimatedWaitSeconds > 0) {
          setSuccessEtaMinutes(
            Math.max(1, Math.round(row.estimatedWaitSeconds / 60))
          );
        }
        if (row && row.queuePosition > 0) {
          setSuccessPeopleAhead(Math.max(0, row.queuePosition - 1));
        }
      }
    };
    const signageDebounce = {
      t: null as ReturnType<typeof setTimeout> | null
    };
    const onSignageFeed = () => {
      if (signageDebounce.t) {
        clearTimeout(signageDebounce.t);
      }
      signageDebounce.t = setTimeout(() => {
        signageDebounce.t = null;
        void queryClient.invalidateQueries({
          queryKey: getSignageActivePlaylistQueryKey(kioskApiUnitId)
        });
        void queryClient.invalidateQueries({
          queryKey: getGetUnitsUnitIdMaterialsQueryKey(kioskApiUnitId)
        });
        const cached = queryClient.getQueryData<{
          config?: { kiosk?: KioskConfig };
        }>(getGetUnitByIDQueryKey(unitId ?? ''));
        const k = cached?.config?.kiosk;
        if (
          resolveKioskAttractSignageMode(k) === 'playlist' &&
          k?.kioskAttractPlaylistId
        ) {
          const sid = resolveKioskSignageUnitId(kioskApiUnitId, unit);
          void queryClient.invalidateQueries({
            queryKey: getSignagePlaylistPublicQueryKey(
              sid ?? '',
              k.kioskAttractPlaylistId
            )
          });
        }
        if (unitId) {
          void queryClient.invalidateQueries({
            queryKey: getGetUnitByIDQueryKey(unitId)
          });
        }
      }, 300);
    };
    socketClient.onEtaUpdate(h);
    socketClient.on('screen.content_updated', onSignageFeed);
    socketClient.on('feed.updated', onSignageFeed);
    return () => {
      if (signageDebounce.t) {
        clearTimeout(signageDebounce.t);
        signageDebounce.t = null;
      }
      socketClient.offEtaUpdate(h);
      socketClient.off('screen.content_updated', onSignageFeed);
      socketClient.off('feed.updated', onSignageFeed);
      socketClient.disconnect();
    };
  }, [kioskApiUnitId, queryClient, unit, unitId]);

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
    enabled: Boolean(kioskApiUnitId),
    kioskReadCache: true
  });

  useEffect(() => {
    if (unitId && unit) {
      persistKioskUnitSnapshot(unitId, unit);
    }
  }, [unitId, unit]);

  useEffect(() => {
    if (kioskApiUnitId && unitServicesTree) {
      persistKioskServiceTreeSnapshot(kioskApiUnitId, unitServicesTree);
    }
  }, [kioskApiUnitId, unitServicesTree]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setSelectedServicePath([]);
    });
    return () => cancelAnimationFrame(id);
  }, [kioskGridZoneScope]);

  const tryPrintTicket = async (
    ticket: Ticket,
    serviceLabel: string
  ): Promise<boolean> => {
    const kc = kioskCfg;
    if (!kc || kc.isPrintEnabled === false) {
      return false;
    }
    try {
      const ticketPageUrl = `${baseAppUrl}/${locale}/ticket/${ticket.id}`;
      const unitLabelOverride = kc.kioskUnitLabelText?.trim();
      const unitDisplayTitle =
        unitLabelOverride ||
        (unit ? getUnitDisplayName(unit, locale) : '').trim() ||
        t('kioskTitle');
      const logoForPrint =
        kc.printerLogoUrl?.trim() || kc.logoUrl?.trim() || '';
      const logoFetchUrl =
        typeof window !== 'undefined' && logoForPrint
          ? `${window.location.origin}/api/kiosk-print-logo?url=${encodeURIComponent(logoForPrint)}`
          : undefined;
      const extraBodyLines: string[] = [];
      if (
        typeof ticket.queuePosition === 'number' &&
        ticket.queuePosition > 0
      ) {
        extraBodyLines.push(
          t('ticket.receipt_queue_position', { n: ticket.queuePosition })
        );
        const ahead = Math.max(0, ticket.queuePosition - 1);
        extraBodyLines.push(t('ticket.receipt_people_ahead', { n: ahead }));
      }
      if (ticket.serviceZoneName?.trim()) {
        extraBodyLines.push(
          t('ticket.receipt_zone', { zone: ticket.serviceZoneName.trim() })
        );
      }
      const bytes = await buildKioskTicketEscPos({
        kiosk: kc,
        ticket,
        serviceLabel,
        ticketPageUrl,
        unitDisplayTitle,
        logoFetchUrl,
        extraBodyLines: extraBodyLines.length > 0 ? extraBodyLines : undefined
      });
      const ok = await printReceiptBytesFromKioskConfig(kc, bytes);
      if (!ok && kioskApiUnitId && isTauriKiosk()) {
        reportKioskPrinterTelemetry(
          kioskApiUnitId,
          'print_error',
          'Print not sent (missing target, label mode, or desktop print pipeline)'
        );
      }
      return ok;
    } catch (e) {
      console.error('Kiosk native print failed:', e);
      if (kioskApiUnitId) {
        reportKioskPrinterTelemetry(
          kioskApiUnitId,
          'print_error',
          e instanceof Error ? e.message : String(e)
        );
      }
      return false;
    }
  };
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [, setClockClicks] = useState(0);
  const [isRedemptionModalOpen, setIsRedemptionModalOpen] = useState(false);
  /** When user picks a service with identificationMode=qr — same modal as pre-reg, no deeplink. */
  const [isKioskQrIdentificationOpen, setIsKioskQrIdentificationOpen] =
    useState(false);
  const [isKioskQrCheckinDisabledOpen, setIsKioskQrCheckinDisabledOpen] =
    useState(false);
  const [kioskPrIdentModalKey, setKioskPrIdentModalKey] = useState(0);
  const [redeemModalKey, setRedeemModalKey] = useState(0);
  const [isPhoneIdentificationOpen, setIsPhoneIdentificationOpen] =
    useState(false);
  const [pendingPhoneService, setPendingPhoneService] =
    useState<Service | null>(null);
  const [phoneIdentificationError, setPhoneIdentificationError] = useState('');
  const [phoneIdentificationSessionKey, setPhoneIdentificationSessionKey] =
    useState(0);
  const [isEmployeeIdentificationOpen, setIsEmployeeIdentificationOpen] =
    useState(false);
  const [pendingEmployeeService, setPendingEmployeeService] =
    useState<Service | null>(null);
  const [employeeIdSubmode, setEmployeeIdSubmode] = useState<'badge' | 'login'>(
    'badge'
  );
  const [employeeCreateTicketError, setEmployeeCreateTicketError] =
    useState('');
  const useAutoKioskLayout = isKioskServiceGridAuto(kioskCfg);
  const attractMode = getKioskAttractMode(kioskCfg);
  const beforeIdleSec = kioskCfg?.sessionIdleBeforeWarningSec ?? 45;
  const idleCountdownSec = kioskCfg?.sessionIdleCountdownSec ?? 15;
  const idOcrBlocking =
    Boolean(unit?.operations?.kioskIdOcr && kioskCfg?.idOcrEnabled) &&
    idOcrOpen;
  const kioskNoModalBlockers = Boolean(
    unit &&
    !unitQueryError &&
    !serverKioskFrozen &&
    !isTicketModalOpen &&
    !isSettingsOpen &&
    !isLocked &&
    !isPinModalOpen &&
    !isRedemptionModalOpen &&
    !isKioskQrIdentificationOpen &&
    !isKioskQrCheckinDisabledOpen &&
    !isPhoneIdentificationOpen &&
    !isEmployeeIdentificationOpen &&
    !idOcrBlocking
  );
  const sessionIdleBaseEnabled = kioskNoModalBlockers && !showAttract;
  const sessionIdleEnabled =
    sessionIdleBaseEnabled && attractMode !== 'attract_only';
  const onIdleSessionEnd = useCallback(() => {
    setShowAttract(false);
    setSelectedServicePath([]);
    setIsPhoneIdentificationOpen(false);
    setPhoneIdentificationError('');
    setPendingPhoneService(null);
    setIsEmployeeIdentificationOpen(false);
    setPendingEmployeeService(null);
    setIsKioskQrIdentificationOpen(false);
    setIsKioskQrCheckinDisabledOpen(false);
    setIsRedemptionModalOpen(false);
    setIsPinModalOpen(false);
    setMessage('');
  }, []);
  const handleSessionIdleCountdownEnd = useCallback(() => {
    onIdleSessionEnd();
    if (
      attractMode === 'session_then_attract' &&
      getShowAttractAfterSessionEnd(kioskCfg)
    ) {
      setShowAttract(true);
    }
  }, [attractMode, kioskCfg, onIdleSessionEnd]);
  const {
    showWarning: showIdleWarning,
    remainingSec: idleRemainingSec,
    continueSession: continueIdleSession
  } = useKioskSessionIdle({
    enabled: sessionIdleEnabled,
    requireFirstUserActivity: true,
    beforeWarningSec: beforeIdleSec,
    countdownSec: idleCountdownSec,
    onSessionEnd: handleSessionIdleCountdownEnd
  });
  const handleAttractOnlyFire = useCallback(() => {
    onIdleSessionEnd();
    setShowAttract(true);
  }, [onIdleSessionEnd]);
  useKioskAttractInactivity({
    enabled:
      sessionIdleBaseEnabled && attractMode === 'attract_only' && !showAttract,
    requireFirstUserActivity: true,
    inactivitySec: getAttractIdleSec(kioskCfg),
    onAttract: handleAttractOnlyFire
  });
  const BOTTOM_STATUS_STRIP_PX = 40;
  const appVersion =
    (typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_APP_VERSION?.trim()) ||
    '0.0.0';
  const buildStatus: KioskRuntimeStatus = serverKioskFrozen
    ? 'frozen'
    : !browserOnline
      ? 'offline'
      : unitPending && !unit
        ? 'loading'
        : 'ok';
  const attractScreenVisible =
    showAttract && kioskNoModalBlockers && attractMode !== 'off';

  const isCustomColorsEnabled =
    unit?.config?.kiosk?.isCustomColorsEnabled || false;
  const kcKiosk = unit?.config?.kiosk;
  const useHcSurfaces = a11y.highContrast;
  const headerColor = useHcSurfaces
    ? KIOSK_FORCED_HIGH_CONTRAST.headerBackground
    : isCustomColorsEnabled
      ? kcKiosk?.headerColor || '#fff9f4'
      : '#fff9f4';
  const bodyColor = useHcSurfaces
    ? KIOSK_FORCED_HIGH_CONTRAST.bodyBackground
    : isCustomColorsEnabled
      ? kcKiosk?.bodyColor || '#fef8f3'
      : '#fef8f3';
  const serviceGridColor = useHcSurfaces
    ? KIOSK_FORCED_HIGH_CONTRAST.serviceGridBackground
    : isCustomColorsEnabled
      ? kcKiosk?.serviceGridColor || '#f2ebe6'
      : '#f2ebe6';

  const successTicketServiceLabel = useMemo(() => {
    if (!createdTicket) {
      return '';
    }
    const s = unitServicesTree?.find((x) => x.id === createdTicket.serviceId);
    if (!s) {
      return '';
    }
    return getLocalizedName(s.name, s.nameRu || '', s.nameEn || '', locale);
  }, [createdTicket, unitServicesTree, locale]);

  const kioskCanPrint = useMemo(
    () => hasKioskPrintTarget(kioskCfg),
    [kioskCfg]
  );
  const showTicketManualPrintAction =
    isTauriKiosk() && kioskCanPrint && kioskCfg?.isAlwaysPrintTicket === false;

  const ticketSuccessAutoCloseSec = useMemo(
    () =>
      Math.min(
        120,
        Math.max(
          1,
          kioskCfg?.ticketSuccessAutoCloseSec ??
            DEFAULT_TICKET_SUCCESS_AUTOCLOSE_SEC
        )
      ),
    [kioskCfg?.ticketSuccessAutoCloseSec]
  );
  const appointmentCheckinEnabled = Boolean(
    kioskCfg?.isAppointmentCheckinEnabled ?? kioskCfg?.isPreRegistrationEnabled
  );
  const showPhoneForAppointment =
    (kioskCfg?.isAppointmentPhoneLookupEnabled ?? true) &&
    appointmentCheckinEnabled;
  const [deeplinkPrCode, setDeeplinkPrCode] = useState<string | undefined>(
    undefined
  );
  const [redeemAutoFromDeeplink, setRedeemAutoFromDeeplink] = useState(false);

  useEffect(() => {
    const uid = kioskApiUnitId ?? unitId;
    if (!uid) {
      return;
    }
    const raw = (searchParams.get('prCode') || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (raw.length === 6) {
      setDeeplinkPrCode(raw);
      if (appointmentCheckinEnabled) {
        setRedeemAutoFromDeeplink(true);
        setRedeemModalKey((k) => k + 1);
        setIsRedemptionModalOpen(true);
      }
      return;
    }
    const prToken = searchParams.get('prToken')?.trim();
    if (prToken) {
      void preRegistrationsApi
        .resolvePrToken(uid, prToken)
        .then((r) => {
          const c = (r.code || '').replace(/\D/g, '').slice(0, 6);
          if (c) {
            setDeeplinkPrCode(c);
          }
          if (appointmentCheckinEnabled) {
            setRedeemAutoFromDeeplink(true);
            setRedeemModalKey((k) => k + 1);
            setIsRedemptionModalOpen(true);
          }
        })
        .catch(() => {
          // invalid token or server HMAC not configured
        });
    }
  }, [searchParams, kioskApiUnitId, unitId, appointmentCheckinEnabled]);

  const paperOutPollEnabled = Boolean(
    kioskApiUnitId &&
    !unitQueryError &&
    !serverKioskFrozen &&
    !isTicketModalOpen &&
    !isSettingsOpen &&
    !isLocked &&
    !isPinModalOpen &&
    !isRedemptionModalOpen &&
    !isKioskQrIdentificationOpen &&
    !isKioskQrCheckinDisabledOpen &&
    !isPhoneIdentificationOpen &&
    !isEmployeeIdentificationOpen
  );
  useKioskPrinterPaperOutPoll({
    unitId: kioskApiUnitId,
    enabled: paperOutPollEnabled,
    kiosk: kioskCfg
  });
  const showTicketHeader = kioskCfg?.showHeader !== false;
  const showTicketFooter = kioskCfg?.showFooter !== false;

  const showUnitInHeader = kioskCfg?.showUnitInHeader !== false;
  const unitLabelOverride = kioskCfg?.kioskUnitLabelText?.trim();
  const resolvedHeaderUnitTitle =
    unitLabelOverride ||
    (unit ? getUnitDisplayName(unit, locale) : '').trim() ||
    t('kioskTitle');

  const kioskHeaderPillClass = cn(
    'kiosk-touch-min h-12 min-w-[3.5rem] rounded-full border-0 px-4 text-base font-semibold shadow-sm',
    useHcSurfaces
      ? 'bg-white/12 text-white hover:bg-white/20'
      : 'bg-kiosk-border/40 text-kiosk-ink hover:bg-kiosk-border/55'
  );

  const showKioskIdOcr = Boolean(
    unit?.operations?.kioskIdOcr && kioskCfg?.idOcrEnabled
  );
  const showOfflineShell = Boolean(
    unit?.operations?.kioskOfflineMode && kioskCfg?.offlineModeEnabled
  );

  const topBarLeading = (
    <>
      {kioskCfg?.logoUrl ? (
        <div
          className={cn(
            'relative h-10 w-auto shrink-0 md:h-14',
            useHcSurfaces && 'rounded-lg p-1'
          )}
          style={
            useHcSurfaces
              ? { backgroundColor: KIOSK_FORCED_HIGH_CONTRAST.logoSurround }
              : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={kioskCfg.logoUrl}
            alt=''
            className='h-full w-auto object-contain'
          />
        </div>
      ) : null}
      {showUnitInHeader ? (
        <p
          className={cn(
            'min-w-0 truncate text-lg font-bold tracking-tight sm:text-xl md:text-2xl',
            useHcSurfaces ? 'text-white' : 'text-kiosk-ink'
          )}
        >
          {resolvedHeaderUnitTitle}
        </p>
      ) : null}
    </>
  );

  const topBarBeforeClock = (
    <>
      {showOfflineShell ? (
        <span
          className={cn(
            'kiosk-touch-min flex h-10 max-w-[11rem] shrink-0 items-center justify-center rounded-full px-2.5 text-center text-xs font-semibold sm:max-w-none sm:px-3 sm:text-sm',
            browserOnline
              ? 'bg-emerald-600/15 text-emerald-900'
              : 'bg-amber-600/25 text-amber-950'
          )}
        >
          {browserOnline
            ? t('network.online', { defaultValue: 'Online' })
            : t('network.offline', { defaultValue: 'No network' })}
        </span>
      ) : null}
      {showKioskIdOcr ? (
        <Button
          type='button'
          variant='secondary'
          className={kioskHeaderPillClass}
          onClick={() => setIdOcrOpen(true)}
        >
          {t('id_ocr.action', { defaultValue: 'Scan document' })}
        </Button>
      ) : null}
      {appointmentCheckinEnabled ? (
        <Button
          variant='secondary'
          className={kioskHeaderPillClass}
          onClick={() => {
            setDeeplinkPrCode(undefined);
            setRedeemAutoFromDeeplink(false);
            setRedeemModalKey((k) => k + 1);
            setIsRedemptionModalOpen(true);
          }}
        >
          {t('pre_registration.cta_appointment', {
            defaultValue: 'I have an appointment'
          })}
        </Button>
      ) : null}
      <KioskLanguageSwitcher className={kioskHeaderPillClass} />
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

  useEffect(() => {
    if (!tts.canSpeak) {
      ttsKeyRef.current = '';
      tts.cancel();
    }
  }, [tts]);

  const handleA11yTileVocalize = useCallback(
    (s: Service) => {
      if (!tts.canSpeak) {
        return;
      }
      tts.speak(
        getLocalizedName(s.name, s.nameRu || '', s.nameEn || '', locale)
      );
    },
    [locale, tts]
  );

  useEffect(() => {
    if (!unit || !tts.canSpeak) {
      return;
    }
    const key = [
      isTicketModalOpen,
      createdTicket?.id,
      isServiceRoot,
      pathLeaf?.id ?? 'root',
      successEtaMinutes ?? 'x',
      successPeopleAhead ?? 'x',
      isPhoneIdentificationOpen,
      isEmployeeIdentificationOpen,
      isKioskQrIdentificationOpen
    ].join(':');
    if (key === ttsKeyRef.current) {
      return;
    }
    ttsKeyRef.current = key;
    if (isKioskQrIdentificationOpen) {
      tts.speak(tA11y('screen_qr_checkin'));
      return;
    }
    if (isPhoneIdentificationOpen) {
      tts.speak(tA11y('screen_phone'));
      return;
    }
    if (isEmployeeIdentificationOpen) {
      tts.speak(tA11y('screen_employee'));
      return;
    }
    if (isTicketModalOpen && createdTicket) {
      const parts = [
        tA11y('success_ticket', { number: String(createdTicket.queueNumber) })
      ];
      if (successEtaMinutes != null) {
        parts.push(t('ticket.success_eta', { minutes: successEtaMinutes }));
      }
      if (successPeopleAhead != null) {
        parts.push(t('ticket.success_ahead', { n: successPeopleAhead }));
      }
      tts.speak(parts.join(' '));
      return;
    }
    if (isServiceRoot) {
      tts.speak(tA11y('screen_welcome', { title: heroTitle }));
    } else {
      tts.speak(tA11y('screen_drill', { title: heroTitle }));
    }
  }, [
    unit,
    tts,
    t,
    isTicketModalOpen,
    createdTicket,
    isServiceRoot,
    pathLeaf?.id,
    successEtaMinutes,
    successPeopleAhead,
    heroTitle,
    tA11y,
    isPhoneIdentificationOpen,
    isEmployeeIdentificationOpen,
    isKioskQrIdentificationOpen
  ]);

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

  const closeTicketSuccessModal = useCallback(() => {
    resetA11yToDefaults();
    ttsKeyRef.current = '';
    cancelKioskTts();
    setIsTicketModalOpen(false);
    setCreatedTicket(null);
    setSuccessEtaMinutes(null);
    setSuccessPeopleAhead(null);
    setKioskSmsBlocking(false);
    setKioskSmsAgreed(false);
    setKioskSmsDigits('');
    setKioskSmsError(null);
    setTicketManualPrintBusy(false);
    if (autoCloseTimerId) {
      clearInterval(autoCloseTimerId);
      setAutoCloseTimerId(null);
    }
  }, [resetA11yToDefaults, cancelKioskTts, autoCloseTimerId]);

  const closeTicketSuccessModalRef = useRef(closeTicketSuccessModal);
  useEffect(() => {
    closeTicketSuccessModalRef.current = closeTicketSuccessModal;
  }, [closeTicketSuccessModal]);

  const scheduleTicketModalAutoClose = useCallback(() => {
    setKioskSmsBlocking(false);
    setCountdown(ticketSuccessAutoCloseSec);
    if (autoCloseTimerId) {
      clearInterval(autoCloseTimerId);
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          queueMicrotask(() => {
            closeTicketSuccessModalRef.current();
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setAutoCloseTimerId(timer);
  }, [autoCloseTimerId, ticketSuccessAutoCloseSec]);

  const onTicketManualPrint = async () => {
    if (!createdTicket) {
      return;
    }
    if (!successTicketServiceLabel) {
      toast.error(t('ticket.print_failed'));
      return;
    }
    setTicketManualPrintBusy(true);
    try {
      const ok = await tryPrintTicket(createdTicket, successTicketServiceLabel);
      if (ok) {
        toast.success(t('ticket.print_ok'));
      } else {
        toast.error(t('ticket.print_failed'));
      }
    } finally {
      setTicketManualPrintBusy(false);
    }
  };

  const autolayoutPathKey = useMemo(
    () => selectedServicePath.map((s) => s.id).join('>') || 'root',
    [selectedServicePath]
  );

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
      if (!useAutoKioskLayout && !isServicePlacedOnGrid(service)) {
        return false;
      }
      if (unit?.kind === 'subdivision') {
        return true;
      }
      return serviceMatchesGridZoneScope(service, kioskGridZoneScope);
    });
  }, [
    unitServicesTree,
    selectedServicePath,
    kioskGridZoneScope,
    unit?.kind,
    useAutoKioskLayout
  ]);

  const autolayoutSorted = useMemo(
    () =>
      useAutoKioskLayout
        ? sortServicesForKioskAutolayout(visibleServices)
        : visibleServices,
    [useAutoKioskLayout, visibleServices]
  );

  const autolayoutPageTotal = autolayoutSorted.length;
  const autolayoutPageClamped = clampAutolayoutPageIndex(
    kioskAutolayoutPage,
    autolayoutPageTotal
  );
  const autolayoutPageSlice = useAutoKioskLayout
    ? getAutolayoutPageSlice(autolayoutSorted, autolayoutPageClamped)
    : autolayoutSorted;
  const autolayoutPageCount = useAutoKioskLayout
    ? getAutolayoutPageCount(autolayoutPageTotal)
    : 1;
  const autolayoutGridDims = useAutoKioskLayout
    ? getAutolayoutGridDimensions(
        autolayoutPageSlice.length,
        autolayoutPageTotal
      )
    : { rows: 0, cols: 0 };
  const autolayoutSlots = useAutoKioskLayout
    ? buildAutolayoutPageSlots(autolayoutPageSlice, autolayoutPageTotal)
    : [];

  const autolayoutPathKeyRef = useRef(autolayoutPathKey);
  useEffect(() => {
    if (!useAutoKioskLayout) {
      return;
    }
    if (autolayoutPathKeyRef.current !== autolayoutPathKey) {
      autolayoutPathKeyRef.current = autolayoutPathKey;
      setKioskAutolayoutPage(0);
    }
  }, [autolayoutPathKey, useAutoKioskLayout]);
  useEffect(() => {
    if (!useAutoKioskLayout) {
      return;
    }
    setKioskAutolayoutPage((p) =>
      clampAutolayoutPageIndex(p, autolayoutPageTotal)
    );
  }, [useAutoKioskLayout, autolayoutPageTotal]);

  const openTicketSuccessFlow = (ticket: Ticket, service: Service) => {
    setSuccessEtaMinutes(null);
    if (typeof ticket.queuePosition === 'number' && ticket.queuePosition > 0) {
      setSuccessPeopleAhead(Math.max(0, ticket.queuePosition - 1));
    } else {
      setSuccessPeopleAhead(null);
    }
    setCreatedTicket(ticket);
    setIsTicketModalOpen(true);
    setSelectedServicePath([]);
    setKioskSmsError(null);
    setKioskSmsAgreed(false);
    setKioskSmsDigits('');

    const needSms = ticket.smsPostTicketStepRequired === true;
    if (needSms) {
      setKioskSmsBlocking(true);
      if (autoCloseTimerId) {
        clearInterval(autoCloseTimerId);
        setAutoCloseTimerId(null);
      }
    } else {
      setKioskSmsBlocking(false);
      scheduleTicketModalAutoClose();
    }

    const serviceLabel = getLocalizedName(
      service.name,
      service.nameRu || '',
      service.nameEn || '',
      locale
    );
    const canPrint = hasKioskPrintTarget(kioskCfg);
    const printAutomatically =
      canPrint && kioskCfg?.isAlwaysPrintTicket !== false;
    if (printAutomatically) {
      void tryPrintTicket(ticket, serviceLabel);
    }
    setMessage(
      t('ticketCreated', {
        defaultValue: 'Ticket created successfully!',
        service: serviceLabel
      })
    );
  };

  const createTicketForService = async (
    service: Service,
    opts?:
      | { visitorPhone: string; visitorLocale: 'en' | 'ru' }
      | { kioskIdentifiedUserId: string },
    failTarget?: 'phoneModal' | 'page' | 'employeeModal'
  ) => {
    setMessage('');
    setEmployeeCreateTicketError('');
    try {
      let ticket;
      if (opts && 'kioskIdentifiedUserId' in opts) {
        ticket = await createTicketMutation.mutateAsync({
          unitId: kioskApiUnitId!,
          serviceId: service.id,
          kioskIdentifiedUserId: opts.kioskIdentifiedUserId
        });
      } else if (opts && 'visitorPhone' in opts) {
        ticket = await createTicketMutation.mutateAsync({
          unitId: kioskApiUnitId!,
          serviceId: service.id,
          visitorPhone: opts.visitorPhone,
          visitorLocale: opts.visitorLocale
        });
      } else {
        ticket = await createTicketMutation.mutateAsync({
          unitId: kioskApiUnitId!,
          serviceId: service.id
        });
      }
      setPhoneIdentificationError('');
      setIsPhoneIdentificationOpen(false);
      setPendingPhoneService(null);
      setIsEmployeeIdentificationOpen(false);
      setPendingEmployeeService(null);
      setEmployeeIdSubmode('badge');
      openTicketSuccessFlow(ticket, service);
    } catch (error) {
      console.error('Failed to create ticket:', error);
      if (isQuotaExceededError(error)) {
        const quotaMsg = t('ticketQuotaExceeded');
        if (failTarget === 'phoneModal') {
          setPhoneIdentificationError(quotaMsg);
        } else if (failTarget === 'employeeModal') {
          setEmployeeCreateTicketError(quotaMsg);
        } else {
          setMessage(quotaMsg);
        }
        return;
      }
      const failDefault = t('ticketCreationFailed', {
        defaultValue: 'Failed to create ticket. Please try again.'
      });
      if (failTarget === 'phoneModal') {
        setPhoneIdentificationError(
          t('phone_identification.submit_failed', {
            defaultValue: failDefault
          })
        );
      } else if (failTarget === 'employeeModal') {
        setEmployeeCreateTicketError(
          tEmployee('ticket_create_failed', { defaultValue: failDefault })
        );
      } else {
        setMessage(failDefault);
      }
    }
  };

  const handleServiceSelection = async (service: Service) => {
    if (service.isLeaf) {
      const mode = getServiceIdentificationMode(service);
      if (mode === 'phone') {
        setPhoneIdentificationError('');
        setPendingPhoneService(service);
        setPhoneIdentificationSessionKey((k) => k + 1);
        setIsPhoneIdentificationOpen(true);
        return;
      }
      if (mode === 'qr') {
        if (!appointmentCheckinEnabled) {
          setIsKioskQrCheckinDisabledOpen(true);
          return;
        }
        setKioskPrIdentModalKey((k) => k + 1);
        setIsKioskQrIdentificationOpen(true);
        return;
      }
      if (mode === 'login' || mode === 'badge') {
        setEmployeeCreateTicketError('');
        setPendingEmployeeService(service);
        setEmployeeIdSubmode(mode === 'login' ? 'login' : 'badge');
        setIsEmployeeIdentificationOpen(true);
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

  const KIOSK_SMS_MAX = 15;

  const handleKioskSmsDecline = async () => {
    if (!createdTicket) {
      return;
    }
    if (!createdTicket.visitorToken) {
      setKioskSmsError(t('sms_post_ticket.token_error'));
      scheduleTicketModalAutoClose();
      return;
    }
    setKioskSmsError(null);
    setKioskSmsBusy(true);
    try {
      await ticketsApi.visitorSmsSkip(
        createdTicket.id,
        createdTicket.visitorToken
      );
      scheduleTicketModalAutoClose();
    } catch (e) {
      setKioskSmsError(
        e instanceof Error ? e.message : t('sms_post_ticket.network_error')
      );
    } finally {
      setKioskSmsBusy(false);
    }
  };

  const handleKioskSmsConfirm = async () => {
    if (!createdTicket?.visitorToken) {
      setKioskSmsError(t('sms_post_ticket.token_error'));
      return;
    }
    if (!kioskSmsAgreed) {
      setKioskSmsError(t('sms_post_ticket.consent_error'));
      return;
    }
    if (kioskSmsDigits.length < 5) {
      setKioskSmsError(t('sms_post_ticket.short_phone_error'));
      return;
    }
    setKioskSmsError(null);
    setKioskSmsBusy(true);
    try {
      await ticketsApi.attachPhone(
        createdTicket.id,
        `+${kioskSmsDigits}`,
        locale === 'ru' ? 'ru' : 'en',
        createdTicket.visitorToken
      );
      scheduleTicketModalAutoClose();
    } catch (e) {
      setKioskSmsError(
        e instanceof Error ? e.message : t('sms_post_ticket.network_error')
      );
    } finally {
      setKioskSmsBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'kiosk-motion-root kiosk-a11y-root flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4',
        useHcSurfaces ? 'text-zinc-100' : 'text-kiosk-ink',
        useHcSurfaces && 'kiosk-hc'
      )}
      data-kiosk-font-step={a11y.fontStep}
      data-kiosk-hc={useHcSurfaces ? 'true' : 'false'}
      style={{ backgroundColor: bodyColor }}
    >
      <KioskTopBar
        intlLocale={intlLocale}
        currentTime={currentTime}
        onClockClick={handleClockClick}
        headerColor={headerColor}
        useLightHeaderText={useHcSurfaces}
        leading={topBarLeading}
        beforeClock={topBarBeforeClock}
      />

      {unitQueryError && !unit ? (
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='max-w-md px-4 text-center'>
            <h2 className='mb-2 text-2xl font-bold tracking-tight sm:text-3xl'>
              {t('unitLoadErrorTitle')}
            </h2>
            <p className='text-kiosk-ink-muted mb-6 text-base'>
              {t('unitLoadErrorMessage')}
            </p>
            <div className='flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
              <Button
                className='rounded-full px-8'
                disabled={!unitId}
                onClick={invalidateUnitQuery}
              >
                {t('retryServices')}
              </Button>
              {isTauriKiosk() ? (
                <Button
                  variant='outline'
                  className='border-kiosk-border/60 rounded-full px-8'
                  onClick={() => void handleResetDesktopPairing()}
                >
                  {t('desktop_reset_pairing')}
                </Button>
              ) : null}
            </div>
            {isTauriKiosk() ? (
              <p className='text-kiosk-ink-muted mt-4 text-sm'>
                {t('desktop_reset_pairing_short')}
              </p>
            ) : null}
          </div>
        </div>
      ) : unitPending && !unit ? (
        <div className='flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4'>
          <div className='text-center'>
            <div className='kiosk-a11y-respect-motion border-kiosk-ink/30 mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-b-transparent'></div>
            <p className='text-kiosk-ink-muted'>{t('loading')}</p>
            {unitSlowLoad ? (
              <>
                <p className='text-kiosk-ink-muted mt-4 max-w-md text-sm'>
                  {t('stillLoadingKioskHint')}
                </p>
                {isTauriKiosk() ? (
                  <Button
                    variant='outline'
                    className='border-kiosk-border/60 mt-4 rounded-full px-8'
                    onClick={() => void handleResetDesktopPairing()}
                  >
                    {t('desktop_reset_pairing')}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : !unit ? (
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='max-w-md px-4 text-center'>
            <h2 className='mb-2 text-2xl font-bold tracking-tight sm:text-3xl'>
              {t('unitLoadErrorTitle')}
            </h2>
            <p className='text-kiosk-ink-muted mb-6 text-base'>
              {t('unitLoadErrorMessage')}
            </p>
            <div className='flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
              <Button
                className='rounded-full px-8'
                disabled={!unitId}
                onClick={invalidateUnitQuery}
              >
                {t('retryServices')}
              </Button>
              {isTauriKiosk() ? (
                <Button
                  variant='outline'
                  className='border-kiosk-border/60 rounded-full px-8'
                  onClick={() => void handleResetDesktopPairing()}
                >
                  {t('desktop_reset_pairing')}
                </Button>
              ) : null}
            </div>
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
            <div className='kiosk-a11y-respect-motion border-kiosk-ink/30 mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-b-transparent'></div>
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
            <div className='flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
              <Button
                className='rounded-full px-8'
                onClick={() => void refetchServicesTree()}
              >
                {t('retryServices', { defaultValue: 'Try again' })}
              </Button>
              {isTauriKiosk() ? (
                <Button
                  variant='outline'
                  className='border-kiosk-border/60 rounded-full px-8'
                  onClick={() => void handleResetDesktopPairing()}
                >
                  {t('desktop_reset_pairing')}
                </Button>
              ) : null}
            </div>
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
          <KioskWelcomeHero
            title={heroTitle}
            subtitle={heroSubtitle}
            highContrast={useHcSurfaces}
            accessory={<KioskAccessibilityToolbar audio={kioskAudio} />}
          />

          {/* Navigation breadcrumbs and buttons */}
          <div
            className={cn(
              'mb-2 flex shrink-0 items-center justify-between rounded-xl border px-3 py-2 sm:mb-3 sm:px-4',
              useHcSurfaces
                ? 'border-white/20 bg-zinc-800/80'
                : 'border-kiosk-border/50 bg-white/40'
            )}
          >
            <div
              className={cn(
                'flex min-w-0 items-center overflow-x-auto text-sm font-medium',
                useHcSurfaces ? 'text-zinc-300' : 'text-kiosk-ink-muted'
              )}
            >
              <span className='mr-2 shrink-0 opacity-70'>#</span>
              {selectedServicePath.length === 0 ? (
                <span className={useHcSurfaces ? 'text-zinc-200' : undefined}>
                  {t('services', { defaultValue: 'Services' })}
                </span>
              ) : (
                selectedServicePath.map((service, index) => (
                  <div key={index} className='flex items-center'>
                    {index > 0 && (
                      <Separator
                        orientation='vertical'
                        className='bg-kiosk-border mx-2 h-4'
                      />
                    )}
                    <span
                      className={cn(
                        'whitespace-nowrap',
                        useHcSurfaces ? 'text-white' : 'text-kiosk-ink'
                      )}
                    >
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
                  className='kiosk-touch-min h-12 min-w-12 gap-2 rounded-full sm:px-4'
                  onClick={() => setSelectedServicePath([])}
                >
                  <Home className='size-5 shrink-0' />
                  {t('home', { defaultValue: 'Home' })}
                </Button>
              )}
              {selectedServicePath.length > 0 && (
                <Button
                  variant='outline'
                  size='sm'
                  className='kiosk-touch-min h-12 min-w-12 gap-2 rounded-full sm:px-4'
                  onClick={handleGoBack}
                >
                  <ArrowLeft className='size-5 shrink-0' />
                  {t('back', { defaultValue: 'Back' })}
                </Button>
              )}
            </div>
          </div>

          {/* Services grid — fills remaining viewport height; no page scroll */}
          {useAutoKioskLayout ? (
            <div
              className='flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-2xl p-2 sm:gap-3 sm:p-3 md:p-4'
              style={{ backgroundColor: serviceGridColor }}
            >
              {autolayoutPageCount > 1 ? (
                <div
                  className='flex w-full shrink-0 flex-col items-center justify-center gap-2'
                  role='navigation'
                  aria-label={t('autolayout_pagination_aria', {
                    defaultValue: 'Service pages'
                  })}
                >
                  <div className='flex w-full items-center justify-center gap-2 sm:gap-4'>
                    <Button
                      type='button'
                      variant='outline'
                      className='kiosk-touch-min h-12 min-w-12 gap-1 rounded-full px-4 sm:px-5'
                      disabled={autolayoutPageClamped <= 0}
                      onClick={() =>
                        setKioskAutolayoutPage((p) => Math.max(0, p - 1))
                      }
                      aria-label={t('autolayout_prev_aria', {
                        defaultValue: 'Previous page'
                      })}
                    >
                      <ChevronLeft className='size-5 shrink-0' aria-hidden />
                      <span className='hidden min-[400px]:inline'>
                        {t('autolayout_prev', { defaultValue: 'Previous' })}
                      </span>
                    </Button>
                    <span
                      className={cn(
                        'text-sm font-medium tabular-nums sm:text-base',
                        useHcSurfaces ? 'text-zinc-200' : 'text-kiosk-ink'
                      )}
                    >
                      {t('autolayout_page_status', {
                        current: autolayoutPageClamped + 1,
                        total: autolayoutPageCount
                      })}
                    </span>
                    <Button
                      type='button'
                      variant='outline'
                      className='kiosk-touch-min h-12 min-w-12 gap-1 rounded-full px-4 sm:px-5'
                      disabled={
                        autolayoutPageClamped >= autolayoutPageCount - 1
                      }
                      onClick={() =>
                        setKioskAutolayoutPage((p) =>
                          Math.min(autolayoutPageCount - 1, p + 1)
                        )
                      }
                      aria-label={t('autolayout_next_aria', {
                        defaultValue: 'Next page'
                      })}
                    >
                      <span className='hidden min-[400px]:inline'>
                        {t('autolayout_next', { defaultValue: 'Next' })}
                      </span>
                      <ChevronRight className='size-5 shrink-0' aria-hidden />
                    </Button>
                  </div>
                  <div
                    className='flex max-w-full flex-wrap items-center justify-center gap-2 sm:gap-2.5'
                    role='group'
                    aria-label={t('autolayout_page_dots_group_aria', {
                      defaultValue: 'Jump to page'
                    })}
                  >
                    {Array.from(
                      { length: autolayoutPageCount },
                      (_, pageIndex) => (
                        <button
                          key={pageIndex}
                          type='button'
                          className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                            useHcSurfaces
                              ? 'focus-visible:ring-amber-400 focus-visible:ring-offset-zinc-900'
                              : 'focus-visible:ring-kiosk-ink focus-visible:ring-offset-amber-50/80'
                          )}
                          aria-label={t('autolayout_page_dot_aria', {
                            page: pageIndex + 1
                          })}
                          aria-current={
                            pageIndex === autolayoutPageClamped
                              ? 'page'
                              : undefined
                          }
                          onClick={() => setKioskAutolayoutPage(pageIndex)}
                        >
                          <span
                            className={cn(
                              'block h-2.5 w-2.5 rounded-full',
                              pageIndex === autolayoutPageClamped
                                ? useHcSurfaces
                                  ? 'bg-amber-300'
                                  : 'bg-kiosk-ink'
                                : useHcSurfaces
                                  ? 'border border-zinc-500 bg-transparent'
                                  : 'border-kiosk-ink/35 border bg-transparent'
                            )}
                            aria-hidden
                          />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : null}
              {autolayoutGridDims.rows > 0 && autolayoutGridDims.cols > 0 ? (
                <div
                  className='grid min-h-0 w-full min-w-0 flex-1 gap-1.5 overflow-hidden sm:gap-2 md:gap-3'
                  style={{
                    gridTemplateColumns: `repeat(${autolayoutGridDims.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${autolayoutGridDims.rows}, minmax(0, 1fr))`
                  }}
                >
                  {autolayoutSlots.map((slot) => {
                    if (slot.type === 'empty') {
                      return (
                        <div
                          key={`empty-${slot.row}-${slot.col}`}
                          aria-hidden
                          className='h-full min-h-0 w-full min-w-0'
                          style={{
                            gridRow: slot.row + 1,
                            gridColumn: slot.col + 1
                          }}
                        />
                      );
                    }
                    const { service } = slot;
                    return (
                      <div
                        key={service.id}
                        className='h-full min-h-0 w-full min-w-0'
                        style={{
                          gridRow: slot.row + 1,
                          gridColumn: slot.col + 1
                        }}
                      >
                        <KioskServiceTile
                          service={service}
                          locale={locale}
                          tileKind={service.isLeaf ? 'leaf' : 'branch'}
                          highContrast={useHcSurfaces}
                          onSelect={handleServiceSelection}
                          onA11yFocus={handleA11yTileVocalize}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : (
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
                      tileKind={service.isLeaf ? 'leaf' : 'branch'}
                      highContrast={useHcSurfaces}
                      onSelect={handleServiceSelection}
                      onA11yFocus={handleA11yTileVocalize}
                    />
                  </div>
                );
              })}

              {/* Add empty cells to fill up the grid structure where no services are positioned */}
              {Array.from({ length: SERVICE_GRID_CELL_COUNT }).map(
                (_, index) => {
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
                        (service.gridRow as number) +
                          (service.gridRowSpan || 1) &&
                      col >= (service.gridCol as number) &&
                      col <
                        (service.gridCol as number) + (service.gridColSpan || 1)
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
                }
              )}
            </div>
          )}
        </>
      )}

      {createdTicket ? (
        <KioskTicketSuccessOverlay
          open={isTicketModalOpen}
          onClose={closeTicketSuccessModal}
          a11yLive={tA11y('success_live', {
            number: String(createdTicket.queueNumber)
          })}
          logoUrl={unit?.config?.kiosk?.logoUrl}
          showTicketHeader={showTicketHeader}
          headerText={kioskCfg?.headerText}
          serviceName={successTicketServiceLabel}
          queueNumber={String(createdTicket.queueNumber)}
          successEtaMinutes={successEtaMinutes}
          successPeopleAhead={successPeopleAhead}
          serviceZoneName={
            createdTicket.serviceZoneName?.trim()
              ? createdTicket.serviceZoneName.trim()
              : null
          }
          showTicketFooter={showTicketFooter}
          footerText={kioskCfg?.footerText}
          qrValue={`${baseAppUrl}/${locale}/ticket/${createdTicket.id}`}
          highContrast={useHcSurfaces}
          bodyBackground={bodyColor}
          smsBlocking={kioskSmsBlocking}
          closeButtonLabel={
            kioskSmsBlocking
              ? `${t('close')} (…)`
              : `${t('close')} (${countdown})`
          }
          showPrintTicketButton={showTicketManualPrintAction}
          onPrintTicket={() => {
            void onTicketManualPrint();
          }}
          printTicketPending={ticketManualPrintBusy}
        >
          {kioskSmsBlocking && createdTicket ? (
            <div
              className={cn(
                'border-t pt-4',
                useHcSurfaces ? 'border-white/20' : 'border-t-border'
              )}
              data-testid='kiosk-sms-capture'
            >
              <p className='mb-2 text-center text-sm font-medium'>
                {t('sms_post_ticket.title')}
              </p>
              <p
                className={cn(
                  'mb-3 text-center text-xs sm:text-sm',
                  useHcSurfaces ? 'text-zinc-400' : 'text-muted-foreground'
                )}
              >
                {t('sms_post_ticket.subtitle')}
              </p>
              <div className='mb-3 flex items-start gap-2'>
                <Checkbox
                  id='kiosk-sms-consent'
                  checked={kioskSmsAgreed}
                  onCheckedChange={(c) => {
                    setKioskSmsAgreed(c === true);
                    setKioskSmsError(null);
                  }}
                  className='mt-1'
                />
                <label
                  htmlFor='kiosk-sms-consent'
                  className={cn(
                    'text-left text-xs sm:text-sm',
                    useHcSurfaces ? 'text-zinc-300' : 'text-muted-foreground'
                  )}
                >
                  {t('sms_post_ticket.consent_label')}
                </label>
              </div>
              <div
                className={cn(
                  'mb-3 flex w-full items-center justify-center rounded-md border px-2 font-mono text-2xl font-bold select-none sm:text-3xl',
                  useHcSurfaces
                    ? 'border-white/20 bg-white/5'
                    : 'border-input bg-background'
                )}
                style={{ minHeight: '3.5rem' }}
                role='status'
                aria-live='polite'
                aria-label={
                  kioskSmsDigits.length > 0
                    ? tA11y('sms_phone_entry', { n: `+${kioskSmsDigits}` })
                    : tA11y('sms_phone_entry_empty')
                }
              >
                {kioskSmsDigits.length > 0 ? `+${kioskSmsDigits}` : '+'}
              </div>
              {kioskSmsError ? (
                <p className='text-destructive mb-2 text-center text-xs sm:text-sm'>
                  {kioskSmsError}
                </p>
              ) : null}
              <div className='mb-3 grid w-full max-w-sm grid-cols-3 gap-2 sm:gap-3'>
                {[
                  '1',
                  '2',
                  '3',
                  '4',
                  '5',
                  '6',
                  '7',
                  '8',
                  '9',
                  '',
                  '0',
                  '⌫'
                ].map((d, i) => (
                  <span key={i} className='min-h-0 min-w-0 [contain:size]'>
                    {d ? (
                      <Button
                        type='button'
                        variant='outline'
                        className='h-[4.5rem] w-full min-w-0 px-0 text-xl font-bold sm:h-[5rem] sm:text-2xl'
                        disabled={kioskSmsBusy}
                        aria-label={
                          d === '⌫'
                            ? tA11y('sms_numpad_backspace')
                            : tA11y('sms_numpad_digit', { d })
                        }
                        onClick={() => {
                          if (d === '⌫') {
                            setKioskSmsDigits((prev) => prev.slice(0, -1));
                            return;
                          }
                          setKioskSmsDigits((prev) =>
                            prev.length >= KIOSK_SMS_MAX ? prev : prev + d
                          );
                        }}
                      >
                        {d}
                      </Button>
                    ) : (
                      <span className='block' />
                    )}
                  </span>
                ))}
              </div>
              <div className='grid w-full gap-2 sm:grid-cols-2'>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  disabled={kioskSmsBusy}
                  onClick={() => void handleKioskSmsDecline()}
                >
                  {t('sms_post_ticket.not_now')}
                </Button>
                <Button
                  type='button'
                  className='w-full'
                  disabled={
                    kioskSmsBusy || !kioskSmsAgreed || kioskSmsDigits.length < 5
                  }
                  onClick={() => void handleKioskSmsConfirm()}
                >
                  {kioskSmsBusy
                    ? t('sms_post_ticket.sending')
                    : t('sms_post_ticket.send')}
                </Button>
              </div>
            </div>
          ) : null}
        </KioskTicketSuccessOverlay>
      ) : null}

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
        unitName={unit ? getUnitDisplayName(unit, locale) : ''}
        currentConfig={unit?.config}
        hasUnit={Boolean(unit)}
        unitQueryError={unitQueryError}
        unitPending={unitPending}
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

      <KioskSessionIdleBar
        open={showIdleWarning}
        remainingSec={idleRemainingSec}
        countdownSec={idleCountdownSec}
        onContinue={continueIdleSession}
        highContrast={a11y.highContrast}
        bottomOffset={BOTTOM_STATUS_STRIP_PX}
      />

      <KioskBuildStatusBar
        appVersion={appVersion}
        status={buildStatus}
        highContrast={a11y.highContrast}
      />

      {attractScreenVisible ? (
        <KioskAttractScreen
          onDismiss={() => {
            setShowAttract(false);
            if (attractMode !== 'attract_only') {
              continueIdleSession();
            }
          }}
          intlLocale={intlLocale}
          currentTime={currentTime}
          logoUrl={kioskCfg?.logoUrl}
          highContrast={a11y.highContrast}
          bodyBackground={bodyColor}
          showQueueDepth={getShowQueueDepthOnAttract(kioskCfg)}
          eta={unitEtaSnapshot}
          contentSlides={contentSlides}
          defaultImageSeconds={defaultImageSeconds}
        />
      ) : null}

      {serverKioskFrozen ? (
        <div
          className='bg-background/95 fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 p-6 text-center backdrop-blur-sm'
          role='alert'
        >
          <h1 className='text-2xl font-semibold'>{t('server_frozen_title')}</h1>
          <p className='text-muted-foreground max-w-md text-sm'>
            {t('server_frozen_message')}
          </p>
        </div>
      ) : null}

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

      <Dialog
        open={isEmployeeIdentificationOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEmployeeIdentificationOpen(false);
            setPendingEmployeeService(null);
            setEmployeeIdSubmode('badge');
            setEmployeeCreateTicketError('');
          }
        }}
      >
        <DialogContent
          className='flex max-w-[min(100vw-1.5rem,64rem)] flex-col overflow-hidden sm:max-w-5xl'
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{tEmployee('dialog_title')}</DialogTitle>
          </DialogHeader>
          {employeeCreateTicketError ? (
            <p className='text-destructive text-sm' role='alert'>
              {employeeCreateTicketError}
            </p>
          ) : null}
          {kioskApiUnitId && pendingEmployeeService ? (
            <KioskEmployeeIdFlow
              unitId={kioskApiUnitId}
              service={pendingEmployeeService}
              mode={employeeIdSubmode}
              onBack={() => {
                setIsEmployeeIdentificationOpen(false);
                setPendingEmployeeService(null);
                setEmployeeIdSubmode('badge');
                setEmployeeCreateTicketError('');
              }}
              onIdentified={(userId) => {
                const svc = pendingEmployeeService;
                if (!svc) {
                  return;
                }
                void createTicketForService(
                  svc,
                  { kioskIdentifiedUserId: userId },
                  'employeeModal'
                );
              }}
              onUseKeyboard={
                getServiceIdentificationMode(pendingEmployeeService) === 'badge'
                  ? () => setEmployeeIdSubmode('login')
                  : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isKioskQrCheckinDisabledOpen}
        onOpenChange={setIsKioskQrCheckinDisabledOpen}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('pre_registration.title_appointment')}</DialogTitle>
          </DialogHeader>
          <p className='text-kiosk-ink-muted text-sm leading-relaxed'>
            {t('qr_checkin_unavailable')}
          </p>
          <DialogFooter className='sm:justify-end'>
            <Button
              type='button'
              onClick={() => {
                setIsKioskQrCheckinDisabledOpen(false);
                setSelectedServicePath([]);
              }}
            >
              {t('qr_checkin_unavailable_ok')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showKioskIdOcr && unitId ? (
        <KioskIdOcrDialog
          open={idOcrOpen}
          onOpenChange={setIdOcrOpen}
          unitId={unitId}
          preferNative={kioskCfg?.idOcrPreferNative !== false}
          wedgeMrz={kioskCfg?.idOcrWedgeMrz !== false}
          wedgeRu={kioskCfg?.idOcrWedgeRuDriverLicense !== false}
          onUseText={(text) => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast.success(
                  t('id_ocr.pasted', {
                    defaultValue:
                      'OCR text copied. Paste where needed (long-press or Ctrl+V).'
                  })
                );
              } catch {
                toast.info(text.slice(0, 800));
              }
            })();
          }}
        />
      ) : null}

      <PreRegRedemptionModal
        key={
          isKioskQrIdentificationOpen
            ? `kiosk-qr-${kioskPrIdentModalKey}`
            : redeemModalKey
        }
        isOpen={isRedemptionModalOpen || isKioskQrIdentificationOpen}
        onClose={() => {
          setIsRedemptionModalOpen(false);
          setIsKioskQrIdentificationOpen(false);
          setRedeemAutoFromDeeplink(false);
        }}
        unitId={kioskApiUnitId ?? unitId!}
        initialCode={isKioskQrIdentificationOpen ? undefined : deeplinkPrCode}
        showPhoneTab={showPhoneForAppointment}
        autoRedeemFromDeeplink={
          redeemAutoFromDeeplink && !isKioskQrIdentificationOpen
        }
        onSuccess={async (ticket) => {
          let full: Ticket = ticket;
          try {
            full = await ticketsApi.getById(ticket.id);
          } catch {
            // keep redeem payload
          }
          const svc =
            unitServicesTree?.find((s) => s.id === full.serviceId) ??
            ({
              id: full.serviceId,
              name: '',
              isLeaf: true
            } as Service);
          openTicketSuccessFlow(full, svc);
        }}
      />
    </div>
  );
}
