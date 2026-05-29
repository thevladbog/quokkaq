import type { StructuredData } from 'fumadocs-core/mdx-plugins';
import type { OpenAPIPageData, OpenAPIServer } from 'fumadocs-openapi/server';
import Slugger from 'github-slugger';

/** Same set as fumadocs `methodKeys` (no `options` / `trace` in that list). */
const HTTP_METHODS = [
  'get',
  'post',
  'patch',
  'delete',
  'head',
  'put'
] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type Processed = Awaited<ReturnType<OpenAPIServer['getSchema']>>;

type OpenApiPageFile = {
  type: 'page';
  path: string;
  data: OpenAPIPageData;
};

function opTitle(
  o: { summary?: string; operationId?: string },
  fallback: string
): string {
  if (o.summary) {
    return o.summary;
  }
  if (o.operationId) {
    return o.operationId
      .replaceAll(/[._-]+/g, ' ')
      .replaceAll(/\b\w/g, (c) => c.toUpperCase());
  }
  return fallback;
}

/**
 * @internal Same shape as fumadocs `toStaticData` for a multi-op page (not exported as public API).
 */
function toStaticDataForAllOps(
  page: {
    showTitle?: boolean;
    operations: { method: string; path: string }[];
    webhooks: { name: string; method: string }[];
  },
  dereferenced: Processed['dereferenced']
) {
  /** Deduplicate anchor ids the same way as fumadocs; stable keys from `operationId` or `method` + `path`/`name` (not display title) */
  const slugger = new Slugger();

  const toc: { depth: number; title: string; url: string }[] = [];
  const structuredData: StructuredData = { headings: [], contents: [] };

  function addPathItem(
    op: { summary?: string; operationId?: string; description?: string },
    idSource: string,
    displayFallback: string
  ) {
    if (page.showTitle) {
      const opWith = op as { operationId?: string; summary?: string };
      const title = opTitle(opWith, displayFallback);
      const id = slugger.slug(idSource);
      toc.push({ depth: 2, title, url: `#${id}` });
      structuredData.headings.push({ content: title, id });
    }
    if (op.description) {
      const heading = structuredData.headings.at(-1)?.id ?? '';
      structuredData.contents.push({
        content: op.description,
        heading
      });
    }
  }

  for (const item of page.operations) {
    const o = (dereferenced as { paths?: Record<string, Record<string, { summary?: string; description?: string; operationId?: string }>> }).paths?.[item.path]?.[item.method];
    if (!o) {
      continue;
    }
    const idSource = o.operationId
      ? String(o.operationId)
      : `${item.method} ${item.path}`;
    addPathItem(o, idSource, item.path);
  }
  for (const item of page.webhooks) {
    const w = (dereferenced as { webhooks?: Record<string, Record<string, { summary?: string; description?: string; operationId?: string }>> }).webhooks?.[item.name]?.[item.method];
    if (!w) {
      continue;
    }
    const idSource = w.operationId
      ? String(w.operationId)
      : `webhook ${item.method} ${item.name}`;
    addPathItem(w, idSource, item.name);
  }

  return { toc, structuredData };
}

function extractAll(
  d: Processed['dereferenced']
): { operations: { method: HttpMethod; path: string }[]; webhooks: { method: HttpMethod; name: string }[] } {
  const webhooks: { method: HttpMethod; name: string }[] = [];
  const operations: { method: HttpMethod; path: string }[] = [];
  for (const [p, pathItem] of Object.entries(d.paths ?? {})) {
    if (!pathItem) {
      continue;
    }
    for (const m of HTTP_METHODS) {
      if (!pathItem[m]) {
        continue;
      }
      operations.push({ method: m, path: p });
    }
  }
  for (const [name, item] of Object.entries(d.webhooks ?? {})) {
    if (!item) {
      continue;
    }
    for (const m of HTTP_METHODS) {
      if (!item[m]) {
        continue;
      }
      webhooks.push({ name, method: m });
    }
  }
  return { webhooks, operations };
}

type OpenapiServerT = { getSchema: (id: string) => Promise<Processed>; options: { proxyUrl?: string } };

/**
 * One virtual page: full schema overview (all operations). Lets the `api/`
 * folder expose an entry URL `/{locale}/docs/api` so the docs layout slices
 * to the whole OpenAPI tree, not a single tag folder.
 */
export async function buildOpenApiRootOverviewFile(
  server: OpenapiServerT,
  schemaId: string,
  baseDir: string
): Promise<OpenApiPageFile> {
  const processed = await server.getSchema(schemaId);
  const d = processed.dereferenced;
  const { webhooks, operations } = extractAll(d);

  const info = d['info' as keyof typeof d] as { title?: string; description?: string } | undefined;
  const title = info?.title ?? 'QuokkaQ API';
  const description = info?.description;
  const props = {
    showTitle: true,
    showDescription: true,
    document: schemaId,
    operations,
    webhooks
  };

  const { toc, structuredData } = toStaticDataForAllOps(
    { showTitle: true, operations, webhooks },
    d
  );

  const getAPIPageProps = () => props;
  return {
    type: 'page',
    path: `${baseDir}/index.mdx`,
    data: {
      title,
      description,
      getAPIPageProps,
      getClientAPIPageProps: () =>
        Promise.resolve({
          payload: { bundled: processed.bundled, proxyUrl: server.options.proxyUrl },
          ...getAPIPageProps()
        }),
      getSchema: () => ({ id: schemaId, ...processed }),
      toc,
      structuredData,
      _openapi: {}
    } satisfies OpenAPIPageData
  };
}
