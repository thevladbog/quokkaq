import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateTicketListQueries } from './ticket-query-invalidation';

describe('invalidateTicketListQueries', () => {
  it('invalidates legacy tickets key and Orval unit ticket list keys', () => {
    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    invalidateTicketListQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tickets'] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      predicate: expect.any(Function)
    });

    const predicate = invalidateQueries.mock.calls[1][0].predicate as (q: {
      queryKey: unknown;
    }) => boolean;

    expect(predicate({ queryKey: ['/units/u1/tickets'] })).toBe(true);
    expect(predicate({ queryKey: ['/units/u1/tickets/extra'] })).toBe(false);
    expect(predicate({ queryKey: ['other'] })).toBe(false);
  });
});
