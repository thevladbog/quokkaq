import { afterEach, describe, expect, it, vi } from 'vitest';

describe('logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not call console.log in production after fresh import', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.resetModules();
    const { logger } = await import('./logger');
    logger.log('should-not-log');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('calls console.error regardless of NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const { logger } = await import('./logger');
    logger.error('always');
    expect(errSpy).toHaveBeenCalledWith('always');
  });

  it('does not call console.warn in production after fresh import', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    const { logger } = await import('./logger');
    logger.warn('should-not-warn');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('calls console.warn in development after fresh import', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    const { logger } = await import('./logger');
    logger.warn('expected');
    expect(warnSpy).toHaveBeenCalledWith('expected');
  });
});
