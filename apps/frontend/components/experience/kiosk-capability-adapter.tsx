'use client';

import type { ReactNode } from 'react';

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

export function KioskCapabilityAdapterProvider({
  children
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
