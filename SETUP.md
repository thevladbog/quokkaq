# Setup Guide for Developers

This guide helps new developers get started with the QuokkaQ monorepo.

## Prerequisites

Install the following tools:

1. **Node.js 22+**
   ```bash
   # macOS
   brew install node@22
   
   # Ubuntu
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **pnpm 10+**
   ```bash
   npm install -g pnpm@10
   ```

3. **Go 1.26+** (for backend development)
   ```bash
   # macOS
   brew install go
   
   # Ubuntu
   wget https://go.dev/dl/go1.26.linux-amd64.tar.gz
   sudo tar -C /usr/local -xzf go1.26.linux-amd64.tar.gz
   export PATH=$PATH:/usr/local/go/bin
   ```

4. **Rust** (for kiosk-desktop development)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

5. **Docker** (for running backend dependencies)
   ```bash
   # macOS
   brew install --cask docker
   
   # Ubuntu
   sudo apt-get update
   sudo apt-get install docker.io docker-compose
   ```

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd quokkaq
pnpm install
```

The `prepare` script installs **Git hooks** (Husky). On each commit, **lint-staged** runs on staged files only:

- **`apps/frontend`**: `eslint --fix` and Prettier
- **`apps/backend`**: `gofmt -s -w`
- **`packages/shared-types`**, **`kiosk-lib`**, **`ui-kit`**: Prettier (uses `apps/frontend/.prettierrc.json`)

To skip hooks once: `HUSKY=0 git commit ...`. To run the same checks manually on staged files: `pnpm precommit`.

Full backend checks (`golangci-lint`, `go vet`, Swagger diff) remain in CI.

### 2. Build Packages

Packages must be built before apps can use them:

```bash
pnpm nx run-many -t build --projects=shared-types,ui-kit,kiosk-lib
```

### 3. Run Backend

```bash
# Start dependencies (PostgreSQL, Redis, MinIO)
cd apps/backend
docker-compose up -d

# Copy environment file
cp .env.example .env

# Run migrations (if needed)
# go run cmd/api/main.go migrate

# Start backend
pnpm nx serve backend
```

Backend will be available at `http://localhost:3001`

### 4. Run Frontend

```bash
# Copy environment file
cd apps/frontend
cp env.local .env.local

# Start frontend
pnpm nx dev frontend
```

Frontend will be available at `http://localhost:3000`

### 5. Run Kiosk Desktop

```bash
cd apps/kiosk-desktop
pnpm nx dev kiosk-desktop
```

## Development Workflow

### Working on a Feature

1. **Create a branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes**
   - Edit files in `apps/` or `packages/`
   - Write tests
   - Run linting

3. **Test your changes**
   ```bash
   # Test only affected projects
   pnpm nx affected -t test
   
   # Lint only affected
   pnpm nx affected -t lint
   
   # Build only affected
   pnpm nx affected -t build
   ```

4. **Commit**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/my-feature
   ```

### Working with Packages

If you modify a shared package, dependent apps will be automatically affected:

```bash
# Modify packages/shared-types
echo "export type NewType = { id: string };" >> packages/shared-types/src/index.ts

# Build the package
pnpm nx build shared-types

# Check what's affected
pnpm nx affected:graph
```

### Running Specific Commands

```bash
# Run frontend dev server
pnpm nx dev frontend

# Build backend
pnpm nx build backend

# Test kiosk-desktop
pnpm nx test kiosk-desktop

# Lint ui-kit
pnpm nx lint ui-kit
```

## Common Tasks

### Adding a New Dependency

**For an app:**
```bash
cd apps/frontend
pnpm add react-query
```

**For a package:**
```bash
cd packages/ui-kit
pnpm add lucide-react
```

**For root (devDependencies):**
```bash
pnpm add -D -w @nx/react
```

### Creating a New Component in UI-Kit

1. Create the component file:
   ```bash
   touch packages/ui-kit/src/components/my-component.tsx
   ```

2. Implement the component:
   ```tsx
   export function MyComponent() {
     return <div>Hello</div>;
   }
   ```

3. Export it in `packages/ui-kit/src/index.ts`:
   ```typescript
   export * from './components/my-component';
   ```

4. Build the package:
   ```bash
   pnpm nx build ui-kit
   ```

5. Use it in an app:
   ```typescript
   import { MyComponent } from '@quokkaq/ui-kit';
   ```

### Adding a Type to Shared-Types

1. Edit `packages/shared-types/src/index.ts`:
   ```typescript
   export type MyType = {
     id: string;
     name: string;
   };
   
   export const MyTypeSchema = z.object({
     id: z.string(),
     name: z.string()
   });
   ```

2. Build:
   ```bash
   pnpm nx build shared-types
   ```

3. Use in apps:
   ```typescript
   import { MyType, MyTypeSchema } from '@quokkaq/shared-types';
   ```

## Troubleshooting

### "Cannot find module '@quokkaq/...'"

Rebuild the packages:
```bash
pnpm nx run-many -t build --projects=shared-types,ui-kit,kiosk-lib
```

### "Port already in use"

Check what's running on the port:
```bash
# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Nx Cache Issues

Reset Nx cache:
```bash
pnpm nx reset
```

### Database Errors

Reset backend database:
```bash
cd apps/backend
docker-compose down -v
docker-compose up -d
# Wait for PostgreSQL to start
sleep 5
# Run migrations if needed
```

### TypeScript Errors

Regenerate TypeScript caches:
```bash
pnpm nx run-many -t build --all --skip-nx-cache
```

## IDE Setup

### VSCode

Recommended extensions:
- **Nx Console** - UI for Nx commands
- **ESLint** - JavaScript linting
- **Prettier** - Code formatting
- **Go** - Go language support
- **rust-analyzer** - Rust language support

Settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### WebStorm

1. Enable Nx support: Preferences → Languages & Frameworks → Nx
2. Set Node.js version to 22
3. Enable ESLint: Preferences → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
4. Enable Prettier: Preferences → Languages & Frameworks → JavaScript → Prettier

## Testing

### Frontend Tests

```bash
cd apps/frontend
pnpm test
```

### Backend Tests

```bash
cd apps/backend
go test ./...
```

### E2E Tests

(To be added)

## Deployment

`main` is the trunk branch (merge via pull requests). Production releases run only after you merge into the **`release`** branch (for example a PR from `main` into `release`).

Deployment happens automatically via GitHub Actions on push to **`release`** when paths change:

1. **Frontend** — if `apps/frontend/` or `packages/` changed
2. **Backend** — if `apps/backend/` changed
3. **Kiosk** — if `apps/kiosk-desktop/` or `packages/` changed

Create `release` once from `main` if it does not exist yet, then keep it updated with merges from `main`. See [README.md](README.md#cicd) for details.

## SaaS platform admin (product owner)

The operator UI lives at **`/{locale}/platform`** (for example `/en/platform`). It uses a **separate sidebar** from the tenant admin panel (`/admin`). Access requires the **`platform_admin`** role on the user (this is not the same as the tenant **`admin`** role).

### Grant `platform_admin`

From [`apps/backend`](apps/backend) with `DATABASE_URL` (or your usual backend env) loaded:

```bash
go run ./cmd/assign-platform-admin -email=you@example.com
```

The command creates the `platform_admin` role in the database if it is missing, then assigns it to the user with that email. Fresh dev databases created with [`cmd/seed`](apps/backend/cmd/seed/main.go) or [`cmd/seed-simple`](apps/backend/cmd/seed-simple/main.go) grant **`platform_admin` to the seeded demo admin** (`admin@quokkaq.com`) alongside the tenant `admin` role, so local `/platform` works without `PLATFORM_ALLOW_TENANT_ADMIN`.

### Local dev: tenant `admin` without `platform_admin`

If you log in as the usual organization **admin** (not `platform_admin`), the UI and API still allow `/platform` **only in non-production** when:

- **Backend:** Tenant `admin` can call `/platform/*` when `APP_ENV` is **not** `production` and either `PLATFORM_ALLOW_TENANT_ADMIN=true` is set, or `PLATFORM_ALLOW_TENANT_ADMIN` is **unset** and `APP_ENV` is empty, `development`, `dev`, or `local` (typical `go run` without a restrictive `.env`). **`docker-compose.yml` under `apps/backend` defaults `PLATFORM_ALLOW_TENANT_ADMIN` to `false`** (fail closed); set `PLATFORM_ALLOW_TENANT_ADMIN=true` in your environment or compose `.env` when you intentionally want tenant admins on `/platform` in that stack (still never for production). Set `PLATFORM_ALLOW_TENANT_ADMIN=false` explicitly to turn off the unset/dev fallback when running the binary directly. Staging with e.g. `APP_ENV=staging` does **not** get tenant-admin platform access unless you set `PLATFORM_ALLOW_TENANT_ADMIN=true` or assign `platform_admin`.
- **Frontend:** `next dev` treats tenant admins as allowed on `/platform`. For `next start` or preview builds, set `NEXT_PUBLIC_PLATFORM_ALLOW_TENANT_ADMIN=true` in the frontend env.

In **production** (`APP_ENV=production`), only users with **`platform_admin`** can use `/platform`; set `PLATFORM_ALLOW_TENANT_ADMIN=false` if you ever run a non-production build with a loose `APP_ENV`.

### API

Operator endpoints are under **`/platform/*`** on the Go API (JWT + `platform_admin`, or tenant `admin` when allowed as above). The Next.js app calls them via `/api` (proxied to the Go server). Use **`POST /platform/subscriptions`** with `companyId`, `planId`, and optional `currentPeriodStart` / `currentPeriodEnd` to create a subscription for an organization. **Multiple subscriptions per company are allowed** (e.g. for future billing periods); the operator is responsible for ensuring periods don't overlap or align with billing logic. The latest created subscription updates `company.subscription_id`. The operator UI exposes this on the **Subscriptions** page with a combobox search (by company name or ID) and date/time pickers for the billing period.

If the browser shows **`API Error: 404`** for `/api/platform/...`, the running API binary is older than the repo: rebuild and restart the Go backend so it registers the `/platform` route group. Check `NEXT_PUBLIC_API_URL` points at that server.

### Billing notes

- **Manual invoices** created in the platform UI are stored in the application database (`paymentProvider: manual`). They do **not** create corresponding objects in Stripe unless you add that integration. An invoice may exist **without** a `subscriptionId` until an operator links it. **`POST /platform/invoices`** accepts optional `subscriptionId`, or `createSubscriptionWithInvoice` plus a `subscription` block (plan and period) to create the company’s subscription and the invoice in one transaction. **`PATCH /platform/invoices/:id`** can set `subscriptionId` when the subscription belongs to the same company; use `clearSubscriptionId: true` to unlink **manual** invoices only (Stripe-linked rows stay consistent with webhooks).
- **Stripe** remains the source of truth for customer self-serve Checkout subscriptions. Patching subscription fields via the platform API/UI can intentionally diverge from Stripe for support cases; use with care.
- **Plan changes from the platform:** `PATCH /platform/subscriptions/:id` accepts `planId` (immediate tier change; clears any scheduled change) or paired `pendingPlanId` + `pendingEffectiveAt` (RFC3339, must be in the future) to defer the switch. Until that instant (UTC), **quotas** still use the current plan; after it, the new plan applies on the next quota or `/subscriptions/me` read. Use `clearPending: true` to drop a scheduled change without changing the current plan.
- **Stripe-linked subscriptions:** If the row has a non-empty `stripeSubscriptionId`, the same `PATCH` returns **409 Conflict** when the body tries to change tier scheduling (`planId`, `pendingPlanId`/`pendingEffectiveAt`, or `clearPending`). Patches that only adjust status, billing period, `trialEnd`, or `cancelAtPeriodEnd` are still allowed for support workflows.

### DaData (optional, RU counterparty)

Legal / billing counterparty details for Russian organizations live in **`companies.counterparty`** (JSONB). Tenant admins use **`GET` / `PATCH /companies/me`**; operators use **`PATCH /platform/companies/:id`**. The backend can proxy [DaData](https://dadata.ru/api/) Suggestions and Cleaner APIs so API keys never reach the browser: **`POST /companies/dadata/...`** (tenant admin JWT) and **`POST /platform/dadata/...`** (platform admin JWT). Configure **`DADATA_API_KEY`** (and optionally **`DADATA_SECRET`**, **`DADATA_CLEANER_API_KEY`** for address normalization / Cleaner UI) in `apps/backend/.env`; see [docs/third-party/dadata/README.md](docs/third-party/dadata/README.md). **`GET /companies/me`** and **`GET /platform/features`** expose **`features.dadata`** and **`features.dadataCleaner`** (cleaner flag is true only when **`DADATA_CLEANER_API_KEY`** is set) for the UI.

### SaaS operator tenant (on-prem)

Exactly **one** company per deployment can be marked as the **SaaS operator** (`companies.is_saas_operator`, exposed as **`isSaasOperator`** in JSON). Fresh seeds set this on the demo company.

- **Platform UI:** Companies list shows an **Operator** badge; company detail has a switch. Setting it **on** clears the flag on every other company (enforced in DB with a partial unique index on `true`).
- **Quotas:** That company **always has unlimited quotas** (`-1` limits in [`QuotaService`](apps/backend/internal/services/quota_service.go)), independent of subscription or plan JSON — so a missing Stripe subscription cannot lock out the installation owner.
- **Legal profile:** Reuse the same `counterparty` / billing fields as any tenant. Resolve the operator row via **`GET /platform/saas-operator-company`** (platform JWT) or `CompanyRepository.FindSaaSOperatorCompany()` when implementing invoice PDFs, email footers, or branding (not all wired yet).
- **After restore from backup:** Confirm exactly one operator company is marked; otherwise run the platform switch once or set the flag via SQL.

### CORS

If you host the operator UI on a separate origin (for example `https://platform.example.com` while the app is `https://app.example.com`), add that origin to the backend **`CORS_ALLOWED_ORIGINS`** list.

## Getting Help

- **Documentation**: See [README.md](README.md)
- **Nx Docs**: https://nx.dev
- **Issues**: Create an issue in the repository
- **Team Chat**: [Your team chat link]

## Useful Commands Cheat Sheet

```bash
# Install dependencies
pnpm install

# Build all
pnpm nx run-many -t build --all

# Build only affected
pnpm nx affected -t build

# Test all
pnpm nx run-many -t test --all

# Lint all
pnpm nx run-many -t lint --all

# Run frontend
pnpm nx dev frontend

# Run backend
pnpm nx serve backend

# Run kiosk
pnpm nx dev kiosk-desktop

# Visualize dependency graph
pnpm nx graph

# Clear cache
pnpm nx reset

# Check what's affected
pnpm nx affected:graph

# Run a command in an app
pnpm nx <target> <project>
# Example: pnpm nx build frontend
```
