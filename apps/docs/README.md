# QuokkaQ public documentation (Fumadocs)

Next.js 16 + [Fumadocs](https://fumadocs.dev). QuokkaQ branding, light/dark theme, and locales **`en`** / **`ru`** (URL prefix, aligned with the product app). Serve on a dedicated host (e.g. `https://docs.example.com`); set `NEXT_PUBLIC_DOCS_SITE_URL` in production (see [`.env.example`](.env.example)).

## Development (monorepo)

From repository root:

```bash
pnpm nx run docs:dev
```

The dev server uses **port 3020** to avoid clashing with frontend `3000`, API `3001`, and marketing `3010`. Visiting `/` redirects to a locale (e.g. [`/en`](http://localhost:3020/en) / [`/ru`](http://localhost:3020/ru)); docs live under `/[locale]/docs/...`.

```bash
pnpm nx run docs:build
pnpm nx run docs:lint
pnpm nx run docs:test
pnpm nx run docs:format:check
```

`docs:test` runs `types:check` (Fumadocs MDX + `tsc`). If you see route-type errors from a stale `apps/docs/.next/dev`, remove `apps/docs/.next` and re-run.

## Links to marketing and app

The docs header and locale home page link to the **landing** and **QuokkaQ app** with the current locale in the path (`…/en`, `…/ru`). Configure [`.env.example`](.env.example): `NEXT_PUBLIC_MARKETING_SITE_URL` and `NEXT_PUBLIC_APP_URL` (no trailing slash). If unset, local dev uses `http://localhost:3010` and `http://localhost:3000` (ports align with Nx apps in this repo).

## Internationalization and content

- Fumadocs [dir parser](https://fumadocs.dev/docs/headless/internationalization): MDX and `meta.json` live under [`content/docs/en/`](content/docs/en) and [`content/docs/ru/`](content/docs/ru) (same slugs in each language, e.g. `developer-api` → `/en/docs/developer-api`, `/ru/docs/developer-api`).

## Search

Full-text search is handled by the **Orama**-backed route at `src/app/api/search/route.ts` (Fumadocs [document search](https://fumadocs.dev/docs/headless/search)). With i18n-enabled `source`, the index is per locale. For hosted Algolia later, follow the Fumadocs Algolia integration if needed.

## Page feedback

End-of-page [Feedback](https://www.fumadocs.dev/docs/integrations/feedback) lives under the article body in [`src/app/[locale]/docs/[[...slug]]/page.tsx`](src/app/[locale]/docs/[[...slug]]/page.tsx); submissions are handled by the server action in [`src/lib/feedback-actions.ts`](src/lib/feedback-actions.ts) (extend with PostHog, your API, or [GitHub Discussions](https://www.fumadocs.dev/docs/integrations/feedback#integrating-with-github-discussion)). Per-page block feedback with `remark-feedback-block` is not enabled in this repo (CLI partial run); you can add it later from the Fumadocs doc if needed.

## API reference (OpenAPI)

Product REST contract lives at [`../../apps/backend/docs/openapi.json`](../../apps/backend/docs/openapi.json). Exposing it in this site is a follow-up: use Fumadocs OpenAPI / MDX as needed.

## Optional AI chat

`src/app/api/chat/route.ts` can use **OpenRouter** when keys are set. See [`.env.example`](.env.example).

## Content

Author MDX under `content/docs/<locale>/` and edit [`source.config.ts`](source.config.ts) + [`src/lib/source.ts`](src/lib/source.ts). Public help was migrated from [`../../docs/wiki`](../../docs/wiki) (legacy Markdown in-repo); the in-app wiki in `apps/frontend/content/wiki` is a separate copy until a sync strategy is defined.

## “View on GitHub”

Optional: set `NEXT_PUBLIC_DOCS_GITHUB_BLOB_BASE` to the monorepo blob URL prefix for `content/docs/...` (see [`.env.example`](.env.example)). If unset, the UI hides the action where implemented.
