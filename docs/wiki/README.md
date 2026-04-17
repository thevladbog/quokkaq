# QuokkaQ wiki (operator / in-product help)

This tree is **operational documentation** for people using QuokkaQ (admins, staff). Developer and infrastructure docs stay in the repo root `README.md`, `SETUP.md`, and [`apps/backend/docs/`](../apps/backend/docs/).

## Supported locales

| Code | Content path |
|------|----------------|
| `en` | [`en/`](en/) |
| `ru` | [`ru/`](ru/) |

Mirror **the same relative paths** under each locale (e.g. `en/admin/integrations/google-calendar.md` and `ru/admin/integrations/google-calendar.md`). File names stay **ASCII** (e.g. `google-calendar.md`) so routing and tooling stay predictable.

## Fallback (for the web app)

When a page is opened in the UI for locale `ru` but the Russian file is missing, the app may show the **`en`** version and a short “translation in progress” notice. The canonical contract is: **prefer `en` as fallback** (configurable in code).

## How to add articles

1. Add or update markdown under **both** `en/` and `ru/` when the article is user-facing in both languages.
2. Link new pages from the nearest `README.md` index (same locale).
3. Use pull requests; keep product wiki separate from backend-only runbooks in `apps/backend/docs/`.

## Viewing in the app

The Next.js app serves these files under **`/{locale}/help/...`** (see `apps/frontend/app/[locale]/help/`). Example:

- English: `/en/help/admin/integrations/google-calendar`
- Russian: `/ru/help/admin/integrations/google-calendar`

---

## Quick links (repository paths)

- English hub: [`en/README.md`](en/README.md)
- Russian hub: [`ru/README.md`](ru/README.md)
- Calendar articles (both languages): `*/admin/integrations/google-calendar.md`, `*/admin/integrations/yandex-calendar.md`
