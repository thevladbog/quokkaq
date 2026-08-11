import { describe, expect, it, vi } from 'vitest';

import { createStationPrintLifecycle } from './station-runtime-controller';

const ticket = { id: 'ticket-1', queueNumber: 'A-12' };

describe('createStationPrintLifecycle', () => {
  it('keeps a created ticket successful when printing succeeds', async () => {
    const states: string[] = [];
    const lifecycle = createStationPrintLifecycle({
      printTicket: vi.fn().mockResolvedValue(undefined),
      onStateChange: (state) => states.push(state)
    });

    await expect(lifecycle.print(ticket)).resolves.toBe('printed');
    expect(lifecycle.getState()).toBe('success');
    expect(states).toEqual(['success-printing', 'success']);
  });

  it('keeps the ticket retryable when the printer fails', async () => {
    const printTicket = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('printer offline'))
      .mockResolvedValueOnce(undefined);
    const lifecycle = createStationPrintLifecycle({ printTicket });

    await expect(lifecycle.print(ticket)).resolves.toBe('failed');
    expect(lifecycle.getState()).toBe('print-failed');
    await expect(lifecycle.retry()).resolves.toBe('printed');
    expect(lifecycle.getState()).toBe('success');
    expect(printTicket).toHaveBeenCalledTimes(2);
    expect(printTicket).toHaveBeenNthCalledWith(2, ticket);
  });

  it('allows only one printer request at a time', async () => {
    let resolvePrint!: () => void;
    const printTicket = vi.fn(
      () => new Promise<void>((resolve) => (resolvePrint = resolve))
    );
    const lifecycle = createStationPrintLifecycle({ printTicket });

    const first = lifecycle.print(ticket);
    await expect(lifecycle.print(ticket)).resolves.toBe('busy');
    resolvePrint();
    await expect(first).resolves.toBe('printed');
    expect(printTicket).toHaveBeenCalledOnce();
  });

  it('resets the held ticket and state for a new station session', async () => {
    const lifecycle = createStationPrintLifecycle({
      printTicket: vi.fn().mockResolvedValue(undefined)
    });
    await lifecycle.print(ticket);
    lifecycle.reset();

    expect(lifecycle.getState()).toBe('active');
    await expect(lifecycle.retry()).resolves.toBe('busy');
  });

  it('does not print a completed ticket twice or retry after success', async () => {
    const printTicket = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createStationPrintLifecycle({ printTicket });

    await expect(lifecycle.print(ticket)).resolves.toBe('printed');
    await expect(lifecycle.print(ticket)).resolves.toBe('busy');
    await expect(lifecycle.retry()).resolves.toBe('busy');
    expect(printTicket).toHaveBeenCalledOnce();
  });

  it('keeps the printer lease and ignores stale completion after reset', async () => {
    let resolvePrint!: () => void;
    const states: string[] = [];
    const printTicket = vi.fn(
      () => new Promise<void>((resolve) => (resolvePrint = resolve))
    );
    const lifecycle = createStationPrintLifecycle({
      printTicket,
      onStateChange: (state) => states.push(state)
    });

    const first = lifecycle.print(ticket);
    lifecycle.reset();
    await expect(
      lifecycle.print({ id: 'ticket-2', queueNumber: 'B-2' })
    ).resolves.toBe('busy');
    resolvePrint();
    await expect(first).resolves.toBe('busy');
    expect(printTicket).toHaveBeenCalledOnce();
    expect(states).toEqual(['success-printing', 'active']);
  });
});
