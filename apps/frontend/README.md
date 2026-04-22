# <img src="./public/quokka-logo.svg" width="64" height="64" alt="QuokkaQ Logo" style="vertical-align: middle; margin-right: 10px;"> QuokkaQ Frontend

<img src="./public/logo-text.svg" alt="QuokkaQ Text Logo" width="200">

QuokkaQ is a modern queue management system. This Next.js application is the primary web interface for staff, supervisors, tenant administrators, SaaS platform operators, and kiosk/display terminals.

---

## Tech Stack

| Technology               | Version            | Purpose                                |
| ------------------------ | ------------------ | -------------------------------------- |
| **Next.js**              | 16.2+ (App Router) | Framework                              |
| **React**                | 19                 | UI runtime                             |
| **TypeScript**           | 6                  | Language                               |
| **Tailwind CSS**         | 4                  | Styling                                |
| **shadcn/ui** (Radix UI) | latest             | UI components                          |
| **TanStack Query**       | v5                 | Server state / data fetching           |
| **next-intl**            | latest             | i18n (en, ru)                          |
| **Zod**                  | 4                  | Runtime validation                     |
| **Framer Motion**        | latest             | Animations                             |
| **Orval**                | 8                  | OpenAPI → TypeScript client generation |
| **Vitest**               | latest             | Unit testing                           |

**Workspace packages used:**

- `@quokkaq/shared-types` — Zod schemas and TypeScript types shared with backend contracts
- `@quokkaq/kiosk-lib` — WebSocket client, ESC/POS printing, ticket timer hook
- `@quokkaq/subscription-pricing` — Plan/pricing display utilities

---

## Features by Zone

### Authentication & Onboarding

- Email/password login and signup
- SSO login via OIDC and SAML 2.0 providers (company picker, tenant hints, callback exchange)
- Password recovery (forgot / reset)
- Token-based invitation registration
- First-time system setup wizard (`/setup`, gated by `SystemStatusGuard`)
- Tenant onboarding wizard (`/onboarding`)

### Staff Operations (`/staff`)

- Counter workstation UI: call next, serve, complete, transfer, return-to-queue tickets
- Recall and pick specific tickets
- Add operator comments and visitor information
- Skill-based counter assignment
- Break management (start / end break)
- Journal view per unit

### Supervisor (`/supervisor`)

- Unit supervisor dashboard with live queue overview
- Shift statistics, KPIs, and activity feed
- Journal of all ticket events

### Queue & Tickets (`/queue`, `/ticket`)

- Live queue view per unit with WebSocket updates
- Ticket detail and public-style ticket status page

### Pre-registration (`/pre-registrations`)

- Slot-based appointment management
- Calendar slot grid view and edit

### Client Management (`/clients`)

- CRM-style client list per unit
- Client visit history and survey responses

### Statistics (`/statistics`)

- Timeseries charts, SLA deviation tracking
- Load heatmaps, utilization, staffing forecast
- Employee radar and staff performance
- Survey score aggregation
- PDF export

### Support Reports (`/staff/support`)

- Create and track internal support reports
- Add comments, share with colleagues, mark irrelevant

### Kiosk Interfaces (`/kiosk`)

- Service selection flow with QR code / ticket printing
- Tauri desktop: terminal pairing, ESC/POS printing via `@quokkaq/kiosk-lib`, locale persistence

### Display Screens

| Path                 | Role                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `/screen/[unitId]`   | Public queue display — shows called tickets in real time           |
| `/counter-display`   | Counter-side display — idle advertising, guest satisfaction survey |
| `/workplace-display` | Workplace board above counter — shows current call and service     |

All display screens support terminal pairing via URL `?code=…` or admin panel.

### Tenant Settings (`/settings`)

| Area                | Functionality                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Organization        | Profile, login/SSO security, opaque login links                                                                |
| Billing             | Subscription overview, usage, invoices (list + download), YooKassa payment links                               |
| Users & Invitations | User list, role assignment, pending invitations                                                                |
| Units & Services    | Unit editor: services tree, virtual queue, calendar, guest survey, workplace config, kiosk settings, templates |
| Templates           | Message and notification template management                                                                   |
| Integrations        | Per-company calendar integrations (Google Calendar, CalDAV)                                                    |
| Pricing             | Public plan selector for the tenant                                                                            |
| Desktop Terminals   | Kiosk and display terminal provisioning, pairing codes                                                         |
| Operations          | Emergency unlock, statistics reset                                                                             |
| RBAC                | Tenant roles catalog, role-to-unit mapping, group mappings for SSO                                             |

### SaaS Platform Admin (`/platform`)

Platform operator-only console (`isPlatformAdmin` required):

- Company list and detail (manage all tenants)
- Platform integrations configuration (SMS provider, feature flags)
- Subscription plans CRUD and catalog items
- Platform-level subscriptions management
- Platform invoices (create, issue, list, detail)

### Help & Wiki (`/help`)

In-product wiki rendered from MDX files in `apps/frontend/content/wiki/`. Accessible at `/{locale}/help/[[...slug]]`.

---

## Pages & Routes

All user-facing routes live under `app/[locale]/...` with `locale ∈ {en, ru}`. Legacy paths redirect automatically (e.g. `/admin/*` → `/settings/*`).

```
/                          Home / launcher (permission-driven cards)
/login                     Email/password, SSO, company picker
/login/sso/callback        OAuth/SAML code exchange
/forgot-password           Request password reset
/reset-password            Set new password
/signup                    Account creation
/register/[token]          Invitation registration
/setup                     First-time setup (SystemStatusGuard)
/onboarding                Tenant onboarding wizard

/staff                     Staff landing
/staff/[unitId]/[counterId]  Counter workstation
/staff/support             Support report list
/staff/support/[id]        Support report detail

/supervisor/[unitId]       Supervisor dashboard
/supervisor/[unitId]/journal  Supervisor journal

/queue/[unitId]            Queue view
/ticket/[ticketId]         Ticket detail

/pre-registrations/[unitId]  Appointment management
/clients/[unitId]          Client list
/clients/[unitId]/[clientId]  Client detail
/statistics                Statistics dashboard
/journal/[unitId]          Audit journal

/kiosk/[unitId]            Kiosk (web + Tauri)
/screen/[unitId]           Public queue screen
/counter-display           Counter-side display
/workplace-display         Workplace board above counter

/settings/*                Tenant admin settings (see above)
/platform/*                SaaS platform operator console

/help/[[...slug]]          In-product wiki
```

---

## API Integration

| Layer                      | Description                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Same-origin proxy**      | `app/api/[[...path]]/route.ts` — forwards `/api/*` to the Go backend; avoids browser CORS and Turbopack rewrite issues                        |
| **Authenticated fetch**    | `lib/authenticated-api-fetch.ts` — HttpOnly cookie session, optional Bearer token, `X-Company-Id` header from active company                  |
| **Orval-generated client** | `lib/api/generated/` — strongly-typed hooks per OpenAPI tag (auth, platform, units, tickets, billing, etc.); mutator = `lib/orval-mutator.ts` |
| **Legacy `lib/api.ts`**    | Hand-written REST calls; migrating gradually to Orval                                                                                         |
| **WebSocket**              | `lib/socket.ts` — native `WebSocket` to `NEXT_PUBLIC_WS_URL`; unit-room subscriptions for live ticket/queue events and SLA alerts             |

### Regenerating the API Client

After backend OpenAPI spec changes:

```bash
# From monorepo root
pnpm nx run frontend:orval

# Verify no drift against committed files
pnpm nx run frontend:orval:check
```

---

## Authentication Flow

1. `AuthContext` calls `GET /auth/me` on mount to probe the session
2. Login page uses Orval auth endpoints; SSO callback runs `authSSOExchange`
3. `ActiveCompanyProvider` keeps `X-Company-Id` header in sync
4. RBAC: `ConditionalLayout` + `ProtectedRoute` enforce `requiredPermission`, `requireTenantAdmin`, `requirePlatformOperator`
5. `PermissionGuard` component for fine-grained unit-level checks

---

## Local Development

### Prerequisites

- **Node.js** 22+
- **pnpm** 10+ (workspace root)
- Backend running on `localhost:3001` (see `apps/backend/`)

### Setup

```bash
# From workspace root — installs all monorepo dependencies
pnpm install

# Copy env template
cp apps/frontend/env.local apps/frontend/.env.local
# Edit .env.local with your local URLs if needed
```

The `env.local` template:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

### Run

```bash
# From workspace root
pnpm nx dev frontend
```

Frontend available at <http://localhost:3000>.

### Test

```bash
pnpm nx test frontend
```

### Lint & Format

```bash
pnpm nx lint frontend
pnpm nx run frontend:format:check
```

---

## Deployment

Automated deployment is triggered by pushing to the `release` branch when `apps/frontend/` or `packages/` change.

The pipeline:

1. Bumps the **patch** version in `package.json` (or minor/major based on commit message)
2. Builds a Docker image using `output: 'standalone'`
3. Pushes to **Yandex Container Registry**
4. Deploys to **Yandex Cloud VM** via SSH
5. Creates git tag `vX.Y.Z-frontend`

### Required GitHub Secrets

| Secret                   | Purpose                                |
| ------------------------ | -------------------------------------- |
| `YC_REGISTRY_ID`         | Yandex Container Registry ID           |
| `YC_SA_JSON_CREDENTIALS` | Yandex Cloud service account JSON key  |
| `VM_HOST`                | Deployment server host                 |
| `VM_USERNAME`            | SSH username                           |
| `VM_SSH_KEY`             | SSH private key                        |
| `NEXT_PUBLIC_API_URL`    | Production API URL                     |
| `NEXT_PUBLIC_WS_URL`     | Production WebSocket URL (`wss://...`) |

### Docker

```bash
# Build production image
docker build -t quokkaq-frontend apps/frontend/

# Run
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://api.example.com \
  -e NEXT_PUBLIC_WS_URL=wss://api.example.com \
  quokkaq-frontend
```

> **Important for production:** Set `NEXT_PUBLIC_WS_URL` to `wss://...` — WebSocket connections over plain `ws://` will be rejected by most reverse proxies with TLS termination.

---

## Internationalization

Routes are prefixed with `/{locale}/` where `locale ∈ {en, ru}`. The `proxy.ts` middleware (next-intl) handles locale detection, redirection, and cookie persistence.

---

## Environment Variables Reference

| Variable                   | Required | Default                 | Description                                       |
| -------------------------- | -------- | ----------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`      | Yes      | `http://localhost:3001` | Go backend base URL (browser-side)                |
| `API_UPSTREAM_URL`         | No       | `NEXT_PUBLIC_API_URL`   | Server-side proxy upstream (for containers)       |
| `NEXT_PUBLIC_APP_URL`      | No       | `http://localhost:3000` | Frontend public URL                               |
| `NEXT_PUBLIC_WS_URL`       | Yes      | `http://localhost:3001` | WebSocket server URL (`wss://...` in production)  |
| `NEXT_PUBLIC_OTEL_ENABLED` | No       | —                       | Set to `true` to enable browser OpenTelemetry RUM |
