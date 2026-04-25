import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKioskSessionIdle } from './use-kiosk-session-idle';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function fireKioskActivity() {
  act(() => {
    window.dispatchEvent(
      new Event('pointerdown', { bubbles: true, cancelable: true })
    );
  });
}

describe('useKioskSessionIdle', () => {
  it('decrements remainingSec each second after the bar opens', () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() =>
      useKioskSessionIdle({
        enabled: true,
        requireFirstUserActivity: false,
        beforeWarningSec: 1,
        countdownSec: 3,
        onSessionEnd
      })
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.remainingSec).toBe(3);
    expect(onSessionEnd).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remainingSec).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remainingSec).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
  });

  it('keeps the countdown running after a second inactivity cycle (dismissed then shown again)', () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() =>
      useKioskSessionIdle({
        enabled: true,
        requireFirstUserActivity: false,
        beforeWarningSec: 1,
        countdownSec: 2,
        onSessionEnd
      })
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.remainingSec).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remainingSec).toBe(1);

    act(() => {
      result.current.continueSession();
    });
    expect(result.current.showWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.remainingSec).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remainingSec).toBe(1);
  });

  it('arms the timer only after the first user activity when requireFirstUserActivity is set', () => {
    const onSessionEnd = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useKioskSessionIdle({
          enabled,
          requireFirstUserActivity: true,
          beforeWarningSec: 2,
          countdownSec: 5,
          onSessionEnd
        }),
      { initialProps: { enabled: true } }
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.showWarning).toBe(false);

    fireKioskActivity();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.remainingSec).toBe(5);

    act(() => {
      result.current.continueSession();
    });

    rerender({ enabled: false });
    rerender({ enabled: true });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.remainingSec).toBe(5);
  });
});
