import { describe, expect, it, vi } from 'vitest';

import type { KioskCapabilityAdapter } from './kiosk-capability-adapter';

describe('KioskCapabilityAdapter', () => {
  it('keeps hardware capabilities behind an explicit portable contract', async () => {
    const adapter: KioskCapabilityAdapter = {
      printTicket: vi.fn().mockResolvedValue(undefined),
      scanDocument: vi.fn().mockResolvedValue({ document: 'redacted' }),
      reset: vi.fn()
    };
    await adapter.printTicket?.({ id: 'ticket-1', queueNumber: 'A-12' });
    await expect(adapter.scanDocument?.()).resolves.toEqual({
      document: 'redacted'
    });
    expect(adapter.printTicket).toHaveBeenCalledOnce();
  });
});
