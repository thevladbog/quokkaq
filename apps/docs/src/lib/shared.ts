export const appName = 'QuokkaQ';

function trimOrigin(url: string) {
  return url.replace(/\/$/, '');
}

/**
 * Public marketing / landing site (align with `apps/marketing` `NEXT_PUBLIC_MARKETING_SITE_URL`).
 * Local default: port 3010.
 */
export function marketingSiteUrl(locale: string) {
  const fromEnv = process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim();
  const base = fromEnv ? trimOrigin(fromEnv) : 'http://localhost:3010';
  return `${base}/${locale}`;
}

/**
 * QuokkaQ web app (align with `apps/frontend` `NEXT_PUBLIC_APP_URL`).
 * Local default: port 3000. Path includes locale: `/{locale}`.
 */
export function quokkaqAppUrl(locale: string) {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = fromEnv ? trimOrigin(fromEnv) : 'http://localhost:3000';
  return `${base}/${locale}`;
}

/** Path relative to `/${locale}` */
export const docsPathSegment = 'docs';

/** Unprefixed: used with `/${locale}/...` in the app */
export const docsRoute = `/${docsPathSegment}`;

/** Unprefixed LLMS route (locale is the first path segment) */
export const docsContentRoute = '/llms.mdx/docs';

export function docsImageRoutePrefix(locale: string) {
  return `/${locale}/og/docs`;
}

export function docsContentRoutePrefix(locale: string) {
  return `/${locale}/llms.mdx/docs`;
}

/**
 * Public blob base for "View on GitHub" (entire `content/docs/...` tree).
 * Unset in environments where the monorepo URL must not be exposed.
 */
export const githubBlobBase: string | undefined =
  process.env.NEXT_PUBLIC_DOCS_GITHUB_BLOB_BASE;
