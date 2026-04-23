'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import {
  type KioskA11yFontStep,
  type KioskA11yPersisted,
  readKioskA11yFromStorage,
  writeKioskA11yToStorage
} from '@/lib/kiosk-accessibility-storage';

export type KioskAccessibilityContextValue = KioskA11yPersisted & {
  setFontStep: (step: KioskA11yFontStep) => void;
  cycleFontStep: () => void;
  setHighContrast: (v: boolean) => void;
  toggleHighContrast: () => void;
  setTtsEnabled: (v: boolean) => void;
  setTtsSpeakAloud: (v: boolean) => void;
};

const KioskAccessibilityContext = createContext<
  KioskAccessibilityContextValue | undefined
>(undefined);

export function KioskAccessibilityProvider({
  children
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<KioskA11yPersisted>(() =>
    readKioskA11yFromStorage()
  );

  const setFontStep = useCallback((fontStep: KioskA11yFontStep) => {
    setState((prev) => {
      const next = { ...prev, fontStep };
      writeKioskA11yToStorage(next);
      return next;
    });
  }, []);

  const cycleFontStep = useCallback(() => {
    setState((prev) => {
      const n = ((prev.fontStep + 1) % 3) as KioskA11yFontStep;
      const next = { ...prev, fontStep: n };
      writeKioskA11yToStorage(next);
      return next;
    });
  }, []);

  const setHighContrast = useCallback((highContrast: boolean) => {
    setState((prev) => {
      const next = { ...prev, highContrast };
      writeKioskA11yToStorage(next);
      return next;
    });
  }, []);

  const toggleHighContrast = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, highContrast: !prev.highContrast };
      writeKioskA11yToStorage(next);
      return next;
    });
  }, []);

  const setTtsEnabled = useCallback((ttsEnabled: boolean) => {
    setState((prev) => {
      const next = { ...prev, ttsEnabled };
      writeKioskA11yToStorage(next);
      return next;
    });
  }, []);

  const setTtsSpeakAloud = useCallback((ttsSpeakAloud: boolean) => {
    setState((prev) => {
      const next = { ...prev, ttsSpeakAloud };
      writeKioskA11yToStorage(next);
      return next;
    });
  }, []);

  const value = useMemo<KioskAccessibilityContextValue>(
    () => ({
      ...state,
      setFontStep,
      cycleFontStep,
      setHighContrast,
      toggleHighContrast,
      setTtsEnabled,
      setTtsSpeakAloud
    }),
    [
      state,
      setFontStep,
      cycleFontStep,
      setHighContrast,
      toggleHighContrast,
      setTtsEnabled,
      setTtsSpeakAloud
    ]
  );

  return (
    <KioskAccessibilityContext.Provider value={value}>
      {children}
    </KioskAccessibilityContext.Provider>
  );
}

export function useKioskA11y(): KioskAccessibilityContextValue {
  const c = useContext(KioskAccessibilityContext);
  if (!c) {
    throw new Error(
      'useKioskA11y must be used within KioskAccessibilityProvider'
    );
  }
  return c;
}
