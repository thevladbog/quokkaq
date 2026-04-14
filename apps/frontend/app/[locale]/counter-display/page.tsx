'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent
} from 'react';
import type { AdScreenConfig } from '@quokkaq/shared-types';
import { parseGuestSurveyIdleScreenForDisplay } from '@quokkaq/shared-types';
import {
  ApiHttpError,
  COUNTER_DISPLAY_TOKEN_KEY,
  COUNTER_DISPLAY_UNIT_KEY,
  terminalAuthBootstrap
} from '@/lib/api';
import {
  guestSurveySession,
  guestSurveySubmitResponse,
  type ServicesGuestSurveySession
} from '@/lib/api/generated/guest-survey-terminal';
import { GuestSurveyCompletionMarkdown } from '@/components/guest-survey/guest-survey-completion-markdown';
import { pickCompletionMarkdown } from '@/lib/guest-survey-completion';
import { socketClient } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, Settings2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isGuestSurveyIconScale,
  parseGuestSurveyForDisplay,
  type GuestSurveyDisplayBlock,
  type GuestSurveyIconPreset
} from '@/lib/guest-survey-blocks';
import { resolveCounterDisplayAppearance } from '@/lib/guest-survey-counter-display-theme';
import {
  CounterDisplayLanguageButton,
  CounterDisplaySessionIntlProvider,
  pairingThanksToastMessage,
  useCounterDisplaySessionLocale
} from './counter-display-session-intl';
import { CounterDisplayIdleSlideshow } from './counter-display-idle-slideshow';

function blockLabel(b: GuestSurveyDisplayBlock, locale: string): string {
  const l = b.label;
  if (!l) return b.id;
  return l[locale] ?? l.en ?? l.ru ?? b.id;
}

function iconScaleRowComplete(
  blocks: GuestSurveyDisplayBlock[],
  scaleValues: Partial<Record<string, number>>
): boolean {
  return blocks.every((b) => {
    if (b.kind !== 'scale') return true;
    if (isGuestSurveyIconScale(b)) {
      return typeof scaleValues[b.id] === 'number';
    }
    return true;
  });
}

function GuestSurveyIconScaleRow({
  preset,
  value,
  onPick,
  ariaRatingLabel
}: {
  preset: GuestSurveyIconPreset;
  value: number | undefined;
  onPick: (n: number) => void;
  ariaRatingLabel: (n: number) => string;
}) {
  const reduceMotion = useReducedMotion();
  const Icon = preset === 'hearts_red' ? Heart : Star;
  const filledStar =
    'text-amber-400 fill-amber-400 stroke-amber-600 drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]';
  const filledHeart =
    'text-red-500 fill-red-500 stroke-red-700 drop-shadow-[0_0_10px_rgba(239,68,68,0.35)]';
  const outline = 'text-muted-foreground/55 fill-none stroke-current';

  return (
    <div
      className='flex flex-wrap justify-center gap-3 md:gap-6'
      role='radiogroup'
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value !== undefined && n <= value;
        return (
          <button
            key={n}
            type='button'
            role='radio'
            aria-checked={value === n}
            aria-label={ariaRatingLabel(n)}
            className={cn(
              'flex h-[5.25rem] min-h-[5.25rem] min-w-[5.25rem] items-center justify-center rounded-2xl border-2 border-transparent p-2 transition-colors md:h-[6.75rem] md:min-h-[6.75rem] md:min-w-[6.75rem]',
              'hover:bg-primary/10 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              value === n && 'border-primary/40 bg-primary/5'
            )}
            onClick={() => onPick(n)}
          >
            <motion.span
              className='inline-flex items-center justify-center will-change-transform'
              initial={false}
              animate={
                filled
                  ? reduceMotion
                    ? { scale: 1 }
                    : { scale: [0.82, 1.14, 1] }
                  : { scale: 1 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 0.42,
                      ease: [0.22, 1.24, 0.36, 1]
                    }
              }
            >
              <Icon
                strokeWidth={filled ? 1.65 : 2}
                className={cn(
                  'h-[3.35rem] w-[3.35rem] transition-[fill,stroke,color,filter] duration-300 ease-out md:h-[4.75rem] md:w-[4.75rem]',
                  filled
                    ? preset === 'hearts_red'
                      ? filledHeart
                      : filledStar
                    : outline
                )}
              />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}

function parseAdScreen(
  unitConfig: Record<string, unknown> | undefined
): Partial<AdScreenConfig> | undefined {
  if (!unitConfig) return undefined;
  const raw = unitConfig.adScreen;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as Partial<AdScreenConfig>;
}

function CounterDisplayPageInner() {
  const t = useTranslations('counter_display');
  const locale = useLocale();
  const { resetSessionLocale, routeLocale } = useCounterDisplaySessionLocale();
  const qc = useQueryClient();

  const [pairCode, setPairCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [scaleValues, setScaleValues] = useState<
    Partial<Record<string, number>>
  >({});
  const [surveyStepIndex, setSurveyStepIndex] = useState(0);
  const [resetTapCount, setResetTapCount] = useState(0);
  const resetTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTapTimerRef.current) {
        clearTimeout(resetTapTimerRef.current);
      }
    };
  }, []);

  // Client-only: read pairing from localStorage after mount (avoid SSR/localStorage skew).
  /* eslint-disable react-hooks/set-state-in-effect -- hydrate terminal pairing from localStorage */
  useEffect(() => {
    const tok = localStorage.getItem(COUNTER_DISPLAY_TOKEN_KEY);
    const uid = localStorage.getItem(COUNTER_DISPLAY_UNIT_KEY);
    if (tok && uid) {
      setToken(tok);
      setUnitId(uid);
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sessionQuery = useQuery({
    queryKey: ['guest-survey-session', unitId, token],
    queryFn: async ({ signal }) => {
      const res = await guestSurveySession(unitId!, {
        signal,
        headers: { Authorization: `Bearer ${token}` }
      });
      // terminalOrvalMutator throws on non-OK; narrowed type for OpenAPI union.
      return res.data as ServicesGuestSurveySession;
    },
    enabled: Boolean(hydrated && token && unitId),
    refetchInterval: 5000,
    retry: 1
  });

  const session = sessionQuery.data;

  useEffect(() => {
    if (!unitId || !token) return;
    socketClient.connect(unitId);
    const bump = () => {
      qc.invalidateQueries({ queryKey: ['guest-survey-session', unitId] });
    };
    socketClient.on('ticket.updated', bump);
    socketClient.on('counter.updated', bump);
    return () => {
      socketClient.off('ticket.updated', bump);
      socketClient.off('counter.updated', bump);
      socketClient.disconnect();
    };
  }, [unitId, token, qc]);

  const surveyKey = useMemo(() => {
    if (!session?.activeTicket?.id || !session.survey?.id) return null;
    return `${session.activeTicket.id}:${session.survey.id}`;
  }, [session?.activeTicket?.id, session?.survey?.id]);

  const { displayMode: surveyDisplayMode, blocks: surveyBlocks } = useMemo(
    () => parseGuestSurveyForDisplay(session?.survey?.questions),
    [session?.survey?.questions]
  );

  const isSurveyStepped = surveyDisplayMode === 'stepped';

  const visibleSurveyBlocks = useMemo(() => {
    if (!isSurveyStepped) return surveyBlocks;
    const b = surveyBlocks[surveyStepIndex];
    return b ? [b] : [];
  }, [isSurveyStepped, surveyBlocks, surveyStepIndex]);

  const isLastSurveyStep =
    surveyBlocks.length === 0 || surveyStepIndex >= surveyBlocks.length - 1;

  const showSurveyNext = isSurveyStepped && !isLastSurveyStep;

  const currentStepScaleReady = iconScaleRowComplete(
    visibleSurveyBlocks,
    scaleValues
  );
  const allIconScalesReady = iconScaleRowComplete(surveyBlocks, scaleValues);

  const prevSurveyKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSurveyKeyRef.current;
    prevSurveyKeyRef.current = surveyKey;
    if (prev != null && surveyKey != null && prev !== surveyKey) {
      resetSessionLocale();
    }
  }, [surveyKey, resetSessionLocale]);

  /* eslint-disable react-hooks/set-state-in-effect -- reset wizard step for new ticket/survey */
  useEffect(() => {
    setSurveyStepIndex(0);
  }, [surveyKey]);
  useEffect(() => {
    setScaleValues({});
  }, [surveyKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const scaleBlocks = useMemo(
    () =>
      surveyBlocks.filter(
        (b): b is Extract<GuestSurveyDisplayBlock, { kind: 'scale' }> =>
          b.kind === 'scale'
      ),
    [surveyBlocks]
  );

  const adScreen = useMemo(
    () => parseAdScreen(session?.unitConfig as Record<string, unknown>),
    [session?.unitConfig]
  );

  const parsedIdleScreen = useMemo(
    () => parseGuestSurveyIdleScreenForDisplay(session?.idleScreen),
    [session?.idleScreen]
  );
  const useCustomIdle =
    parsedIdleScreen !== null && parsedIdleScreen.slides.length > 0;

  const submitMut = useMutation({
    mutationFn: async () => {
      const ticketId = session?.activeTicket?.id;
      const surveyId = session?.survey?.id;
      if (!token || !unitId || !ticketId || !surveyId) {
        throw new Error('session');
      }
      const answers: Record<string, number> = {};
      for (const q of scaleBlocks) {
        if (isGuestSurveyIconScale(q)) {
          const v = scaleValues[q.id];
          if (typeof v !== 'number') {
            throw new Error('incomplete');
          }
          answers[q.id] = v;
        } else {
          answers[q.id] = scaleValues[q.id] ?? q.min;
        }
      }
      await guestSurveySubmitResponse(
        unitId,
        {
          ticketId,
          surveyId,
          answers
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    },
    onSuccess: () => {
      resetSessionLocale();
      toast.success(pairingThanksToastMessage(routeLocale));
      qc.invalidateQueries({ queryKey: ['guest-survey-session', unitId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : t('pair_error'));
    }
  });

  const handlePair = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const code = pairCode.trim();
      if (!code) return;
      try {
        const res = await terminalAuthBootstrap(code);
        if (!res.counterId) {
          toast.error(t('wrong_terminal_type'));
          return;
        }
        localStorage.setItem(COUNTER_DISPLAY_TOKEN_KEY, res.token);
        localStorage.setItem(COUNTER_DISPLAY_UNIT_KEY, res.unitId);
        setToken(res.token);
        setUnitId(res.unitId);
        setPairCode('');
      } catch (err) {
        if (err instanceof ApiHttpError && err.status === 403) {
          toast.error(t('feature_locked'));
          return;
        }
        toast.error(t('pair_error'));
      }
    },
    [pairCode, t]
  );

  const handleReset = useCallback(() => {
    if (resetTapTimerRef.current) {
      clearTimeout(resetTapTimerRef.current);
      resetTapTimerRef.current = null;
    }
    setResetTapCount(0);
    localStorage.removeItem(COUNTER_DISPLAY_TOKEN_KEY);
    localStorage.removeItem(COUNTER_DISPLAY_UNIT_KEY);
    setToken(null);
    setUnitId(null);
    resetSessionLocale();
    qc.removeQueries({ queryKey: ['guest-survey-session'] });
  }, [qc, resetSessionLocale]);

  const RESET_TAP_TARGET = 5;
  const RESET_TAP_WINDOW_MS = 4000;

  const handleResetIconPress = useCallback(() => {
    const next = resetTapCount + 1;
    if (next >= RESET_TAP_TARGET) {
      if (resetTapTimerRef.current) {
        clearTimeout(resetTapTimerRef.current);
        resetTapTimerRef.current = null;
      }
      setResetTapCount(0);
      handleReset();
      return;
    }
    setResetTapCount(next);
    if (resetTapTimerRef.current) {
      clearTimeout(resetTapTimerRef.current);
    }
    resetTapTimerRef.current = setTimeout(() => {
      setResetTapCount(0);
      resetTapTimerRef.current = null;
    }, RESET_TAP_WINDOW_MS);
  }, [resetTapCount, handleReset]);

  if (!hydrated) {
    return (
      <div className='relative flex flex-1 items-center justify-center p-6'>
        <div className='absolute top-4 right-4 z-10'>
          <CounterDisplayLanguageButton className='text-muted-foreground border-border h-10 min-w-10 px-3 font-semibold' />
        </div>
        <p className='text-muted-foreground'>{t('loading')}</p>
      </div>
    );
  }

  if (!token || !unitId) {
    return (
      <div className='relative flex flex-1 flex-col items-center justify-center gap-6 p-6'>
        <div className='absolute top-4 right-4 z-10'>
          <CounterDisplayLanguageButton className='text-muted-foreground border-border h-10 min-w-10 px-3 font-semibold' />
        </div>
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
            <Label htmlFor='cd-code'>{t('code_label')}</Label>
            <Input
              id='cd-code'
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
      <div className='relative flex flex-1 items-center justify-center p-6'>
        <div className='absolute top-4 right-4 z-10'>
          <CounterDisplayLanguageButton className='text-muted-foreground border-border h-10 min-w-10 px-3 font-semibold' />
        </div>
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
        <div className='absolute top-4 right-4 z-10'>
          <CounterDisplayLanguageButton className='text-muted-foreground border-border h-10 min-w-10 px-3 font-semibold' />
        </div>
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

  const appearance = resolveCounterDisplayAppearance(
    adScreen,
    session.survey?.displayTheme
  );
  const rootStyle: CSSProperties = {
    ...(appearance.rootCssVariables as CSSProperties),
    ...(appearance.bodyBackground
      ? { backgroundColor: appearance.bodyBackground }
      : {})
  };
  const headerStyle: CSSProperties | undefined = appearance.headerBackground
    ? { backgroundColor: appearance.headerBackground }
    : undefined;

  const showSurvey =
    session.activeTicket?.status === 'in_service' &&
    session.survey &&
    surveyBlocks.length > 0 &&
    surveyKey &&
    !session.activeSurveySubmitted;

  const showThanks =
    session.activeTicket?.status === 'in_service' &&
    session.survey &&
    surveyKey &&
    session.activeSurveySubmitted;

  const thanksMarkdown =
    showThanks && session.survey
      ? pickCompletionMarkdown(session.survey.completionMessage, locale)
      : null;

  const showNoSurveyConfigured =
    session.activeTicket?.status === 'in_service' && session.survey == null;

  const showNoSurveyHint = showNoSurveyConfigured && !useCustomIdle;

  const compactIdleMainGutters =
    !showThanks && !showSurvey && useCustomIdle && Boolean(token);

  return (
    <div className='flex min-h-dvh flex-1 flex-col' style={rootStyle}>
      <header
        className='border-border/40 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3'
        style={headerStyle}
      >
        <div className='flex min-w-0 flex-1 items-stretch gap-3'>
          <div className='flex min-w-0 flex-col'>
            <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {t('counter_label')}
            </p>
            <p className='truncate font-mono text-xl leading-snug font-semibold tracking-tight tabular-nums'>
              {session.counterName}
            </p>
          </div>
          {session.activeTicket ? (
            <>
              <div
                className='bg-border/40 w-px shrink-0 self-stretch'
                aria-hidden
              />
              <div className='flex min-w-0 shrink-0 flex-col'>
                <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {t('ticket_label')}
                </p>
                <p className='font-mono text-xl leading-snug font-semibold tracking-tight tabular-nums'>
                  {session.activeTicket.queueNumber}
                </p>
              </div>
            </>
          ) : null}
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <CounterDisplayLanguageButton className='text-muted-foreground border-border h-10 min-w-10 px-3 font-semibold' />
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='text-muted-foreground hover:text-foreground h-10 w-10 shrink-0'
            onClick={handleResetIconPress}
            aria-label={t('reset_icon_aria')}
          >
            <Settings2 className='h-5 w-5' />
          </Button>
        </div>
      </header>

      <main
        className={
          compactIdleMainGutters
            ? 'flex min-h-0 flex-1 flex-col px-0 py-2 md:py-3'
            : 'flex min-h-0 flex-1 flex-col px-4 py-6 md:px-8 md:py-10'
        }
      >
        {showThanks ? (
          <div className='flex flex-1 flex-col items-center justify-center gap-4 px-2 text-center'>
            {thanksMarkdown ? (
              <GuestSurveyCompletionMarkdown
                markdown={thanksMarkdown}
                imageBearerToken={token}
                className='text-foreground [&_a]:text-primary mx-auto max-w-2xl text-center [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-semibold md:[&_h1]:text-4xl [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_img]:mx-auto [&_ol]:mx-auto [&_ol]:inline-block [&_ol]:max-w-xl [&_ol]:text-left [&_p]:text-lg [&_p]:leading-relaxed md:[&_p]:text-xl [&_ul]:mx-auto [&_ul]:inline-block [&_ul]:max-w-xl [&_ul]:text-left'
              />
            ) : (
              <p className='text-3xl font-semibold tracking-tight md:text-5xl'>
                {t('thanks')}
              </p>
            )}
          </div>
        ) : showSurvey ? (
          <div className='flex flex-1 flex-col items-center justify-center'>
            <div className='flex w-full max-w-2xl -translate-y-6 flex-col gap-10 md:max-w-3xl md:-translate-y-10 md:gap-12'>
              <div className='space-y-10 md:space-y-12'>
                {visibleSurveyBlocks.map((b, idx) =>
                  b.kind === 'info' ? (
                    <div
                      key={`info-${b.id}-${isSurveyStepped ? surveyStepIndex : idx}`}
                      className='text-muted-foreground px-2 text-center text-xl leading-relaxed font-medium md:text-2xl'
                    >
                      {blockLabel(b, locale)}
                    </div>
                  ) : (
                    <div
                      key={`scale-${b.id}-${isSurveyStepped ? surveyStepIndex : idx}`}
                      className='space-y-5 md:space-y-6'
                    >
                      <p className='text-center text-2xl font-semibold tracking-tight md:text-3xl'>
                        {blockLabel(b, locale)}
                      </p>
                      {isGuestSurveyIconScale(b) ? (
                        <GuestSurveyIconScaleRow
                          preset={b.iconPreset}
                          value={scaleValues[b.id]}
                          onPick={(n) =>
                            setScaleValues((prev) => ({
                              ...prev,
                              [b.id]: n
                            }))
                          }
                          ariaRatingLabel={(n) =>
                            t('scale_icon_rating_aria', { n: String(n) })
                          }
                        />
                      ) : (
                        <div className='flex flex-wrap justify-center gap-3 md:gap-4'>
                          {Array.from(
                            { length: b.max - b.min + 1 },
                            (_, i) => b.min + i
                          ).map((n) => (
                            <Button
                              key={n}
                              type='button'
                              variant={
                                (scaleValues[b.id] ?? b.min) === n
                                  ? 'default'
                                  : 'outline'
                              }
                              className='h-16 min-w-16 rounded-xl text-2xl font-semibold md:h-20 md:min-w-20 md:text-3xl'
                              onClick={() =>
                                setScaleValues((prev) => ({
                                  ...prev,
                                  [b.id]: n
                                }))
                              }
                            >
                              {n}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
              {showSurveyNext ? (
                <Button
                  type='button'
                  className='h-14 w-full text-lg font-semibold md:h-16 md:text-xl'
                  disabled={!currentStepScaleReady}
                  onClick={() => setSurveyStepIndex((i) => i + 1)}
                >
                  {t('next')}
                </Button>
              ) : (
                <Button
                  type='button'
                  className='h-14 w-full text-lg font-semibold md:h-16 md:text-xl'
                  disabled={submitMut.isPending || !allIconScalesReady}
                  onClick={() => submitMut.mutate()}
                >
                  {submitMut.isPending ? t('loading') : t('submit')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center md:gap-8'>
            {useCustomIdle && parsedIdleScreen && token ? (
              <CounterDisplayIdleSlideshow
                idle={parsedIdleScreen}
                bearerToken={token}
                locale={locale}
              />
            ) : (
              <>
                {adScreen?.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={adScreen.logoUrl}
                    alt=''
                    className='max-h-32 max-w-[80%] object-contain'
                  />
                ) : null}
                <div>
                  <h2 className='text-3xl font-bold tracking-tight'>
                    {t('idle_title')}
                  </h2>
                  {showNoSurveyHint ? (
                    <p className='text-muted-foreground mt-3 max-w-md text-sm'>
                      {t('no_survey')}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function CounterDisplayPage() {
  const routeLocale = useLocale();
  return (
    <CounterDisplaySessionIntlProvider routeLocale={routeLocale}>
      <CounterDisplayPageInner />
    </CounterDisplaySessionIntlProvider>
  );
}
