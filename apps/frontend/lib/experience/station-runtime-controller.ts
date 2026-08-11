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
    setState(state === 'print-failed' ? 'print-start' : 'print-start');
    try {
      await printTicket(ticket);
      setState('print-succeeded');
      return 'printed' as const;
    } catch {
      setState('print-failed');
      return 'failed' as const;
    } finally {
      inFlight = false;
    }
  };

  return {
    getState: () => state,
    async print(nextTicket) {
      if (ticket && ticket.id !== nextTicket.id) return 'busy';
      ticket = nextTicket;
      return run();
    },
    async retry() {
      return run();
    },
    reset() {
      ticket = undefined;
      inFlight = false;
      state = 'active';
      onStateChange?.(state);
    }
  };
}
