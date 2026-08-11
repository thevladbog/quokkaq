import { describe, expect, it } from 'vitest';

import { resolveOperationalState } from './operational-state';

describe('resolveOperationalState', () => {
  it.each([
    [
      'emergency',
      {
        emergency: true,
        temporarilyUnavailable: true,
        isConnected: false,
        stale: true,
        isOpen: false,
        activeCounters: 0,
        queueLength: 0
      }
    ],
    [
      'temporarily-unavailable',
      {
        temporarilyUnavailable: true,
        isConnected: false,
        stale: true,
        isOpen: false,
        activeCounters: 0,
        queueLength: 0
      }
    ],
    [
      'stale-offline',
      {
        isConnected: false,
        isOpen: false,
        activeCounters: 0,
        queueLength: 0
      }
    ],
    [
      'closed',
      { isConnected: true, isOpen: false, activeCounters: 0, queueLength: 0 }
    ],
    [
      'no-active-counters',
      { isConnected: true, isOpen: true, activeCounters: 0, queueLength: 0 }
    ],
    [
      'empty',
      { isConnected: true, isOpen: true, activeCounters: 2, queueLength: 0 }
    ],
    [
      'normal',
      { isConnected: true, isOpen: true, activeCounters: 2, queueLength: 7 }
    ]
  ] as const)(
    'resolves %s according to system precedence',
    (expected, input) => {
      expect(resolveOperationalState(input).state).toBe(expected);
    }
  );

  it('keeps media failure as a distinct diagnostic without outranking system state', () => {
    expect(
      resolveOperationalState({
        isConnected: true,
        isOpen: true,
        activeCounters: 2,
        queueLength: 4,
        mediaFailed: true
      })
    ).toEqual({ state: 'normal', media: 'failed' });

    expect(
      resolveOperationalState({
        emergency: true,
        isConnected: true,
        isOpen: true,
        activeCounters: 2,
        queueLength: 4,
        mediaFailed: true
      })
    ).toEqual({ state: 'emergency', media: 'failed' });
  });

  it('keeps bounded stale age metadata for the explanatory overlay', () => {
    expect(
      resolveOperationalState({
        isConnected: false,
        staleAgeMinutes: 17,
        isOpen: true,
        activeCounters: 2,
        queueLength: 4
      })
    ).toEqual({ state: 'stale-offline', staleAgeMinutes: 17 });

    expect(
      resolveOperationalState({
        isConnected: false,
        staleAgeMinutes: -4,
        isOpen: true
      })
    ).toEqual({ state: 'stale-offline', staleAgeMinutes: 0 });
  });
});
