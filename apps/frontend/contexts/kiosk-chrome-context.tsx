'use client';

import { createContext, useContext, type ReactNode } from 'react';

type KioskChrome = {
  /** Kiosk is dark (luma) or a11y HC — use dark token subtree on portaled modals / sheets. */
  modalsDark: boolean;
};

const KioskChromeContext = createContext<KioskChrome | null>(null);

export function KioskChromeProvider({
  modalsDark,
  children
}: {
  modalsDark: boolean;
  children: ReactNode;
}) {
  return (
    <KioskChromeContext.Provider value={{ modalsDark }}>
      {children}
    </KioskChromeContext.Provider>
  );
}

export function useKioskChrome(): KioskChrome {
  return useContext(KioskChromeContext) ?? { modalsDark: false };
}
