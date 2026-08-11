'use client';

import { useEffect, useState } from 'react';

import {
  terminalAuthBootstrap,
  terminalBootstrapDisplayLocale,
  type TerminalBootstrapResponse
} from '@/lib/api';
import {
  acknowledgeTerminalExperience,
  type TerminalExperienceAcknowledgement
} from './experience-api';
import {
  loadRuntimeManifest,
  type RuntimeManifestResult
} from './runtime-manifest';

export const KIOSK_TERMINAL_KIND = 'kiosk' as const;

type StoredTicketStationPairing = {
  terminalToken: string;
  terminalKind: typeof KIOSK_TERMINAL_KIND;
  unitId: string;
  defaultLocale: string;
};

export type TicketStationRuntimeState = {
  terminalToken: string | null;
  terminalKind: string | null;
  defaultLocale: string | null;
  manifest: RuntimeManifestResult | null;
  pairing: 'idle' | 'pairing' | 'paired' | 'error';
  pairingError: string | null;
};

export function ticketStationStorageKeys(unitId: string) {
  const scopedUnitId = unitId.trim();
  return {
    token: `quokkaq_ticket_station_token:${scopedUnitId}`,
    locale: `quokkaq_ticket_station_locale:${scopedUnitId}`
  } as const;
}

export function removeTicketStationPairingCode(url: string): string {
  const parsed = new URL(url, 'https://quokkaq.invalid');
  parsed.searchParams.delete('code');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function parseTicketStationPairing(
  response: TerminalBootstrapResponse,
  expectedUnitId: string
): StoredTicketStationPairing {
  if (response.terminalKind !== KIOSK_TERMINAL_KIND) {
    throw new Error('terminal kind is not kiosk');
  }
  if (response.unitId !== expectedUnitId) {
    throw new Error('terminal unit mismatch');
  }
  if (!response.token.trim()) {
    throw new Error('terminal token is empty');
  }
  return {
    terminalToken: response.token,
    terminalKind: KIOSK_TERMINAL_KIND,
    unitId: response.unitId,
    defaultLocale: terminalBootstrapDisplayLocale(response.defaultLocale)
  };
}

function readStoredPairing(unitId: string): StoredTicketStationPairing | null {
  if (typeof window === 'undefined') return null;
  const keys = ticketStationStorageKeys(unitId);
  try {
    const token = window.localStorage.getItem(keys.token)?.trim();
    if (!token) return null;
    return {
      terminalToken: token,
      terminalKind: KIOSK_TERMINAL_KIND,
      unitId,
      defaultLocale: window.localStorage.getItem(keys.locale) ?? 'en'
    };
  } catch {
    return null;
  }
}

function storePairing(pairing: StoredTicketStationPairing): void {
  if (typeof window === 'undefined') return;
  const keys = ticketStationStorageKeys(pairing.unitId);
  try {
    window.localStorage.setItem(keys.token, pairing.terminalToken);
    window.localStorage.setItem(keys.locale, pairing.defaultLocale);
  } catch {
    // Pairing remains valid for this session even when persistent storage is unavailable.
  }
}

function acknowledgementKey(
  token: string,
  acknowledgement: TerminalExperienceAcknowledgement
): string {
  return `${token}:${acknowledgement.status}:${acknowledgement.versionId}`;
}

const acknowledgedManifestVersions = new Set<string>();

export function useTicketStationRuntime({
  unitId,
  pairingCode
}: {
  unitId: string | undefined;
  pairingCode?: string | null;
}): TicketStationRuntimeState {
  const [pairing, setPairing] = useState<StoredTicketStationPairing | null>(
    null
  );
  const [pairingStatus, setPairingStatus] =
    useState<TicketStationRuntimeState['pairing']>('idle');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<RuntimeManifestResult | null>(null);

  useEffect(() => {
    if (!unitId) return;
    const stored = readStoredPairing(unitId);
    if (stored) {
      setPairing(stored);
      setPairingStatus('paired');
    }
  }, [unitId]);

  useEffect(() => {
    if (!unitId || !pairingCode?.trim()) return;
    let cancelled = false;
    setPairingStatus('pairing');
    setPairingError(null);
    void terminalAuthBootstrap(pairingCode)
      .then((response) => parseTicketStationPairing(response, unitId))
      .then((next) => {
        if (cancelled) return;
        storePairing(next);
        setPairing(next);
        setPairingStatus('paired');
        window.history.replaceState(
          {},
          '',
          removeTicketStationPairingCode(window.location.href)
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPairing(null);
        setPairingStatus('error');
        setPairingError(
          error instanceof Error ? error.message : 'pairing failed'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [pairingCode, unitId]);

  useEffect(() => {
    if (!pairing || pairing.unitId !== unitId) {
      setManifest(null);
      return;
    }
    let cancelled = false;
    setManifest(null);
    void loadRuntimeManifest({
      terminalId: pairing.unitId,
      terminalToken: pairing.terminalToken
    }).then((result) => {
      if (!cancelled) setManifest(result);
    });
    return () => {
      cancelled = true;
    };
  }, [pairing, unitId]);

  useEffect(() => {
    if (!pairing || !manifest) return;
    const acknowledgement: TerminalExperienceAcknowledgement | undefined =
      manifest.mode === 'rejected'
        ? manifest.acknowledgement
        : manifest.mode === 'online' || manifest.mode === 'cached'
          ? {
              status: 'applied',
              versionId: manifest.manifest.versionId
            }
          : undefined;
    if (!acknowledgement) return;
    const key = acknowledgementKey(pairing.terminalToken, acknowledgement);
    if (acknowledgedManifestVersions.has(key)) return;
    acknowledgedManifestVersions.add(key);
    void acknowledgeTerminalExperience(
      pairing.terminalToken,
      acknowledgement
    ).catch(() => {
      // The terminal remains on legacy; acknowledgement is best effort.
    });
  }, [manifest, pairing]);

  return {
    terminalToken: pairing?.terminalToken ?? null,
    terminalKind: pairing?.terminalKind ?? null,
    defaultLocale: pairing?.defaultLocale ?? null,
    manifest,
    pairing: pairingStatus,
    pairingError
  };
}
