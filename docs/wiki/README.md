# QuokkaQ operator documentation (canonical location)

Operational help for admins and staff **lives in the frontend app content tree**, not in this folder.

## Where to edit

| Role | Path |
|------|------|
| **Source files** | [`apps/frontend/content/wiki/en/`](../../apps/frontend/content/wiki/en/) and [`apps/frontend/content/wiki/ru/`](../../apps/frontend/content/wiki/ru/) (MDX) |

Mirror the **same relative paths** under each locale. File names stay **ASCII** (e.g. `google-calendar.mdx`).

## In-product help (`/help`)

The product app renders these MDX files under **`/{locale}/help/...`** via [`apps/frontend/lib/wiki/load-wiki-page.ts`](../../apps/frontend/lib/wiki/load-wiki-page.ts) (YAML frontmatter is stripped for the simple Markdown view). Fallback: if Russian is missing, `en` is used.

Developer and infrastructure docs remain in the repo root `README.md`, `SETUP.md`, and [`apps/backend/docs/`](../../apps/backend/docs/).
