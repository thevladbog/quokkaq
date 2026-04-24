import { useCallback, useEffect, useRef } from 'react';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'keydown',
  'touchstart',
  'wheel'
];

type UseKioskAttractInactivityOptions = {
  /** When false, timer is cleared. */
  enabled: boolean;
  /**
   * When true, the attract timer does not start until the user has interacted at least once
   * (same pattern as session idle).
   */
  requireFirstUserActivity?: boolean;
  /** Seconds of inactivity before `onAttract` (attract-only mode). */
  inactivitySec: number;
  onAttract: () => void;
};

/**
 * Full-screen attract after a single inactivity period (no warning bar). Used when
 * `kioskAttractInactivityMode === 'attract_only'`.
 */
export function useKioskAttractInactivity({
  enabled,
  requireFirstUserActivity = true,
  inactivitySec,
  onAttract
}: UseKioskAttractInactivityOptions) {
  const onAttractRef = useRef(onAttract);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserInteractedRef = useRef(false);

  useEffect(() => {
    onAttractRef.current = onAttract;
  }, [onAttract]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fireAttract = useCallback(() => {
    clearTimer();
    onAttractRef.current();
  }, [clearTimer]);

  const schedule = useCallback(() => {
    clearTimer();
    if (!enabled || inactivitySec <= 0) {
      return;
    }
    timerRef.current = setTimeout(fireAttract, inactivitySec * 1000);
  }, [clearTimer, enabled, fireAttract, inactivitySec]);

  const bump = useCallback(() => {
    schedule();
  }, [schedule]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }
    if (requireFirstUserActivity && !hasUserInteractedRef.current) {
      return;
    }
    schedule();
    return () => {
      clearTimer();
    };
  }, [clearTimer, enabled, requireFirstUserActivity, schedule]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onActivity = () => {
      hasUserInteractedRef.current = true;
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
  }, [bump, enabled]);
}
