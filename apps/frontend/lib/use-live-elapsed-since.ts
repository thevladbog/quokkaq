'use client';

import { useEffect, useReducer } from 'react';

function elapsedSecSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

/** Live-updating elapsed seconds since an ISO timestamp (for break timers, etc.). */
export function useLiveElapsedSecondsSince(
  iso: string | null | undefined
): number {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!iso) return undefined;
    const id = window.setInterval(() => {
      bump();
    }, 1000);
    return () => window.clearInterval(id);
  }, [iso]);

  if (!iso) return 0;
  return elapsedSecSince(iso);
}
