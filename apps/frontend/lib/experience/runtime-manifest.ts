import {
  ExperienceTemplateSchema,
  type ExperienceTemplate
} from '@quokkaq/shared-types';
import { z } from 'zod';

import { isApiHttpError } from '@/lib/api-errors';
import {
  getKioskSnapshotStorage,
  type KioskSnapshotStorage
} from '@/lib/kiosk-snapshot-cache';
import { logger } from '@/lib/logger';

import {
  fetchTerminalExperienceManifest,
  type TerminalExperienceAcknowledgement
} from './experience-api';

const CACHE_PREFIX = 'quokkaq.experience.manifest.v1';

const LegacyManifestSchema = z.object({ mode: z.literal('legacy') }).strict();

const CachePointerSchema = z.object({ key: z.string().min(1) }).strict();

const ExperienceManifestEnvelopeSchema = z
  .object({
    mode: z.literal('experience'),
    templateId: z.string().min(1),
    versionId: z.string().min(1),
    version: z.number().int().positive(),
    variantId: z.string().min(1),
    publishedAt: z.string().min(1),
    definition: z.unknown()
  })
  .strict();

export type PublishedExperienceManifest = {
  mode: 'experience';
  templateId: string;
  versionId: string;
  version: number;
  variantId: string;
  publishedAt: string;
  template: ExperienceTemplate;
};

type CacheRecord = PublishedExperienceManifest & { terminalId: string };

export type RuntimeManifestResult =
  | {
      mode: 'legacy';
      source: 'server' | 'network' | 'api-error' | 'cache-invalid' | 'ssr';
    }
  | { mode: 'online'; manifest: PublishedExperienceManifest }
  | { mode: 'cached'; manifest: PublishedExperienceManifest }
  | {
      mode: 'rejected';
      reasonCode: 'definition.invalid' | 'manifest.invalid';
      acknowledgement?: TerminalExperienceAcknowledgement;
    };

export interface RuntimeManifestCache {
  read(terminalId: string): Promise<unknown | null>;
  write(record: unknown): Promise<void>;
  clear(terminalId: string): Promise<void>;
}

export interface TerminalExperienceRuntimeClient {
  fetchManifest(terminalToken: string): Promise<unknown>;
}

function storageKey(parts: string[]): string {
  return JSON.stringify([CACHE_PREFIX, ...parts]);
}

function latestKey(terminalId: string): string {
  return storageKey(['latest', terminalId]);
}

function manifestKey(record: CacheRecord): string {
  return storageKey([
    'manifest',
    record.terminalId,
    record.templateId,
    record.versionId
  ]);
}

function parseJSON(value: string | null): unknown | null {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return { corrupted: true };
  }
}

export function createRuntimeManifestCache(
  storage: KioskSnapshotStorage | null
): RuntimeManifestCache {
  return {
    async read(terminalId) {
      if (storage === null) return null;
      try {
        const pointer = parseJSON(storage.getItem(latestKey(terminalId)));
        if (pointer === null) return null;
        const parsedPointer = CachePointerSchema.safeParse(pointer);
        if (!parsedPointer.success) return { corrupted: true };
        return parseJSON(storage.getItem(parsedPointer.data.key));
      } catch {
        return { corrupted: true };
      }
    },
    async write(record) {
      if (storage === null) return;
      const parsed = parseCachedRecord(record);
      if (parsed === null) return;
      try {
        const previousPointer = CachePointerSchema.safeParse(
          parseJSON(storage.getItem(latestKey(parsed.terminalId)))
        );
        const key = manifestKey(parsed);
        storage.setItem(key, JSON.stringify(parsed));
        storage.setItem(latestKey(parsed.terminalId), JSON.stringify({ key }));
        if (previousPointer.success && previousPointer.data.key !== key) {
          storage.removeItem(previousPointer.data.key);
        }
      } catch {
        // Availability cache writes are best effort and never change the live result.
      }
    },
    async clear(terminalId) {
      if (storage === null) return;
      try {
        const pointer = CachePointerSchema.safeParse(
          parseJSON(storage.getItem(latestKey(terminalId)))
        );
        storage.removeItem(latestKey(terminalId));
        if (pointer.success) {
          storage.removeItem(pointer.data.key);
        }
      } catch {
        // A malformed cache is already fail-closed; clearing it remains best effort.
      }
    }
  };
}

const browserRuntimeManifestCache = createRuntimeManifestCache(
  getKioskSnapshotStorage()
);

const defaultRuntimeClient: TerminalExperienceRuntimeClient = {
  fetchManifest: fetchTerminalExperienceManifest
};

function parsePublishedExperienceManifest(
  value: unknown
): PublishedExperienceManifest | null {
  const envelope = ExperienceManifestEnvelopeSchema.safeParse(value);
  if (!envelope.success) return null;
  const template = ExperienceTemplateSchema.safeParse(envelope.data.definition);
  if (!template.success) return null;
  if (
    template.data.id !== envelope.data.templateId ||
    !template.data.variants.some(
      (variant) => variant.id === envelope.data.variantId
    )
  ) {
    return null;
  }
  return {
    mode: 'experience',
    templateId: envelope.data.templateId,
    versionId: envelope.data.versionId,
    version: envelope.data.version,
    variantId: envelope.data.variantId,
    publishedAt: envelope.data.publishedAt,
    template: template.data
  };
}

function parseCachedRecord(value: unknown): CacheRecord | null {
  const envelope = z
    .object({
      terminalId: z.string().min(1),
      mode: z.literal('experience'),
      templateId: z.string().min(1),
      versionId: z.string().min(1),
      version: z.number().int().positive(),
      variantId: z.string().min(1),
      publishedAt: z.string().min(1),
      template: z.unknown()
    })
    .strict()
    .safeParse(value);
  if (!envelope.success) return null;
  const template = ExperienceTemplateSchema.safeParse(envelope.data.template);
  if (
    !template.success ||
    template.data.id !== envelope.data.templateId ||
    !template.data.variants.some(
      (variant) => variant.id === envelope.data.variantId
    )
  ) {
    return null;
  }
  return { ...envelope.data, template: template.data };
}

function rejectedResult(raw: unknown): RuntimeManifestResult {
  const envelope = ExperienceManifestEnvelopeSchema.safeParse(raw);
  if (envelope.success) {
    const result: RuntimeManifestResult = {
      mode: 'rejected',
      reasonCode: 'definition.invalid',
      acknowledgement: {
        status: 'rejected',
        versionId: envelope.data.versionId,
        reasonCode: 'definition.invalid'
      }
    };
    logger.warn('Rejected terminal experience manifest', {
      reasonCode: result.reasonCode
    });
    return result;
  }
  const result: RuntimeManifestResult = {
    mode: 'rejected',
    reasonCode: 'manifest.invalid'
  };
  logger.warn('Rejected terminal experience manifest', {
    reasonCode: result.reasonCode
  });
  return result;
}

/**
 * The generated mutator represents completed HTTP responses as ApiHttpError.
 * Only browser fetch transport failures may revive a last-known-good manifest;
 * revocation, unassignment and server errors keep the terminal in legacy mode.
 */
function isTransportFailure(error: unknown): boolean {
  return !isApiHttpError(error) && error instanceof TypeError;
}

async function cachedOrLegacy(
  terminalId: string,
  cache: RuntimeManifestCache,
  source: 'network' | 'ssr'
): Promise<RuntimeManifestResult> {
  let cached: unknown | null;
  try {
    cached = await cache.read(terminalId);
  } catch {
    return { mode: 'legacy', source: 'cache-invalid' };
  }
  if (cached === null) {
    return { mode: 'legacy', source };
  }
  const record = parseCachedRecord(cached);
  if (record === null || record.terminalId !== terminalId) {
    return { mode: 'legacy', source: 'cache-invalid' };
  }
  return {
    mode: 'cached',
    manifest: {
      mode: 'experience',
      templateId: record.templateId,
      versionId: record.versionId,
      version: record.version,
      variantId: record.variantId,
      publishedAt: record.publishedAt,
      template: record.template
    }
  };
}

/**
 * Resolves the terminal deployment protocol without ever rendering an unvalidated definition.
 * A valid server legacy response deliberately wins over any local cache.
 */
export async function loadRuntimeManifest(input: {
  terminalId: string;
  terminalToken: string;
  client?: TerminalExperienceRuntimeClient;
  cache?: RuntimeManifestCache;
}): Promise<RuntimeManifestResult> {
  const client = input.client ?? defaultRuntimeClient;
  const cache = input.cache ?? browserRuntimeManifestCache;
  let raw: unknown;
  try {
    raw = await client.fetchManifest(input.terminalToken);
  } catch (error) {
    if (!isTransportFailure(error)) {
      return { mode: 'legacy', source: 'api-error' };
    }
    return cachedOrLegacy(
      input.terminalId,
      cache,
      typeof window === 'undefined' ? 'ssr' : 'network'
    );
  }

  if (LegacyManifestSchema.safeParse(raw).success) {
    try {
      await cache.clear(input.terminalId);
    } catch {
      // The server response is authoritative even when best-effort storage fails.
    }
    return { mode: 'legacy', source: 'server' };
  }
  const manifest = parsePublishedExperienceManifest(raw);
  if (manifest === null) {
    return rejectedResult(raw);
  }
  const record: CacheRecord = { terminalId: input.terminalId, ...manifest };
  try {
    await cache.write(record);
  } catch {
    // A cache failure must not turn an otherwise valid deployment into legacy mode.
  }
  return { mode: 'online', manifest };
}
