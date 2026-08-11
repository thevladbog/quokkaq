import {
  transitionStationRuntimeState,
  type StationRuntimeState
} from './station-runtime-state';

export type StationPrintTicket = {
  id: string;
  queueNumber: string;
  serviceName?: string;
  visitorToken?: string;
};

export type StationPrintAdapter = (ticket: StationPrintTicket) => Promise<void>;

export type StationPrintLifecycle = {
  getState: () => StationRuntimeState;
  print: (ticket: StationPrintTicket) => Promise<'printed' | 'failed' | 'busy'>;
  retry: () => Promise<'printed' | 'failed' | 'busy'>;
  reset: () => void;
};

/**
 * Coordinates the station's ticket-created and printer states.
 *
 * Ticket creation is deliberately outside this controller: once a ticket
 * exists, a printer failure must never turn it back into a failed issuance.
 */
export function createStationPrintLifecycle({
  printTicket,
  onStateChange
}: {
  printTicket: StationPrintAdapter;
  onStateChange?: (state: StationRuntimeState) => void;
}): StationPrintLifecycle {
  let state: StationRuntimeState = 'success';
  let ticket: StationPrintTicket | undefined;
  let inFlight = false;
  let generation = 0;

  const setState = (
    event: Parameters<typeof transitionStationRuntimeState>[1]
  ) => {
    const transition = transitionStationRuntimeState(state, event);
    if (!transition.ok) return false;
    state = transition.state;
    onStateChange?.(state);
    return true;
  };

  const run = async () => {
    if (!ticket) return 'failed' as const;
    if (inFlight) return 'busy' as const;
    inFlight = true;
    const operationGeneration = generation;
    setState('print-start');
    try {
      await printTicket(ticket);
      if (generation !== operationGeneration) return 'busy' as const;
      setState('print-succeeded');
      return 'printed' as const;
    } catch {
      if (generation !== operationGeneration) return 'busy' as const;
      setState('print-failed');
      return 'failed' as const;
    } finally {
      inFlight = false;
    }
  };

  return {
    getState: () => state,
    async print(nextTicket) {
      if (ticket || inFlight) return 'busy';
      ticket = nextTicket;
      if (state === 'active') setState('ticket-created');
      return run();
    },
    async retry() {
      if (state !== 'print-failed') return 'busy';
      return run();
    },
    reset() {
      generation += 1;
      ticket = undefined;
      state = 'active';
      onStateChange?.(state);
    }
  };
}
