import { describe, expect, it } from 'vitest';

import {
  KIOSK_TERMINAL_KIND,
  parseTicketStationPairing,
  removeTicketStationPairingCode,
  ticketStationStorageKeys
} from './ticket-station-runtime';

describe('ticket station runtime pairing', () => {
  it('accepts only a kiosk bootstrap for the requested unit', () => {
    expect(
      parseTicketStationPairing(
        {
          token: 'terminal-token',
          unitId: 'unit-1',
          terminalKind: KIOSK_TERMINAL_KIND,
          defaultLocale: 'en',
          appBaseUrl: 'https://app.example.test',
          kioskFullscreen: true
        },
        'unit-1'
      )
    ).toEqual({
      terminalToken: 'terminal-token',
      terminalKind: 'kiosk',
      unitId: 'unit-1',
      defaultLocale: 'en'
    });
  });

  it('rejects a valid terminal token paired to another unit', () => {
    expect(() =>
      parseTicketStationPairing(
        {
          token: 'terminal-token',
          unitId: 'unit-2',
          terminalKind: 'kiosk',
          defaultLocale: 'en',
          appBaseUrl: 'https://app.example.test',
          kioskFullscreen: true
        },
        'unit-1'
      )
    ).toThrow('unit mismatch');
  });

  it('rejects non-kiosk terminals before they can load a station manifest', () => {
    expect(() =>
      parseTicketStationPairing(
        {
          token: 'terminal-token',
          unitId: 'unit-1',
          terminalKind: 'counter_board',
          defaultLocale: 'en',
          appBaseUrl: 'https://app.example.test',
          kioskFullscreen: true
        },
        'unit-1'
      )
    ).toThrow('terminal kind');
  });

  it('keeps kiosk credentials namespaced by unit', () => {
    expect(ticketStationStorageKeys('unit-1')).toEqual({
      token: 'quokkaq_ticket_station_token:unit-1',
      locale: 'quokkaq_ticket_station_locale:unit-1'
    });
  });

  it('removes only the pairing code from a kiosk URL', () => {
    expect(
      removeTicketStationPairingCode(
        'https://app.example.test/en/kiosk/unit-1?code=pair-me&prCode=visit-123&prToken=token#top'
      )
    ).toBe('/en/kiosk/unit-1?prCode=visit-123&prToken=token#top');
  });
});
