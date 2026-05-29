import type { Folder, Node, Root } from 'fumadocs-core/page-tree';

import { docsPathSegment } from '@/lib/shared';

/** `/{locale}/docs/.../api/...` within the app */
export function isDocsOpenApiPathname(pathname: string): boolean {
  return pathname.includes(`/${docsPathSegment}/api`);
}

function getFolderEntryUrl(folder: Folder): string | undefined {
  if (folder.index?.type === 'page' && folder.index.url) {
    return folder.index.url;
  }
  const p = folder.children.find((c) => c.type === 'page') as
    | { type: 'page'; url: string }
    | undefined;
  return p?.url;
}

function isPathUnderEntry(pathname: string, entry: string | undefined): boolean {
  if (!entry) {
    return false;
  }
  if (entry.length > 1 && entry.endsWith('/')) {
    const e = entry.replace(/\/$/, '');
    return pathname === e || pathname.startsWith(`${e}/`);
  }
  return pathname === entry || pathname.startsWith(`${entry}/`);
}

function isApiEntryUrl(url: string | undefined): boolean {
  return typeof url === 'string' && isDocsOpenApiPathname(url);
}

/** Same as fumadocs `getLayoutTabs` (incl. `fallback`, `unlisted`). */
function forEachLayoutRootFolder(
  from: Root,
  fn: (args: { folder: Folder; unlisted: boolean }) => void
): void {
  const next = (node: object, unlisted: boolean) => {
    if ('root' in node && (node as Folder).root && 'children' in node) {
      const f = node as Folder;
      const u = getFolderEntryUrl(f);
      if (u) {
        fn({ folder: f, unlisted });
      }
    }
    const ch = (node as { children?: { type: string }[] }).children ?? [];
    for (const c of ch) {
      if (c.type === 'folder') {
        next(c, unlisted);
      }
    }
  };
  next(from, false);
  if (from.fallback) {
    for (const c of from.fallback.children) {
      if (c.type === 'folder') {
        next(c, true);
      }
    }
  }
}

function listLayoutRootFolders(
  from: Root
): { folder: Folder; unlisted: boolean }[] {
  const out: { folder: Folder; unlisted: boolean }[] = [];
  forEachLayoutRootFolder(from, (e) => {
    out.push(e);
  });
  return out;
}

function isApiLayoutRoot(f: Folder): boolean {
  return isApiEntryUrl(getFolderEntryUrl(f));
}

/**
 * All folders in the full tree. OpenAPI is often a separate `root` next to
 * `en`/`ru`, or nested; we need the API branch even if `listLayoutRootFolders` only
 * found one top-level `root: true` (e.g. locale wrapper).
 */
function* iterateAllFolders(n: { children: Node[] } & { fallback?: Root }): Generator<Folder> {
  for (const c of n.children) {
    if (c.type === 'folder') {
      yield c;
      yield* iterateAllFolders(c);
    }
  }
  if (
    n &&
    typeof n === 'object' &&
    'fallback' in n &&
    n.fallback &&
    'children' in n.fallback
  ) {
    yield* iterateAllFolders(n.fallback);
  }
}

/**
 * Picks the shallowest `Folder` whose **entry** URL is under `…/docs/api/…` and
 * is a path prefix of `pathname` (e.g. index at `/en/docs/api` and page under it).
 * Falls back to the shortest `…/docs/api/…` entry in the tree.
 */
/** e.g. `/en/docs/api` for `/en/docs/api/...` */
function getDocsApiBasePath(pathname: string): string | null {
  const token = `/${docsPathSegment}/api`;
  const i = pathname.indexOf(token);
  if (i < 0) {
    return null;
  }
  return pathname.slice(0, i + token.length);
}

function findOpenApiSectionFolderDeep(
  full: Root,
  pathname: string
): Folder | null {
  const cands: Folder[] = [];
  for (const f of iterateAllFolders(full)) {
    if (isApiEntryUrl(getFolderEntryUrl(f))) {
      cands.push(f);
    }
  }
  if (cands.length === 0) {
    return null;
  }
  const base = getDocsApiBasePath(pathname);
  if (base) {
    const forBase = cands.find((f) => getFolderEntryUrl(f) === base);
    if (forBase) {
      return forBase;
    }
  }
  const withPrefix = cands
    .map((f) => ({ f, e: getFolderEntryUrl(f)! }))
    .filter((x) => isPathUnderEntry(pathname, x.e));
  const pool = withPrefix.length > 0 ? withPrefix : cands.map((f) => ({ f, e: getFolderEntryUrl(f)! }));
  pool.sort((a, b) => {
    if (a.f.root && !b.f.root) {
      return -1;
    }
    if (!a.f.root && b.f.root) {
      return 1;
    }
    return a.e.length - b.e.length;
  });
  return pool[0]!.f;
}

/** `/{locale}/docs/api` and `…/index` (Overview); tolerate absolute `http` URLs in tree. */
function isApiRootOverviewPath(url: string): boolean {
  const s = url.replace(/^https?:\/\/[^/]+/i, '');
  return (
    /^\/[^/]+\/docs\/api$/.test(s) || /^\/[^/]+\/docs\/api\/index$/.test(s)
  );
}

/**
 * Fumadocs `Folder` carries `$ref` to the virtual `meta` path. Our OpenAPI
 * `openapiSource` + `baseDir: 'api'` always registers `api/meta.json` here.
 * This survives RSC client navigation better than heuristics on `page.url`.
 */
function isOpenApiSourceMetaRootFolder(f: Folder): boolean {
  const r = (f as Folder & { $ref?: string }).$ref;
  if (typeof r !== 'string' || r.length === 0) {
    return false;
  }
  const n = r.replaceAll('\\', '/');
  // `api/...` or fumadocs i18n shared prefix `$/api/...` (see `prefixDollarI18nApiPaths` in `source.ts`)
  return n.endsWith('api/meta') || n.endsWith('api/meta.json');
}

/**
 * OpenAPI catalog root: `api/meta` — one overview page and tag `folder`s. Do
 * not trust only `getFolderEntryUrl` (Fumadocs can order `children` so the
 * first `page` is not the index).
 */
function isOpenApiCatalogRootFolder(f: Folder): boolean {
  if (!f.children?.length) {
    return false;
  }
  const tagFolders = f.children.filter((c) => c.type === 'folder');
  if (tagFolders.length < 1) {
    return false;
  }
  const hasOverviewPage = f.children.some(
    (c) =>
      c.type === 'page' &&
      'url' in c &&
      typeof (c as { url?: string }).url === 'string' &&
      isApiRootOverviewPath((c as { url: string }).url)
  );
  if (!hasOverviewPage) {
    return false;
  }
  const withRoot = f as Folder & { root?: boolean };
  if (hasOverviewPage) {
    if (withRoot.root) {
      return true;
    }
    if (tagFolders.length >= 2) {
      return true;
    }
  }
  if (withRoot.root && tagFolders.length >= 5) {
    return true;
  }
  return false;
}

function findOpenApiCatalogRoot(full: Root): Folder | null {
  for (const f of iterateAllFolders(full)) {
    if (isOpenApiSourceMetaRootFolder(f)) {
      return f;
    }
  }
  for (const f of iterateAllFolders(full)) {
    if (isOpenApiCatalogRootFolder(f)) {
      return f;
    }
  }
  return null;
}

function openApiSlicedNodes(folder: Folder): Node[] {
  if (isOpenApiSourceMetaRootFolder(folder) || isOpenApiCatalogRootFolder(folder)) {
    return folder.children as Node[];
  }
  return [folder] as Node[];
}

/**
 * Fumadocs’ `TreeContext` sets sidebar from `searchPath(…, pathname)` then
 * `path.findLast(…, folder & root)` — a single `root: true` on the path. If
 * the OpenAPI **folder** is nested under the locale `root: true` without its
 * own `root: true` on the path, `TreeContext` keeps the guides root. Slicing
 * `Root.children` to a **single** active layout `Folder` fixes the switcher+sidebar
 * to match: guides vs OpenAPI.
 */
export function slicePageTreeToActiveLayoutRoot(
  full: Root,
  pathname: string
): Root {
  if (isDocsOpenApiPathname(pathname)) {
    const catalog = findOpenApiCatalogRoot(full);
    const deep =
      catalog ?? findOpenApiSectionFolderDeep(full, pathname) ?? void 0;
    if (deep) {
      return {
        ...full,
        children: openApiSlicedNodes(deep) as Node[],
        fallback: void 0
      };
    }
    const roots = listLayoutRootFolders(full);
    const hit = roots.find((r) => isApiLayoutRoot(r.folder))?.folder;
    if (hit) {
      return {
        ...full,
        children: openApiSlicedNodes(hit) as Node[],
        fallback: void 0
      };
    }
    return full;
  }

  const roots = listLayoutRootFolders(full);
  if (roots.length < 2) {
    return full;
  }
  const mdx = roots
    .filter((r) => !isApiLayoutRoot(r.folder))
    .map((r) => r.folder);
  if (mdx.length === 0) {
    return full;
  }
  if (mdx.length === 1) {
    return { ...full, children: [mdx[0]] as Node[], fallback: void 0 };
  }
  const m =
    mdx.find((f) => isPathUnderEntry(pathname, getFolderEntryUrl(f))) ?? mdx[0];
  return { ...full, children: [m] as Node[], fallback: void 0 };
}
