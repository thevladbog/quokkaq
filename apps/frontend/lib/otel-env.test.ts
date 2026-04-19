import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOtelBrowserRumEnabled } from './otel-env';

describe('isOtelBrowserRumEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['true', 'TRUE', '1', 'yes', 'Y', '  y  '])(
    'returns true when NEXT_PUBLIC_OTEL_ENABLED is %j',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_OTEL_ENABLED', value);
      expect(isOtelBrowserRumEnabled()).toBe(true);
    }
  );

  it.each(['', 'false', '0', 'no', 'maybe', '2'])(
    'returns false when NEXT_PUBLIC_OTEL_ENABLED is %j',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_OTEL_ENABLED', value);
      expect(isOtelBrowserRumEnabled()).toBe(false);
    }
  );
});
