'use client';

import { useServerInsertedHTML } from 'next/navigation';
import * as React from 'react';

import { LOCALE_BOOTSTRAP_SCRIPT } from './locale-bootstrap-script';
import { MARKETING_THEME_STORAGE_KEY } from './theme-constants';
import { THEME_BOOTSTRAP_SCRIPT } from './theme-bootstrap-script';

export type ThemeSetting = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: ThemeSetting;
  resolvedTheme: 'light' | 'dark';
  setTheme: (value: ThemeSetting) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function systemPreference(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function resolveTheme(theme: ThemeSetting): 'light' | 'dark' {
  if (theme === 'system') return systemPreference();
  return theme;
}

function readStoredTheme(): ThemeSetting {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(MARKETING_THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyDom(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function MarketingThemeProvider({
  children
}: {
  children: React.ReactNode;
}) {
  useServerInsertedHTML(() => (
    <script
      id='qq-marketing-theme-init'
      dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
    />
  ));

  useServerInsertedHTML(() => (
    <script
      id='qq-marketing-locale-init'
      dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }}
    />
  ));

  const [theme, setThemeState] = React.useState<ThemeSetting>(() =>
    readStoredTheme()
  );
  const [mounted, setMounted] = React.useState(false);

  React.useLayoutEffect(() => {
    setThemeState(readStoredTheme());
    setMounted(true);
  }, []);

  const resolvedTheme = React.useMemo((): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light';
    if (theme === 'light' || theme === 'dark') return theme;
    const root = document.documentElement;
    if (root.classList.contains('dark')) return 'dark';
    if (root.classList.contains('light')) return 'light';
    return systemPreference();
  }, [theme]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    applyDom(resolveTheme(theme));
  }, [theme]);

  React.useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') applyDom(systemPreference());
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mounted, theme]);

  const setTheme = React.useCallback((value: ThemeSetting) => {
    try {
      localStorage.setItem(MARKETING_THEME_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    setThemeState(value);
  }, []);

  const value = React.useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme
    }),
    [theme, resolvedTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useMarketingTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      'useMarketingTheme must be used within MarketingThemeProvider'
    );
  }
  return ctx;
}
