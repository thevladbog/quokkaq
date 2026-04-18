'use client';

import type { ReactNode } from 'react';

import { DocumentScrollHint } from './document-scroll-hint';
import { MarketingThemeProvider } from './marketing-theme';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MarketingThemeProvider>
      <DocumentScrollHint />
      {children}
    </MarketingThemeProvider>
  );
}
