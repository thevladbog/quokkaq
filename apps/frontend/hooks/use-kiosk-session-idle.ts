import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'keydown',
  'touchstart',
  'wheel'
];

type UseKioskSessionIdleOptions = {
  /** When false, timers are cleared and the warning is closed. */
  enabled: boolean;
  /** Seconds of inactivity before the warning dialog. */
  beforeWarningSec: number;
  /** Warning countdown in seconds before `onSessionEnd`. */
  countdownSec: number;
  /** Fires when the countdown reaches zero. */
  onSessionEnd: () => void;
};

/**
 * Kiosk inactivity: after `beforeWarningSec` show a dialog with a countdown; on expiry call `onSessionEnd`.
 * Activity resets the idle timer. While `enabled` is false, no timers run.
 */
export function useKioskSessionIdle({
  enabled,
  beforeWarningSec,
  countdownSec,
  onSessionEnd
}: UseKioskSessionIdleOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);

  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const clearTimers = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const endSession = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    setRemainingSec(0);
    onSessionEndRef.current();
  }, [clearTimers]);

  const scheduleWarning = useCallback(() => {
    clearTimers();
    if (!enabled || beforeWarningSec <= 0 || countdownSec <= 0) {
      return;
    }
    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(true);
      let left = countdownSec;
      setRemainingSec(left);
      countdownIntervalRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          endSession();
          return;
        }
        setRemainingSec(left);
      }, 1000);
    }, beforeWarningSec * 1000);
  }, [beforeWarningSec, clearTimers, countdownSec, enabled, endSession]);

  const bump = useCallback(() => {
    if (showWarning) {
      return;
    }
    scheduleWarning();
  }, [scheduleWarning, showWarning]);

  const continueSession = useCallback(() => {
    setShowWarning(false);
    setRemainingSec(0);
    clearTimers();
    scheduleWarning();
  }, [clearTimers, scheduleWarning]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      queueMicrotask(() => {
        setShowWarning(false);
        setRemainingSec(0);
      });
      return;
    }
    if (showWarning) {
      return;
    }
    scheduleWarning();
    return () => {
      clearTimers();
    };
  }, [
    beforeWarningSec,
    clearTimers,
    countdownSec,
    enabled,
    scheduleWarning,
    showWarning
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onActivity = () => {
      if (showWarning) {
        return;
      }
      bump();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [bump, enabled, showWarning]);

  const showWarningActive = enabled && showWarning;

  return {
    showWarning: showWarningActive,
    remainingSec: showWarningActive ? remainingSec : 0,
    continueSession
  };
}
