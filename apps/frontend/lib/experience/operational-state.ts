export type OperationalState =
  | 'emergency'
  | 'temporarily-unavailable'
  | 'stale-offline'
  | 'closed'
  | 'no-active-counters'
  | 'empty'
  | 'normal';

export type OperationalStateInput = {
  emergency?: boolean;
  temporarilyUnavailable?: boolean;
  connected?: boolean;
  stale?: boolean;
  open?: boolean;
  activeCounters?: number;
  queueLength?: number;
  mediaFailed?: boolean;
};

export type ResolvedOperationalState = {
  state: OperationalState;
  media?: 'failed';
};

/**
 * Resolves system-owned display state before tenant-authored page conditions.
 * Media health remains metadata because it must never outrank the fixed system
 * precedence chain.
 */
export function resolveOperationalState(
  input: OperationalStateInput
): ResolvedOperationalState {
  const media = input.mediaFailed ? ('failed' as const) : undefined;
  const result = (state: OperationalState): ResolvedOperationalState => ({
    state,
    ...(media ? { media } : {})
  });

  if (input.emergency) return result('emergency');
  if (input.temporarilyUnavailable) {
    return result('temporarily-unavailable');
  }
  if (input.connected === false || input.stale) return result('stale-offline');
  if (input.open === false) return result('closed');
  if (input.activeCounters === 0) return result('no-active-counters');
  if (input.queueLength === 0) return result('empty');
  return result('normal');
}
