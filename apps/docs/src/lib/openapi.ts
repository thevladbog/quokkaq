import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { mergeOpenApiTagDefinitionsFromOperations } from '@/lib/openapi-merge-tags';

// Monorepo root: apps/docs/src/lib -> ../../../../
const libDir = path.dirname(fileURLToPath(import.meta.url));
/** Key passed to `getSchema()`; must match `input()` map. */
export const openApiJsonPath = path.join(
  libDir,
  '../../../..',
  'apps',
  'backend',
  'docs',
  'openapi.json'
);

/**
 * `groupBy: 'tag'` needs every operation tag in `dereferenced.tags` (fumadocs
 * `fromTagName`). Generated `openapi.json` is not edited in-repo; we merge
 * in memory when loading.
 */
export const openapi = createOpenAPI({
  input: async () => {
    const text = await fs.readFile(openApiJsonPath, 'utf8');
    const parsed = JSON.parse(text) as object;
    return { [openApiJsonPath]: mergeOpenApiTagDefinitionsFromOperations(parsed) };
  },
  disableCache: process.env.NODE_ENV === 'development'
});
