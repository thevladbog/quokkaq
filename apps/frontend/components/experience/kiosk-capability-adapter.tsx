'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type KioskTicket = {
  id: string;
  queueNumber: string;
  serviceName?: string;
  visitorToken?: string;
};

export type KioskCapabilityAdapter = {
  printTicket?: (ticket: KioskTicket) => Promise<void>;
  identify?: (mode: string) => Promise<Record<string, unknown>>;
  scanDocument?: () => Promise<Record<string, unknown>>;
  checkInAppointment?: () => Promise<KioskTicket>;
  connectivity?: {
    isOnline: () => boolean;
    subscribe: (listener: (online: boolean) => void) => () => void;
  };
  tts?: (text: string) => Promise<void>;
  reset: () => void | Promise<void>;
};

const KioskCapabilityContext = createContext<KioskCapabilityAdapter | null>(
  null
);

export function KioskCapabilityAdapterProvider({
  adapter,
  children
}: {
  children: ReactNode;
  adapter: KioskCapabilityAdapter;
}) {
  return (
    <KioskCapabilityContext.Provider value={adapter}>
      {children}
    </KioskCapabilityContext.Provider>
  );
}

export function useKioskCapabilities(): KioskCapabilityAdapter {
  const adapter = useContext(KioskCapabilityContext);
  if (!adapter) {
    throw new Error('Kiosk capability adapter is not configured');
  }
  return adapter;
}
