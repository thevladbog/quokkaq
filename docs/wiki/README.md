# QuokkaQ operator documentation

## Where content lives

| Audience | Location |
|----------|----------|
| **In-product help (`/{locale}/help/...`)** | [`apps/frontend/content/wiki/en/`](../../apps/frontend/content/wiki/en/) and [`apps/frontend/content/wiki/ru/`](../../apps/frontend/content/wiki/ru/) (MDX). Rendered via [`apps/frontend/lib/wiki/load-wiki-page.ts`](../../apps/frontend/lib/wiki/load-wiki-page.ts). |
| **Developer API, webhooks, public widget (staging wiki, Markdown)** | This folder: [`en/developer-api.md`](en/developer-api.md) · [`ru/developer-api.md`](ru/developer-api.md) |

Integration topics are maintained here in **`docs/wiki/`** as plain Markdown (EN/RU) until they are synced into the frontend MDX tree.

Developer and infrastructure details for engineers: repo root `README.md`, `SETUP.md`, [`apps/backend/AGENTS.md`](../../apps/backend/AGENTS.md), and [`apps/backend/docs/`](../../apps/backend/docs/).

## In-product help (`/help`)

The product app renders MDX under **`/{locale}/help/...`**. If a Russian page is missing, `en` is used as fallback.

File names in the MDX wiki stay **ASCII** (e.g. `google-calendar.mdx`); mirror the same relative paths under each locale.
