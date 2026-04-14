'use client';

import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/components/ui/button';
import { locales, messages, type Locale } from '@/i18n';

function toLocale(value: string): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : 'en';
}

type SessionLocaleContextValue = {
  routeLocale: Locale;
  sessionLocale: Locale;
  setSessionLocale: (locale: Locale) => void;
  resetSessionLocale: () => void;
};

const SessionLocaleContext = createContext<SessionLocaleContextValue | null>(
  null
);

export function useCounterDisplaySessionLocale() {
  const ctx = useContext(SessionLocaleContext);
  if (!ctx) {
    throw new Error(
      'useCounterDisplaySessionLocale must be used within CounterDisplaySessionIntlProvider'
    );
  }
  return ctx;
}

type ProviderProps = { routeLocale: string; children: ReactNode };

export function CounterDisplaySessionIntlProvider({
  routeLocale: routeLocaleProp,
  children
}: ProviderProps) {
  const routeLocale = toLocale(routeLocaleProp);
  const [sessionLocale, setSessionLocaleState] = useState<Locale>(routeLocale);

  useEffect(() => {
    setSessionLocaleState(routeLocale);
  }, [routeLocale]);

  const setSessionLocale = useCallback((locale: Locale) => {
    setSessionLocaleState(locale);
  }, []);

  const resetSessionLocale = useCallback(() => {
    setSessionLocaleState(routeLocale);
  }, [routeLocale]);

  const ctx = useMemo(
    (): SessionLocaleContextValue => ({
      routeLocale,
      sessionLocale,
      setSessionLocale,
      resetSessionLocale
    }),
    [routeLocale, sessionLocale, setSessionLocale, resetSessionLocale]
  );

  return (
    <NextIntlClientProvider
      locale={sessionLocale}
      messages={messages[sessionLocale]}
    >
      <SessionLocaleContext.Provider value={ctx}>
        {children}
      </SessionLocaleContext.Provider>
    </NextIntlClientProvider>
  );
}

/** Compact EN/RU switch; label shows the language you switch to. */
export function CounterDisplayLanguageButton({
  className
}: {
  className?: string;
}) {
  const { sessionLocale, setSessionLocale } = useCounterDisplaySessionLocale();
  const t = useTranslations('counter_display');
  const target: Locale = sessionLocale === 'en' ? 'ru' : 'en';

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      className={className}
      onClick={() => setSessionLocale(target)}
      aria-label={target === 'en' ? t('switch_to_en') : t('switch_to_ru')}
    >
      {target === 'en' ? 'EN' : 'RU'}
    </Button>
  );
}

export function pairingThanksToastMessage(routeLocale: Locale): string {
  const pack = messages[routeLocale] as Record<string, unknown> & {
    counter_display?: { thanks?: string };
  };
  return pack.counter_display?.thanks ?? 'Thank you!';
}
