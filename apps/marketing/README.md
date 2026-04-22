# QuokkaQ Marketing Site

Public-facing Next.js website for QuokkaQ — the modern queue management system. Displays product features and fetches live subscription plans from the backend API.

---

## Tech Stack

| Technology       | Version            | Purpose                                |
| ---------------- | ------------------ | -------------------------------------- |
| **Next.js**      | 16.2+ (App Router) | Framework                              |
| **React**        | 19                 | UI runtime                             |
| **TypeScript**   | 6                  | Language                               |
| **Tailwind CSS** | 4                  | Styling                                |
| **Orval**        | 8                  | OpenAPI → TypeScript client generation |
| **Zod**          | 4                  | Runtime validation                     |

**Workspace packages used:**

- `@quokkaq/shared-types` — shared Zod schemas and TypeScript types
- `@quokkaq/subscription-pricing` — plan feature/limit definitions, pricing row builder, and price formatting utilities

**Port:** `3010`

---

## Features

- **Landing** — product overview, hero, pillars, features, use cases, FAQ, lead form
- **Pricing (two entry points)** — the same `LandingPricing` block appears:
  - as the **`#pricing`** section on the home page (`/en`, `/ru`)
  - on **standalone pages** `/en/pricing` and `/ru/pricing` (SEO, direct links, sitemap)
- Plans are loaded with `GET /subscriptions/plans` when the API is available; otherwise static copy in `src/messages.ts` is used
- **Internationalization** — English and Russian

---

## Routes (locales: `en`, `ru`)

| Path | Description |
| ---- | ----------- |
| `/{locale}` | Home (full landing) |
| `/{locale}/pricing` | Pricing-only page (shared pricing component + footer CTA) |
| `/{locale}/privacy`, `/{locale}/terms` | Legal |

Main on-page anchors used by the header: `#features`, `#how-it-works`, `#pillars`, `#interface-showcase`, `#use-cases`, `#pricing`, `#faq`, `#book-demo`.

---

## Analytics (GTM / `dataLayer`)

When `NEXT_PUBLIC_GTM_ID` is set, the site loads GTM (see `components/consent/cookie-consent-and-gtm.tsx`). Client code pushes events via [`lib/marketing-analytics.ts`](lib/marketing-analytics.ts): each push includes `event: 'marketing'`, `event_name: <name>`, and optional fields (e.g. `cta_id`, `nav_href`, `source`).

| `event_name` | Typical use |
| ------------ | ----------- |
| `marketing_cta_click` | Trial / tracked CTAs (header, hero, pricing) |
| `marketing_nav_click` | Header / mobile nav anchor links |
| `marketing_mobile_menu_toggle` | Mobile menu open/close (`open` in payload) |
| `marketing_lead_open` | Lead modal or mailto from contact buttons |
| `marketing_lead_submit` | Successful lead form POST (`source`, `plan_code`) |

In **Google Tag Manager**, create a Custom Event trigger for `marketing` and branch on the **Data Layer Variable** for `event_name` (or use a single tag with lookup tables).

---

## Local Development

### Prerequisites

- **Node.js** 22+
- **pnpm** 10+ (workspace root)
- Backend running on `localhost:3001` to serve subscription plan data (optional — the pricing page degrades gracefully if the API is unavailable)

### Setup

```bash
# From workspace root — installs all monorepo dependencies
pnpm install
```

### Run

```bash
# From workspace root
pnpm nx dev marketing
```

Marketing site available at <http://localhost:3010>.

### Build

```bash
pnpm nx build marketing
```

### Lint & Format

```bash
pnpm nx lint marketing
pnpm nx run marketing:format:check
```

### Typecheck / test

```bash
pnpm nx test marketing
```

The `test` target runs `tsc --noEmit` in this app (same check as CI). It does not start a browser or run E2E tests. For a full quality gate locally: `lint` → `format:check` → `test` → `build`.

---

## OpenAPI Client

The pricing page uses an Orval-generated client to fetch public subscription plans from the backend.

After backend OpenAPI spec changes:

```bash
# Regenerate from monorepo root
pnpm nx run marketing:orval

# Verify no drift against committed files
pnpm nx run marketing:orval:check
```

Generated files live under `lib/api/generated/` and must not be edited manually.

---

## Environment Variables

See [`.env.example`](.env.example) for full comments. Summary:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NEXT_PUBLIC_API_URL` | No (default `http://localhost:3001`) | Public API base; also used for Orval fetches if `MARKETING_API_URL` is unset |
| `MARKETING_API_URL` | No | Server-only API base for `fetch` (avoids exposing API URL in the client bundle in production) |
| `NEXT_PUBLIC_MARKETING_SITE_URL` | Yes for non-Vercel production builds | Canonical origin of this site (metadata, sitemap, OG). Dev fallback: `http://localhost:3010` |
| `NEXT_PUBLIC_APP_URL` or `PUBLIC_APP_URL` | No | Product app base for signup links on pricing / hero; if unset, CTAs may fall back to mailto or anchors |
| `NEXT_PUBLIC_GTM_ID` | No | Google Tag Manager container id (e.g. `GTM-XXXXXXX`); if unset, optional analytics consent flow is limited |

---

## Deployment

Automated deployment is triggered by pushing to the `release` branch when `apps/marketing/` or `packages/` change.

The pipeline:

1. Bumps the **patch** version in `package.json` (or minor/major based on commit message keyword)
2. Builds a Docker image using `output: 'standalone'`
3. Pushes to **Yandex Container Registry**
4. Deploys to **Yandex Cloud VM** via SSH
5. Creates git tag `vX.Y.Z-marketing`

### Required GitHub Secrets

| Secret                   | Purpose                               |
| ------------------------ | ------------------------------------- |
| `YC_REGISTRY_ID`         | Yandex Container Registry ID          |
| `YC_SA_JSON_CREDENTIALS` | Yandex Cloud service account JSON key |
| `VM_HOST`                | Deployment server host                |
| `VM_USERNAME`            | SSH username                          |
| `VM_SSH_KEY`             | SSH private key                       |
| `NEXT_PUBLIC_API_URL`    | Production backend API URL            |

### Docker

```bash
# Build production image
docker build -t quokkaq-marketing apps/marketing/

# Run
docker run -p 3010:3010 \
  -e NEXT_PUBLIC_API_URL=https://api.example.com \
  quokkaq-marketing
```

---

## Project Structure

```text
apps/marketing/
├── app/                  # Next.js App Router pages and layouts
├── components/           # React components (landing, pricing, etc.)
├── lib/
│   ├── api/
│   │   └── generated/    # Orval-generated API client (do not edit manually)
│   ├── marketing-analytics.ts  # dataLayer pushes for GTM
│   └── ...               # Fetch helpers and utilities
├── public/               # Static assets
├── orval.config.ts       # Orval code generation configuration
├── next.config.ts        # Next.js configuration
└── package.json
```

---

## Optional product backlog (not part of core site delivery)

Items to consider when content or compliance matures:

- Replace placeholder tiles in the interface showcase with real product screenshots or short video
- Add FAQ entries for security, data residency, or compliance **only** when the product can support the claims
- Run **Lighthouse** or Core Web Vitals checks after large UI changes (not automated in this repo)
- Optional marketing comparison (e.g. vs spreadsheets or manual queues) if it helps ICP education

---
