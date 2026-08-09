import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiHttpError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import type {
  RuntimeManifestCache,
  TerminalExperienceRuntimeClient
} from './runtime-manifest';
import {
  createRuntimeManifestCache,
  loadRuntimeManifest
} from './runtime-manifest';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn() }
}));

function validDefinition() {
  return {
    schemaVersion: 1,
    id: 'template-a',
    surface: 'ticket-station',
    startPageId: 'services',
    variants: [
      {
        id: 'portrait',
        profile: {
          id: 'ipad-10-9-portrait',
          name: 'iPad 10.9 portrait',
          width: 820,
          height: 1180,
          interactionMode: 'touch',
          viewingDistance: 'near',
          safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
        },
        grid: { columns: 12, rows: 18 }
      }
    ],
    pages: [
      {
        id: 'services',
        name: 'Services',
        widgets: [{ id: 'catalog', type: 'service-picker', config: {} }],
        layouts: {
          portrait: {
            placements: {
              catalog: { col: 1, row: 1, colSpan: 12, rowSpan: 16 }
            }
          }
        }
      }
    ]
  };
}

function experienceManifest(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'experience',
    templateId: 'template-a',
    versionId: 'version-1',
    version: 1,
    variantId: 'portrait',
    publishedAt: '2026-08-10T00:00:00Z',
    definition: validDefinition(),
    ...overrides
  };
}

class MemoryManifestCache implements RuntimeManifestCache {
  readonly entries = new Map<string, unknown>();

  async read(terminalId: string): Promise<unknown | null> {
    return this.entries.get(terminalId) ?? null;
  }

  async write(manifest: unknown): Promise<void> {
    const record = manifest as { terminalId: string };
    this.entries.set(record.terminalId, manifest);
  }

  async clear(terminalId: string): Promise<void> {
    this.entries.delete(terminalId);
  }
}

class MapStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function client(result: unknown): TerminalExperienceRuntimeClient {
  return { fetchManifest: async () => result };
}

describe('runtime manifest protocol', () => {
  beforeEach(() => {
    vi.mocked(logger.warn).mockClear();
  });

  it('returns online only after validating and persisting an immutable experience manifest', async () => {
    const cache = new MemoryManifestCache();

    const result = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'terminal-jwt',
      client: client(experienceManifest()),
      cache
    });

    expect(result).toMatchObject({
      mode: 'online',
      manifest: {
        templateId: 'template-a',
        versionId: 'version-1',
        variantId: 'portrait'
      }
    });
    expect(cache.entries.get('terminal-a')).toMatchObject({
      terminalId: 'terminal-a',
      templateId: 'template-a',
      versionId: 'version-1'
    });
  });

  it('uses only the matching terminal cache after a transport failure', async () => {
    const cache = new MemoryManifestCache();
    await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: client(experienceManifest()),
      cache
    });
    await loadRuntimeManifest({
      terminalId: 'terminal-b',
      terminalToken: 'b',
      client: client(
        experienceManifest({
          templateId: 'template-b',
          versionId: 'version-2',
          definition: { ...validDefinition(), id: 'template-b' }
        })
      ),
      cache
    });

    const result = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: {
        fetchManifest: async () => Promise.reject(new TypeError('offline'))
      },
      cache
    });

    expect(result).toMatchObject({
      mode: 'cached',
      manifest: { templateId: 'template-a', versionId: 'version-1' }
    });
  });

  it('keeps a server legacy response legacy instead of resurrecting a stale cache', async () => {
    const cache = new MemoryManifestCache();
    await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: client(experienceManifest()),
      cache
    });

    const result = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: client({ mode: 'legacy' }),
      cache
    });

    expect(result).toEqual({ mode: 'legacy', source: 'server' });
    await expect(
      loadRuntimeManifest({
        terminalId: 'terminal-a',
        terminalToken: 'a',
        client: {
          fetchManifest: async () => Promise.reject(new TypeError('offline'))
        },
        cache
      })
    ).resolves.toEqual({ mode: 'legacy', source: 'ssr' });
  });

  it('isolates cached records for punctuated terminal, template, and version identifiers', async () => {
    const storage = new MapStorage();
    const cache = createRuntimeManifestCache(storage);
    await loadRuntimeManifest({
      terminalId: 'terminal-a:b',
      terminalToken: 'a',
      client: client(
        experienceManifest({
          templateId: 'template-a:b',
          versionId: 'version-a:b',
          definition: { ...validDefinition(), id: 'template-a:b' }
        })
      ),
      cache
    });
    await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'b',
      client: client(
        experienceManifest({
          templateId: 'template-a:b-c',
          versionId: 'version-a:b-c',
          definition: { ...validDefinition(), id: 'template-a:b-c' }
        })
      ),
      cache
    });

    await expect(
      loadRuntimeManifest({
        terminalId: 'terminal-a:b',
        terminalToken: 'a',
        client: {
          fetchManifest: async () => Promise.reject(new TypeError('offline'))
        },
        cache
      })
    ).resolves.toMatchObject({
      mode: 'cached',
      manifest: { templateId: 'template-a:b', versionId: 'version-a:b' }
    });
  });

  it('rejects a schema-invalid online definition without overwriting or falling back to the good cache', async () => {
    const cache = new MemoryManifestCache();
    await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: client(experienceManifest()),
      cache
    });

    const rejected = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: client(
        experienceManifest({
          definition: { schemaVersion: 99, phone: '+79991234567' }
        })
      ),
      cache
    });

    expect(rejected).toEqual({
      mode: 'rejected',
      reasonCode: 'definition.invalid',
      acknowledgement: {
        status: 'rejected',
        versionId: 'version-1',
        reasonCode: 'definition.invalid'
      }
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected terminal experience manifest',
      { reasonCode: 'definition.invalid' }
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(
      '+79991234567'
    );
    const cachedAfterReject = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: {
        fetchManifest: async () => Promise.reject(new TypeError('offline'))
      },
      cache
    });
    expect(cachedAfterReject).toMatchObject({
      mode: 'cached',
      manifest: { templateId: 'template-a', versionId: 'version-1' }
    });
  });

  it('fails closed when cache data is corrupt instead of returning it on transport failure', async () => {
    const cache: RuntimeManifestCache = {
      read: async () => ({ terminalId: 'terminal-a', templateId: 'wrong' }),
      write: async () => undefined,
      clear: async () => undefined
    };

    const result = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: {
        fetchManifest: async () => Promise.reject(new TypeError('offline'))
      },
      cache
    });

    expect(result).toEqual({ mode: 'legacy', source: 'cache-invalid' });
  });

  it('has an explicit SSR fallback when a manifest cannot be fetched', async () => {
    const result = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: {
        fetchManifest: async () => Promise.reject(new TypeError('offline'))
      }
    });

    expect(result).toEqual({ mode: 'legacy', source: 'ssr' });
  });

  it('never revives a stale manifest after an HTTP protocol failure', async () => {
    const cache = new MemoryManifestCache();
    await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: client(experienceManifest()),
      cache
    });

    const result = await loadRuntimeManifest({
      terminalId: 'terminal-a',
      terminalToken: 'a',
      client: {
        fetchManifest: async () => {
          throw new ApiHttpError('terminal revoked', 401, 'terminal_revoked');
        }
      },
      cache
    });

    expect(result).toEqual({ mode: 'legacy', source: 'api-error' });
  });
});
