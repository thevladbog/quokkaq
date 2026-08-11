import { describe, expect, it } from 'vitest';

import {
  nextStationRuntimeState,
  transitionStationRuntimeState
} from './station-runtime-state';

describe('station runtime state machine', () => {
  it('runs the successful ticket and print lifecycle', () => {
    expect(nextStationRuntimeState('attract', 'start')).toBe('active');
    expect(nextStationRuntimeState('active', 'submit')).toBe('submitting');
    expect(nextStationRuntimeState('submitting', 'print-start')).toBe(
      'success-printing'
    );
    expect(nextStationRuntimeState('success-printing', 'print-succeeded')).toBe(
      'success'
    );
  });

  it('keeps ticket creation successful when printing fails and allows retry', () => {
    expect(nextStationRuntimeState('success-printing', 'print-failed')).toBe(
      'print-failed'
    );
    expect(nextStationRuntimeState('print-failed', 'print-succeeded')).toBe(
      'success'
    );
  });

  it('rejects illegal transitions instead of guessing a state', () => {
    expect(transitionStationRuntimeState('success', 'submit')).toEqual({
      ok: false,
      state: 'success',
      event: 'submit'
    });
    expect(transitionStationRuntimeState('attract', 'print-succeeded')).toEqual(
      {
        ok: false,
        state: 'attract',
        event: 'print-succeeded'
      }
    );
  });

  it('handles offline, unavailable, timeout extension, and reset paths', () => {
    expect(nextStationRuntimeState('active', 'go-offline')).toBe('offline');
    expect(nextStationRuntimeState('active', 'timeout-warning')).toBe(
      'timeout-warning'
    );
    expect(nextStationRuntimeState('offline', 'go-online')).toBe('active');
    expect(nextStationRuntimeState('active', 'unavailable')).toBe(
      'temporarily-unavailable'
    );
    expect(
      nextStationRuntimeState('temporarily-unavailable', 'available')
    ).toBe('active');
    expect(nextStationRuntimeState('timeout-warning', 'extend-time')).toBe(
      'active'
    );
    expect(nextStationRuntimeState('timeout-warning', 'timeout')).toBe(
      'attract'
    );
    expect(nextStationRuntimeState('submitting', 'reset')).toBe('attract');
  });
});
