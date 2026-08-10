import { describe, expect, it } from 'vitest';

import { resolveOperationalState } from './operational-state';

describe('resolveOperationalState', () => {
  it.each([
    [
      'emergency',
      {
        emergency: true,
        temporarilyUnavailable: true,
        connected: false,
        stale: true,
        open: false,
        activeCounters: 0,
        queueLength: 0
      }
    ],
    [
      'temporarily-unavailable',
      {
        temporarilyUnavailable: true,
        connected: false,
        stale: true,
        open: false,
        activeCounters: 0,
        queueLength: 0
      }
    ],
    [
      'stale-offline',
      {
        connected: false,
        open: false,
        activeCounters: 0,
        queueLength: 0
      }
    ],
    [
      'closed',
      { connected: true, open: false, activeCounters: 0, queueLength: 0 }
    ],
    [
      'no-active-counters',
      { connected: true, open: true, activeCounters: 0, queueLength: 0 }
    ],
    [
      'empty',
      { connected: true, open: true, activeCounters: 2, queueLength: 0 }
    ],
    [
      'normal',
      { connected: true, open: true, activeCounters: 2, queueLength: 7 }
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
        connected: true,
        open: true,
        activeCounters: 2,
        queueLength: 4,
        mediaFailed: true
      })
    ).toEqual({ state: 'normal', media: 'failed' });

    expect(
      resolveOperationalState({
        emergency: true,
        connected: true,
        open: true,
        activeCounters: 2,
        queueLength: 4,
        mediaFailed: true
      })
    ).toEqual({ state: 'emergency', media: 'failed' });
  });
});
