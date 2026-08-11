import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  KioskCapabilityAdapterProvider,
  useKioskCapabilities,
  type KioskCapabilityAdapter
} from './kiosk-capability-adapter';

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

  it('provides the adapter without exposing Tauri to generic experience code', () => {
    const adapter: KioskCapabilityAdapter = { reset: vi.fn() };
    const { result } = renderHook(() => useKioskCapabilities(), {
      wrapper: ({ children }) => (
        <KioskCapabilityAdapterProvider adapter={adapter}>
          {children}
        </KioskCapabilityAdapterProvider>
      )
    });
    expect(result.current).toBe(adapter);
  });
});
