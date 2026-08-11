'use client';

import type { ReactNode } from 'react';

import type {
  PublishedExperienceManifest,
  RuntimeManifestResult
} from '@/lib/experience/runtime-manifest';

export type TicketStationEntryReason =
  | 'missing-terminal-token'
  | 'wrong-terminal-kind'
  | 'legacy-assignment'
  | 'manifest-rejected'
  | 'wrong-surface'
  | 'missing-variant';

export type TicketStationEntryDecision =
  | { mode: 'booting' }
  | { mode: 'legacy'; reason: TicketStationEntryReason }
  | { mode: 'experience'; manifest: PublishedExperienceManifest };

function isPublishedTicketStationManifest(
  manifest: PublishedExperienceManifest
): boolean {
  return (
    manifest.template.surface === 'ticket-station' &&
    manifest.template.variants.some(
      (variant) => variant.id === manifest.variantId
    )
  );
}

/**
 * Chooses the deployed station runtime without allowing an invalid assignment
 * to replace the legacy kiosk. This is intentionally pure so every fallback
 * reason can be tested without mounting the  legacy kiosk page.
 */
export function decideTicketStationEntry(input: {
  terminalKind: string | null | undefined;
  terminalToken: string | null | undefined;
  manifest: RuntimeManifestResult | null;
}): TicketStationEntryDecision {
  if (!input.terminalToken?.trim()) {
    return { mode: 'legacy', reason: 'missing-terminal-token' };
  }
  if (input.terminalKind !== 'kiosk') {
    return { mode: 'legacy', reason: 'wrong-terminal-kind' };
  }
  if (input.manifest === null) return { mode: 'booting' };
  if (input.manifest.mode === 'legacy') {
    return { mode: 'legacy', reason: 'legacy-assignment' };
  }
  if (input.manifest.mode === 'rejected') {
    return { mode: 'legacy', reason: 'manifest-rejected' };
  }
  if (!isPublishedTicketStationManifest(input.manifest.manifest)) {
    return {
      mode: 'legacy',
      reason:
        input.manifest.manifest.template.surface === 'ticket-station'
          ? 'missing-variant'
          : 'wrong-surface'
    };
  }
  return { mode: 'experience', manifest: input.manifest.manifest };
}

export function TicketStationEntry({
  terminalKind,
  terminalToken,
  manifest,
  legacy,
  loading,
  renderExperience
}: {
  terminalKind: string | null | undefined;
  terminalToken: string | null | undefined;
  manifest: RuntimeManifestResult | null;
  legacy: ReactNode;
  loading?: ReactNode;
  renderExperience: (manifest: PublishedExperienceManifest) => ReactNode;
}) {
  const decision = decideTicketStationEntry({
    terminalKind,
    terminalToken,
    manifest
  });
  if (decision.mode === 'booting') {
    return loading ?? <div data-testid='ticket-station-booting' />;
  }
  if (decision.mode === 'legacy') return <>{legacy}</>;
  return <>{renderExperience(decision.manifest)}</>;
}
