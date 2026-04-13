import type { QueryClient } from '@tanstack/react-query';

const UNIT_TICKETS_PATH = /^\/units\/[^/]+\/tickets$/;

/**
 * Invalidates ticket list queries: legacy `['tickets']` and Orval keys `/units/{id}/tickets`.
 */
export function invalidateTicketListQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['tickets'] });
  void queryClient.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      typeof q.queryKey[0] === 'string' &&
      UNIT_TICKETS_PATH.test(q.queryKey[0])
  });
}
