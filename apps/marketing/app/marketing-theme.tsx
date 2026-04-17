'use client';

import { useServerInsertedHTML } from 'next/navigation';
import * as React from 'react';

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

  const [theme, setThemeState] = React.useState<ThemeSetting>('system');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setThemeState(readStoredTheme());
    setMounted(true);
  }, []);

  const resolvedTheme = React.useMemo(
    () => (mounted ? resolveTheme(theme) : 'light'),
    [mounted, theme]
  );

  React.useEffect(() => {
    if (!mounted) return;
    applyDom(resolveTheme(theme));
  }, [mounted, theme]);

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
    throw new Error('useMarketingTheme must be used within MarketingThemeProvider');
  }
  return ctx;
}
