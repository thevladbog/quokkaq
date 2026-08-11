import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RuntimeManifestResult } from '@/lib/experience/runtime-manifest';

import {
  decideTicketStationEntry,
  TicketStationEntry
} from './ticket-station-entry';

function manifest(
  overrides: Partial<
    Extract<RuntimeManifestResult, { mode: 'online' }>['manifest']
  > = {}
): Extract<RuntimeManifestResult, { mode: 'online' }> {
  return {
    mode: 'online',
    manifest: {
      mode: 'experience',
      templateId: 'template-a',
      versionId: 'version-1',
      version: 1,
      variantId: 'portrait',
      publishedAt: '2026-08-10T00:00:00Z',
      template: {
        schemaVersion: 1,
        id: 'template-a',
        surface: 'ticket-station',
        startPageId: 'services',
        variants: [
          {
            id: 'portrait',
            profile: {
              id: 'ipad-portrait',
              name: 'Portrait',
              width: 820,
              height: 1180,
              interactionMode: 'touch',
              viewingDistance: 'near',
              safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
            },
            grid: { columns: 12, rows: 18 }
          }
        ],
        pages: [
          {
            id: 'services',
            name: 'Services',
            widgets: [],
            layouts: { portrait: { placements: {} } }
          }
        ]
      },
      ...overrides
    }
  };
}

describe('decideTicketStationEntry', () => {
  it('keeps an unpaired browser on the legacy kiosk', () => {
    expect(
      decideTicketStationEntry({
        terminalKind: null,
        terminalToken: null,
        manifest: null
      })
    ).toEqual({ mode: 'legacy', reason: 'missing-terminal-token' });
  });

  it('rejects a paired terminal of another kind', () => {
    expect(
      decideTicketStationEntry({
        terminalKind: 'counter_board',
        terminalToken: 'token',
        manifest: null
      })
    ).toEqual({ mode: 'legacy', reason: 'wrong-terminal-kind' });
  });

  it('shows booting only after a valid kiosk token is available', () => {
    expect(
      decideTicketStationEntry({
        terminalKind: 'kiosk',
        terminalToken: 'token',
        manifest: null
      })
    ).toEqual({ mode: 'booting' });
  });

  it('keeps explicit legacy assignments on the legacy page', () => {
    expect(
      decideTicketStationEntry({
        terminalKind: 'kiosk',
        terminalToken: 'token',
        manifest: { mode: 'legacy', source: 'server' }
      })
    ).toEqual({ mode: 'legacy', reason: 'legacy-assignment' });
  });

  it('accepts a valid online or cached ticket station manifest', () => {
    const online = manifest();
    expect(
      decideTicketStationEntry({
        terminalKind: 'kiosk',
        terminalToken: 'token',
        manifest: online
      })
    ).toMatchObject({ mode: 'experience' });
    expect(
      decideTicketStationEntry({
        terminalKind: 'kiosk',
        terminalToken: 'token',
        manifest: { mode: 'cached', manifest: online.manifest }
      })
    ).toMatchObject({ mode: 'experience' });
  });

  it('falls back for rejected or incompatible manifests', () => {
    expect(
      decideTicketStationEntry({
        terminalKind: 'kiosk',
        terminalToken: 'token',
        manifest: {
          mode: 'rejected',
          reasonCode: 'manifest.invalid'
        }
      })
    ).toEqual({ mode: 'legacy', reason: 'manifest-rejected' });
    expect(
      decideTicketStationEntry({
        terminalKind: 'kiosk',
        terminalToken: 'token',
        manifest: manifest({
          template: {
            ...manifest().manifest.template,
            surface: 'queue-display'
          }
        })
      })
    ).toEqual({ mode: 'legacy', reason: 'wrong-surface' });
  });
});

describe('TicketStationEntry', () => {
  it('mounts only the selected runtime and preserves legacy fallback', () => {
    const valid = manifest();
    const { rerender } = render(
      <TicketStationEntry
        terminalKind='kiosk'
        terminalToken='token'
        manifest={null}
        legacy={<div data-testid='legacy' />}
        loading={<div data-testid='loading' />}
        renderExperience={() => <div data-testid='experience' />}
      />
    );
    expect(screen.getByTestId('loading')).toBeVisible();
    rerender(
      <TicketStationEntry
        terminalKind='counter_board'
        terminalToken='token'
        manifest={valid}
        legacy={<div data-testid='legacy' />}
        renderExperience={() => <div data-testid='experience' />}
      />
    );
    expect(screen.getByTestId('legacy')).toBeVisible();
    expect(screen.queryByTestId('experience')).toBeNull();
  });
});
