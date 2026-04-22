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

- **Landing Page** — product overview with feature highlights and screenshots
- **Pricing Page** — subscription plans fetched live from the backend (`GET /subscriptions/plans`) and rendered using `@quokkaq/subscription-pricing` utilities
- **Internationalization** — English and Russian locale support

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

| Variable              | Required | Default                 | Description                                      |
| --------------------- | -------- | ----------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_API_URL` | No       | `http://localhost:3001` | Backend base URL for fetching subscription plans |

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
│   └── ...               # Fetch helpers and utilities
├── public/               # Static assets
├── orval.config.ts       # Orval code generation configuration
├── next.config.ts        # Next.js configuration
└── package.json
```
