'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ApiHttpError,
  COUNTER_BOARD_LOCALE_KEY,
  COUNTER_BOARD_STORAGE_CHANGED_EVENT,
  COUNTER_BOARD_TOKEN_KEY,
  COUNTER_BOARD_UNIT_KEY,
  terminalAuthBootstrap,
  terminalBootstrapDisplayLocale
} from '@/lib/api';
import { isApiHttpError } from '@/lib/api-errors';
import {
  counterBoardSession,
  type ServicesCounterBoardSession
} from '@/lib/api/generated/guest-survey-terminal';
import { socketClient } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { resolveCounterDisplayAppearance } from '@/lib/guest-survey-counter-display-theme';
import {
  parseAdScreen,
  pathWithQueryNoCode
} from '@/lib/workplace-display-utils';
import {
  CounterDisplaySessionIntlProvider,
  useCounterDisplaySessionLocale
} from '../counter-display/counter-display-session-intl';
import { type Locale, locales } from '@/i18n';

function readStoredCounterBoardLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const tok = localStorage.getItem(COUNTER_BOARD_TOKEN_KEY);
  const loc = localStorage.getItem(COUNTER_BOARD_LOCALE_KEY);
  if (!tok || !loc) return null;
  return locales.includes(loc as Locale) ? (loc as Locale) : null;
}

const WORKPLACE_DISPLAY_EASE = [0.22, 1, 0.36, 1] as const;

/** Hidden unpair: number of quick taps on the top band (counter name area). */
const RESET_TAP_TARGET = 5;
const RESET_TAP_WINDOW_MS = 4000;

function WorkplaceDisplayPageInner() {
  const reduceMotion = useReducedMotion();
  const t = useTranslations('counter_board');
  const { resetSessionLocale } = useCounterDisplaySessionLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [pairCode, setPairCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const resetTapCountRef = useRef(0);
  const resetTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryPairAttemptedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (resetTapTimerRef.current) {
        clearTimeout(resetTapTimerRef.current);
      }
    };
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate terminal pairing from localStorage */
  useEffect(() => {
    const tok = localStorage.getItem(COUNTER_BOARD_TOKEN_KEY);
    const uid = localStorage.getItem(COUNTER_BOARD_UNIT_KEY);
    if (tok && uid) {
      setToken(tok);
      setUnitId(uid);
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sessionQuery = useQuery({
    queryKey: ['counter-board-session', unitId, token],
    queryFn: async ({ signal }) => {
      const res = await counterBoardSession(unitId!, {
        signal,
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data as ServicesCounterBoardSession;
    },
    enabled: Boolean(hydrated && token && unitId),
    retry: (failureCount, err) => {
      if (
        isApiHttpError(err) &&
        (err.status === 401 ||
          err.status === 403 ||
          err.code === 'FEATURE_LOCKED')
      ) {
        return false;
      }
      return failureCount < 1;
    },
    refetchInterval: (query) => {
      const err = query.state.error;
      if (
        err &&
        isApiHttpError(err) &&
        (err.status === 401 ||
          err.status === 403 ||
          err.code === 'FEATURE_LOCKED')
      ) {
        return false;
      }
      return 5000;
    }
  });

  const session = sessionQuery.data;

  useEffect(() => {
    if (!unitId || !token) return;
    socketClient.connect(unitId);
    const bump = () => {
      qc.invalidateQueries({ queryKey: ['counter-board-session', unitId] });
    };
    socketClient.on('ticket.updated', bump);
    socketClient.on('counter.updated', bump);
    return () => {
      socketClient.off('ticket.updated', bump);
      socketClient.off('counter.updated', bump);
      socketClient.disconnect();
    };
  }, [unitId, token, qc]);

  const adScreen = useMemo(
    () => parseAdScreen(session?.unitConfig as Record<string, unknown>),
    [session?.unitConfig]
  );

  const pairWithCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      try {
        const res = await terminalAuthBootstrap(code);
        if (!res.counterId || res.terminalKind !== 'counter_board') {
          toast.error(t('wrong_terminal_type'));
          return;
        }
        localStorage.setItem(COUNTER_BOARD_TOKEN_KEY, res.token);
        localStorage.setItem(COUNTER_BOARD_UNIT_KEY, res.unitId);
        localStorage.setItem(
          COUNTER_BOARD_LOCALE_KEY,
          terminalBootstrapDisplayLocale(res.defaultLocale)
        );
        setToken(res.token);
        setUnitId(res.unitId);
        setPairCode('');
        window.dispatchEvent(new Event(COUNTER_BOARD_STORAGE_CHANGED_EVENT));
        router.replace(pathWithQueryNoCode(pathname, searchParams.toString()));
      } catch (err) {
        if (err instanceof ApiHttpError && err.status === 403) {
          toast.error(t('feature_locked'));
          return;
        }
        toast.error(t('pair_error'));
      }
    },
    [pathname, router, searchParams, t]
  );

  /* eslint-disable react-hooks/set-state-in-effect -- one-shot bootstrap from ?code= */
  useEffect(() => {
    if (!hydrated || token) return;
    const q = searchParams.get('code')?.trim();
    if (!q || queryPairAttemptedRef.current) return;
    queryPairAttemptedRef.current = true;
    void pairWithCode(q).finally(() => {
      if (!localStorage.getItem(COUNTER_BOARD_TOKEN_KEY)) {
        queryPairAttemptedRef.current = false;
        router.replace(pathWithQueryNoCode(pathname, searchParams.toString()));
      }
    });
  }, [hydrated, token, searchParams, pathname, router, pairWithCode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handlePair = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await pairWithCode(pairCode);
    },
    [pairCode, pairWithCode]
  );

  const handleReset = useCallback(() => {
    if (resetTapTimerRef.current) {
      clearTimeout(resetTapTimerRef.current);
      resetTapTimerRef.current = null;
    }
    resetTapCountRef.current = 0;
    localStorage.removeItem(COUNTER_BOARD_TOKEN_KEY);
    localStorage.removeItem(COUNTER_BOARD_UNIT_KEY);
    localStorage.removeItem(COUNTER_BOARD_LOCALE_KEY);
    setToken(null);
    setUnitId(null);
    resetSessionLocale();
    window.dispatchEvent(new Event(COUNTER_BOARD_STORAGE_CHANGED_EVENT));
    qc.removeQueries({ queryKey: ['counter-board-session'] });
  }, [qc, resetSessionLocale]);

  useEffect(() => {
    if (!sessionQuery.isError) return;
    const err = sessionQuery.error;
    if (isApiHttpError(err) && err.status === 401) {
      /* Pairing token rejected by API — mirror manual unpair (clears storage + session). */
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional recovery from auth failure
      handleReset();
    }
  }, [sessionQuery.isError, sessionQuery.error, handleReset]);

  /** Hidden unpair: 5 quick taps on the top band (counter name area). */
  const handleTopBandResetTap = useCallback(() => {
    resetTapCountRef.current += 1;
    if (resetTapCountRef.current >= RESET_TAP_TARGET) {
      if (resetTapTimerRef.current) {
        clearTimeout(resetTapTimerRef.current);
        resetTapTimerRef.current = null;
      }
      resetTapCountRef.current = 0;
      handleReset();
      return;
    }
    if (resetTapTimerRef.current) {
      clearTimeout(resetTapTimerRef.current);
    }
    resetTapTimerRef.current = setTimeout(() => {
      resetTapCountRef.current = 0;
      resetTapTimerRef.current = null;
    }, RESET_TAP_WINDOW_MS);
  }, [handleReset]);

  if (!hydrated) {
    return (
      <div className='flex flex-1 items-center justify-center p-6'>
        <p className='text-muted-foreground'>{t('loading')}</p>
      </div>
    );
  }

  if (!token || !unitId) {
    return (
      <div className='relative flex flex-1 flex-col items-center justify-center gap-6 p-6'>
        <div className='max-w-md space-y-2 text-center'>
          <h1 className='text-2xl font-bold tracking-tight'>
            {t('pair_title')}
          </h1>
          <p className='text-muted-foreground text-sm'>{t('pair_desc')}</p>
        </div>
        <form
          onSubmit={handlePair}
          className='border-border bg-card w-full max-w-sm space-y-4 rounded-xl border p-6 shadow-sm'
        >
          <div className='space-y-2'>
            <Label htmlFor='wb-code'>{t('code_label')}</Label>
            <Input
              id='wb-code'
              value={pairCode}
              onChange={(e) => setPairCode(e.target.value)}
              autoComplete='off'
              className='font-mono text-lg tracking-wider'
            />
          </div>
          <Button type='submit' className='w-full' size='lg'>
            {t('pair_submit')}
          </Button>
        </form>
      </div>
    );
  }

  if (sessionQuery.isLoading && !session) {
    return (
      <div className='flex flex-1 items-center justify-center p-6'>
        <p className='text-muted-foreground'>{t('loading')}</p>
      </div>
    );
  }

  if (sessionQuery.isError) {
    const err = sessionQuery.error;
    const locked =
      err instanceof ApiHttpError &&
      (err.status === 403 || err.code === 'FEATURE_LOCKED');
    return (
      <div className='relative flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center'>
        <p className='text-destructive max-w-md text-sm'>
          {locked ? t('feature_locked') : t('session_error')}
        </p>
        <Button type='button' variant='outline' onClick={handleReset}>
          {t('reset')}
        </Button>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const appearance = resolveCounterDisplayAppearance(adScreen, undefined);
  const rootStyle: CSSProperties = {
    ...(appearance.rootCssVariables as CSSProperties),
    ...(appearance.bodyBackground
      ? { backgroundColor: appearance.bodyBackground }
      : {})
  };
  const topBandStyle: CSSProperties | undefined = appearance.headerBackground
    ? { backgroundColor: appearance.headerBackground }
    : undefined;

  const ticket = session.activeTicket;
  /** API omits/false only after backend with counterStaffed; treat unknown as staffed */
  const isUnstaffed = session.counterStaffed === false;
  const isOnBreak = Boolean(session.onBreak);
  const isTicketCalled = ticket?.status === 'called';
  const motionDur = reduceMotion ? 0 : 0.4;
  const motionDurShort = reduceMotion ? 0 : 0.32;
  const ticketStatusLine =
    ticket?.status === 'called'
      ? t('status_called')
      : ticket?.status === 'in_service'
        ? t('status_in_service')
        : null;

  return (
    <div className='flex min-h-dvh flex-1 flex-col' style={rootStyle}>
      <section
        className={cn(
          'border-border flex h-[20vh] min-h-[100px] shrink-0 cursor-default flex-col items-center justify-center border-b px-4 py-3 select-none',
          !appearance.headerBackground && 'bg-muted/90'
        )}
        style={topBandStyle}
        onClick={handleTopBandResetTap}
      >
        <p
          className='text-foreground text-center font-semibold tracking-tight'
          style={{
            fontSize: 'clamp(2.25rem, 9vmin, 6.5rem)',
            lineHeight: 1.1
          }}
        >
          {session.counterName}
        </p>
      </section>

      <main
        className={cn(
          'flex min-h-0 flex-1 flex-col text-center',
          ticket || isOnBreak || isUnstaffed
            ? 'items-stretch px-2 py-2 sm:px-4'
            : 'items-center justify-center gap-4 px-4 py-8 md:gap-6'
        )}
      >
        <AnimatePresence mode='wait' initial={false}>
          {isUnstaffed ? (
            <motion.div
              key='unstaffed'
              className={cn(
                '[container-type:size] flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden px-[max(0.25rem,env(safe-area-inset-left))] pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))]',
                'px-3 py-3 sm:px-6 sm:py-5'
              )}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{
                duration: motionDurShort,
                ease: WORKPLACE_DISPLAY_EASE
              }}
            >
              <div className='workplace-display-ticket-panel workplace-display-unstaffed-card'>
                <p className='workplace-display-unstaffed-text px-1 [text-wrap:balance]'>
                  {t('counter_unstaffed')}
                </p>
              </div>
            </motion.div>
          ) : isOnBreak ? (
            <motion.div
              key='on-break'
              className={cn(
                '[container-type:size] flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden px-[max(0.25rem,env(safe-area-inset-left))] pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))]',
                'px-3 py-3 sm:px-6 sm:py-5'
              )}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{
                duration: motionDurShort,
                ease: WORKPLACE_DISPLAY_EASE
              }}
            >
              <div className='workplace-display-ticket-panel workplace-display-break-card'>
                <p className='workplace-display-break-text'>
                  {t('break_not_working')}
                </p>
              </div>
            </motion.div>
          ) : ticket ? (
            <motion.div
              key='has-ticket'
              className={cn(
                '[container-type:size] flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden px-[max(0.25rem,env(safe-area-inset-left))] pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))]',
                isTicketCalled && 'px-3 py-3 sm:px-6 sm:py-5'
              )}
              style={
                {
                  ['--ticket-fluid' as string]: 'min(78cqmin, 38vmin, 62vw)',
                  ['--ticket-fluid-sm' as string]: 'min(24cqmin, 11vmin, 14vw)'
                } as CSSProperties
              }
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{
                duration: motionDurShort,
                ease: WORKPLACE_DISPLAY_EASE
              }}
            >
              <motion.div
                layout
                className={cn(
                  'workplace-display-ticket-panel flex max-h-full w-full flex-col items-center justify-center',
                  isTicketCalled
                    ? 'workplace-display-called-card'
                    : 'max-w-full px-1'
                )}
                style={{
                  gap: 'clamp(0.25rem, var(--ticket-fluid-sm), 2rem)'
                }}
                transition={{
                  layout: {
                    duration: motionDur,
                    ease: WORKPLACE_DISPLAY_EASE
                  }
                }}
              >
                <motion.p
                  key={ticket.queueNumber}
                  className={cn(
                    'max-w-full font-mono font-bold tracking-tight break-all tabular-nums',
                    'leading-none [overflow-wrap:anywhere]',
                    isTicketCalled
                      ? 'workplace-display-called-number'
                      : 'text-foreground'
                  )}
                  style={{
                    fontSize:
                      'clamp(1.5rem, var(--ticket-fluid), min(96vw, 82cqh, 46rem))'
                  }}
                  initial={reduceMotion ? false : { opacity: 0.75 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: motionDurShort,
                    ease: WORKPLACE_DISPLAY_EASE
                  }}
                >
                  {ticket.queueNumber}
                </motion.p>
                <AnimatePresence mode='wait' initial={false}>
                  {ticketStatusLine ? (
                    <motion.p
                      key={ticket.status}
                      className={cn(
                        'max-w-[min(96cqw,100%)] leading-tight [text-wrap:balance] [overflow-wrap:anywhere]',
                        isTicketCalled
                          ? 'workplace-display-called-status font-semibold'
                          : 'text-muted-foreground font-medium'
                      )}
                      style={{
                        fontSize:
                          'clamp(0.875rem, var(--ticket-fluid-sm), min(42vw, 28cqh, 6.5rem))'
                      }}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                      transition={{
                        duration: motionDurShort,
                        ease: WORKPLACE_DISPLAY_EASE
                      }}
                    >
                      {ticketStatusLine}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ) : (
            <motion.p
              key='idle'
              className='text-muted-foreground max-w-lg px-[max(0.5rem,env(safe-area-inset-left))] font-medium'
              style={{
                fontSize: 'clamp(1rem, min(4vmin, 5vw), 2.75rem)'
              }}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{
                duration: motionDurShort,
                ease: WORKPLACE_DISPLAY_EASE
              }}
            >
              {t('idle_no_ticket')}
            </motion.p>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function WorkplaceDisplayPage() {
  return (
    <Suspense
      fallback={
        <div className='flex flex-1 items-center justify-center p-6'>
          <p className='text-muted-foreground'>Loading…</p>
        </div>
      }
    >
      <WorkplaceDisplayIntlRoot />
    </Suspense>
  );
}

/**
 * Locale: `defaultLocale` from pairing (stored at bootstrap) is primary when the terminal is paired.
 * Optional `?lang=` / `?locale=` overrides; otherwise falls back to the `[locale]` route segment.
 */
function WorkplaceDisplayIntlRoot() {
  const routeLocaleRaw = useLocale();
  const searchParams = useSearchParams();
  const routeLocale: Locale = locales.includes(routeLocaleRaw as Locale)
    ? (routeLocaleRaw as Locale)
    : 'en';
  const langQ = (
    searchParams.get('lang') ??
    searchParams.get('locale') ??
    ''
  ).toLowerCase();
  const queryLocale: Locale | null =
    langQ && locales.includes(langQ as Locale) ? (langQ as Locale) : null;

  const [pairedLocale, setPairedLocale] = useState<Locale | null>(() =>
    readStoredCounterBoardLocale()
  );

  useEffect(() => {
    const sync = () => setPairedLocale(readStoredCounterBoardLocale());
    sync();
    window.addEventListener(COUNTER_BOARD_STORAGE_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(COUNTER_BOARD_STORAGE_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const effectiveLocale: Locale = queryLocale ?? pairedLocale ?? routeLocale;

  const t = useTranslations('counter_board');
  return (
    <CounterDisplaySessionIntlProvider routeLocale={effectiveLocale}>
      <Suspense
        fallback={
          <div className='flex flex-1 items-center justify-center p-6'>
            <p className='text-muted-foreground'>{t('loading')}</p>
          </div>
        }
      >
        <WorkplaceDisplayPageInner />
      </Suspense>
    </CounterDisplaySessionIntlProvider>
  );
}
