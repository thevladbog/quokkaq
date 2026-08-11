export type StationRuntimeState =
  | 'attract'
  | 'active'
  | 'submitting'
  | 'success-printing'
  | 'success'
  | 'print-failed'
  | 'offline'
  | 'temporarily-unavailable'
  | 'timeout-warning';

export type StationRuntimeEvent =
  | 'start'
  | 'submit'
  | 'ticket-created'
  | 'print-start'
  | 'print-succeeded'
  | 'print-failed'
  | 'reset'
  | 'go-offline'
  | 'go-online'
  | 'unavailable'
  | 'available'
  | 'timeout-warning'
  | 'extend-time'
  | 'timeout';

const transitions: Record<
  StationRuntimeState,
  Partial<Record<StationRuntimeEvent, StationRuntimeState>>
> = {
  attract: {
    start: 'active',
    'go-offline': 'offline',
    unavailable: 'temporarily-unavailable'
  },
  active: {
    submit: 'submitting',
    reset: 'attract',
    'go-offline': 'offline',
    unavailable: 'temporarily-unavailable',
    'timeout-warning': 'timeout-warning',
    timeout: 'attract'
  },
  submitting: {
    'ticket-created': 'success',
    'print-start': 'success-printing',
    reset: 'attract',
    'go-offline': 'offline',
    timeout: 'attract'
  },
  'success-printing': {
    'print-succeeded': 'success',
    'print-failed': 'print-failed',
    reset: 'attract',
    timeout: 'attract'
  },
  success: {
    'print-start': 'success-printing',
    reset: 'attract',
    timeout: 'attract'
  },
  'print-failed': {
    'print-succeeded': 'success',
    reset: 'attract',
    timeout: 'attract'
  },
  offline: {
    'go-online': 'active',
    reset: 'attract',
    unavailable: 'temporarily-unavailable'
  },
  'temporarily-unavailable': {
    available: 'active',
    reset: 'attract',
    timeout: 'attract'
  },
  'timeout-warning': {
    'extend-time': 'active',
    timeout: 'attract',
    reset: 'attract'
  }
};

export function nextStationRuntimeState(
  state: StationRuntimeState,
  event: StationRuntimeEvent
): StationRuntimeState | undefined {
  return transitions[state][event];
}

export function transitionStationRuntimeState(
  state: StationRuntimeState,
  event: StationRuntimeEvent
):
  | { ok: true; state: StationRuntimeState }
  | { ok: false; state: StationRuntimeState; event: StationRuntimeEvent } {
  const next = nextStationRuntimeState(state, event);
  return next === undefined
    ? { ok: false, state, event }
    : { ok: true, state: next };
}
