# QuokkaQ operator documentation

## Where content lives

| Audience | Location |
|----------|----------|
| **In-product help (`/{locale}/help/...`)** | [`apps/frontend/content/wiki/en/`](../../apps/frontend/content/wiki/en/) and [`apps/frontend/content/wiki/ru/`](../../apps/frontend/content/wiki/ru/) (MDX). Rendered via [`apps/frontend/lib/wiki/load-wiki-page.ts`](../../apps/frontend/lib/wiki/load-wiki-page.ts). |
| **Developer API, webhooks, public widget (staging wiki, Markdown)** | This folder: [`en/developer-api.md`](en/developer-api.md) · [`ru/developer-api.md`](ru/developer-api.md) |
| **Digital Signage (playlists, schedules, screen, feeds)** | [`en/digital-signage.md`](en/digital-signage.md) · [`ru/digital-signage.md`](ru/digital-signage.md) |

Integration topics are maintained here in **`docs/wiki/`** as plain Markdown (EN/RU) until they are synced into the frontend MDX tree.

Developer and infrastructure details for engineers: repo root `README.md`, `SETUP.md`, [`apps/backend/AGENTS.md`](../../apps/backend/AGENTS.md), and [`apps/backend/docs/`](../../apps/backend/docs/).

## In-product help (`/help`)

The product app renders MDX under **`/{locale}/help/...`**. If a Russian page is missing, `en` is used as fallback.

File names in the MDX wiki stay **ASCII** (e.g. `google-calendar.mdx`); mirror the same relative paths under each locale.

## Wiki duplication (consolidation tracking)

| Item | |
| --- | --- |
| **Source of truth** | **In-app / tenant-facing:** `apps/frontend/content/wiki/{en,ru}/` (MDX) for `/help`. **Staging / operator Markdown:** `docs/wiki/` (e.g. developer API topics) until merged into MDX. **HTTP/API contract:** always OpenAPI/Swagger served by the API. |
| **Affected paths** | `docs/wiki/en/*.md`, `docs/wiki/ru/*.md`; `apps/frontend/content/wiki/en/**`, `apps/frontend/content/wiki/ru/**`; cross-links from [`load-wiki-page.ts`](../../apps/frontend/lib/wiki/load-wiki-page.ts). |
| **Migration** | 1) List pages that exist in both trees; 2) pick canonical wording per topic; 3) move or replace staging copies in `docs/wiki/` with links to MDX or vice versa; 4) remove duplicate files after redirect/links updated. |
| **Acceptance** | No conflicting HTTP/path claims between `docs/wiki` and in-app help for the same feature; OpenAPI remains authoritative for routes. **Owner:** maintainers of docs + frontend wiki (TBD in your issue tracker). |
| **Optional check** | During consolidation, `diff` or `rsync -n` between mirrored subtrees to spot drift. |
