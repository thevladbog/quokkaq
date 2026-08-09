import { describe, expect, it } from 'vitest';
import type { ClientVisitTransferEvent } from '@quokkaq/shared-types';
import {
  getLatestTransfer,
  getTransferDisplayLines,
  localizedTransferServiceName
} from './visit-transfer-display';

function transfer(
  overrides: Partial<ClientVisitTransferEvent> = {}
): ClientVisitTransferEvent {
  return {
    at: '2026-08-09T09:00:00.000Z',
    ...overrides
  };
}

describe('localizedTransferServiceName', () => {
  const event = transfer({
    fromServiceName: 'Default service',
    fromServiceNameRu: 'Услуга на русском',
    fromServiceNameEn: 'English service'
  });

  it('uses the requested RU or EN service name', () => {
    expect(localizedTransferServiceName(event, 'from', 'ru-RU')).toBe(
      'Услуга на русском'
    );
    expect(localizedTransferServiceName(event, 'from', 'en-GB')).toBe(
      'English service'
    );
  });

  it('falls back without returning blank service names', () => {
    const withoutPreferredLocale = transfer({
      toServiceName: 'Fallback service',
      toServiceNameRu: '   '
    });
    const withoutAnyName = transfer({ toServiceName: '   ' });

    expect(
      localizedTransferServiceName(withoutPreferredLocale, 'to', 'ru')
    ).toBe('Fallback service');
    expect(localizedTransferServiceName(withoutAnyName, 'to', 'en')).toBeNull();
  });
});

describe('getTransferDisplayLines', () => {
  it('omits display lines whose two sides are empty', () => {
    expect(
      getTransferDisplayLines(
        transfer({
          fromServiceNameEn: 'Payments',
          toServiceNameEn: 'Documents',
          fromCounterName: '   ',
          fromZoneLabel: '',
          toZoneLabel: 'Zone B'
        }),
        'en'
      )
    ).toEqual([
      { kind: 'service', from: 'Payments', to: 'Documents' },
      { kind: 'zone', from: '', to: 'Zone B' }
    ]);
  });

  it('does not invent a destination counter for a zone transfer to its queue', () => {
    expect(
      getTransferDisplayLines(
        transfer({
          transferKind: 'zone',
          fromCounterName: 'Counter 4'
        }),
        'en'
      )
    ).toEqual([{ kind: 'counter', from: 'Counter 4', to: '' }]);
  });
});

describe('getLatestTransfer', () => {
  it('returns the latest transfer by timestamp without changing the trail', () => {
    const newest = transfer({ at: '2026-08-09T11:00:00.000Z' });
    const trail = [
      transfer({ at: '2026-08-09T10:00:00.000Z' }),
      newest,
      transfer({ at: '2026-08-09T08:00:00.000Z' })
    ];

    expect(getLatestTransfer(trail)).toBe(newest);
    expect(trail.map((event) => event.at)).toEqual([
      '2026-08-09T10:00:00.000Z',
      '2026-08-09T11:00:00.000Z',
      '2026-08-09T08:00:00.000Z'
    ]);
  });

  it('returns null for a missing or empty trail', () => {
    expect(getLatestTransfer(undefined)).toBeNull();
    expect(getLatestTransfer([])).toBeNull();
  });
});
