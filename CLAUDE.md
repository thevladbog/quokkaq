# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

QuokkaQ is a multi-tenant SaaS platform for managing queuing, kiosk check-ins, and digital signage. It is an **Nx monorepo** managed with **pnpm**.

**Apps:**
- `apps/frontend` — Next.js 16 + React 19, main web app (port 3000)
- `apps/backend` — Go 1.26 REST API with PostgreSQL, Redis, MinIO (port 3001)
- `apps/marketing` — Next.js 16 public marketing site (port 3010)
- `apps/kiosk-desktop` — Tauri 2 + Rust desktop kiosk app

**Packages:**
- `packages/shared-types` — TypeScript/Zod schemas shared across apps
- `packages/ui-kit` — React component library (Radix UI + Tailwind CSS 4)
- `packages/kiosk-lib` — Tauri API wrappers and kiosk utilities
- `packages/subscription-pricing` — Pricing calculation utilities

## Development Commands

All tasks go through Nx. Use `pnpm nx <target> <project>` or `pnpm nx run-many`.

### Frontend
```bash
pnpm nx dev frontend          # Dev server (port 3000)
pnpm nx build frontend
pnpm nx test frontend         # Vitest
pnpm nx lint frontend
pnpm nx format:fix frontend
pnpm nx orval frontend        # Regenerate API client from OpenAPI spec
```

Run a single test file:
```bash
cd apps/frontend && pnpm vitest run src/path/to/file.test.tsx
```

Vitest has two projects: `unit-node` (lib/**, api/**) and `component-jsdom` (*.test.tsx).

### Backend
```bash
pnpm nx serve backend         # Dev server with hot reload
pnpm nx build backend         # go build -o bin/server ./cmd/api
pnpm nx test backend          # go test ./...
pnpm nx lint backend          # golangci-lint run
pnpm nx openapi backend       # Regenerate OpenAPI spec (swag init + convert)
```

Run a single Go test:
```bash
cd apps/backend && go test -v -run TestName ./path/to/package/...
```

### Kiosk Desktop
```bash
pnpm nx dev kiosk-desktop     # tauri dev
pnpm nx build kiosk-desktop
pnpm nx test kiosk-desktop    # cargo nextest run --profile ci
pnpm nx lint kiosk-desktop    # cargo clippy
```

### Shared Packages
```bash
pnpm nx run-many -t build --projects=shared-types,ui-kit,kiosk-lib
```
Build shared packages before running apps locally if types are missing.

### Monorepo-wide
```bash
pnpm nx affected -t build     # Build only changed projects
pnpm nx affected -t test      # Test only changed projects
pnpm nx graph                 # Visualize dependency graph
```

## Architecture

### API Contract Workflow (critical)
The backend owns the API contract. Any API change requires this sequence:
1. Update Go handler/model code in `apps/backend`
2. Run `pnpm nx openapi backend` to regenerate the OpenAPI 3 spec
3. Run `pnpm nx orval frontend` (and/or `orval marketing`) to regenerate TypeScript API clients
4. CI validates that generated artifacts match git (`openapi:check`, `orval:check`)

The generated TypeScript client lives at `apps/frontend/src/lib/api/generated/` and is excluded from ESLint.

### Real-time
WebSocket connection at `/ws` on the backend (Gorilla WebSocket). Frontend connects via `NEXT_PUBLIC_WS_URL`.

### Authentication & Multi-tenancy
The backend supports per-tenant OIDC and SAML SSO. SSO secrets are encrypted with `SSO_SECRETS_ENCRYPTION_KEY`. JWT-based sessions.

### Dependency Graph
```
shared-types  ←  ui-kit
     ↑               ↑
   kiosk-lib       frontend
     ↑             marketing
kiosk-desktop
```

Apps depend on packages but packages never depend on apps.

## Local Setup

Start infrastructure (PostgreSQL, Redis, MinIO):
```bash
cd apps/backend && docker-compose up -d
```

Copy and configure env:
```bash
cp apps/backend/.env.example apps/backend/.env
```

Key env vars for local dev:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quokkaq
REDIS_URL=redis://localhost:6379/0
AWS_ENDPOINT=http://localhost:9000   # MinIO
JWT_SECRET=<any-random-string>
```

Frontend reads `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` from `.env.local`.

## Pre-commit Hooks

Husky + lint-staged runs automatically on `git commit`:
- **Frontend/packages**: `eslint --fix` + `prettier`
- **Backend**: `gofmt -s -w`
- **Frontend format check**: runs separately via `pnpm run precommit`

Skip hooks when needed: `HUSKY=0 git commit ...`

## Key Technology Choices

- **State management**: TanStack Query v5 (server state) + Zustand 5 (client state) + Immer
- **Forms**: React Hook Form + `@hookform/resolvers` + Zod
- **i18n**: next-intl 4 with `next-i18n-router`
- **Styling**: Tailwind CSS 4 with `@tailwindcss/postcss` (PostCSS plugin, not Vite/webpack)
- **Icons**: Lucide React
- **UI primitives**: Radix UI (in ui-kit), shadcn/ui patterns
- **Background jobs**: Asynq (Redis-backed) in Go backend
- **Observability**: OpenTelemetry with OTLP export (`OTEL_EXPORTER_OTLP_ENDPOINT`)

## Nx Project Tags

Projects are tagged for filtering:
- Platform: `platform:web`, `platform:backend`, `platform:desktop`
- Scope: `scope:shared`, `scope:ui`, `scope:kiosk`
- Type: `type:app`, `type:lib`
