'use client';

import type { ReactNode } from 'react';

import { MarketingThemeProvider } from './marketing-theme';

export function Providers({ children }: { children: ReactNode }) {
  return <MarketingThemeProvider>{children}</MarketingThemeProvider>;
}
