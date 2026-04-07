# QuokkaQ Monorepo

Nx-based monorepo for the QuokkaQ queue management system.

## Architecture

This monorepo contains three main applications and three shared packages:

### Applications (`apps/`)

- **frontend** - Next.js web application for administrators and staff
- **backend** - Go API server with PostgreSQL, Redis, and MinIO
- **kiosk-desktop** - Tauri desktop application for self-service kiosks

### Packages (`packages/`)

- **shared-types** - TypeScript types and Zod schemas shared between apps
- **ui-kit** - Reusable React UI components (shadcn/ui based)
- **kiosk-lib** - Kiosk-specific utilities (printing, websockets, timers)

## Getting Started

### Prerequisites

- **Node.js** 22+
- **pnpm** 10+
- **Go** 1.26+ (for backend)
- **Rust** (for kiosk-desktop)

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm nx run-many -t build --all
```

### Development

Run apps individually:

```bash
# Frontend
pnpm nx dev frontend

# Backend
pnpm nx serve backend

# Kiosk Desktop
pnpm nx dev kiosk-desktop
```

## Project Structure

```
quokkaq/
├── apps/
│   ├── frontend/          # Next.js app
│   │   ├── app/           # App router pages
│   │   ├── components/    # React components
│   │   ├── lib/           # Utilities
│   │   └── package.json
│   │
│   ├── backend/           # Go API
│   │   ├── cmd/           # Entry points
│   │   ├── internal/      # Business logic
│   │   ├── go.mod
│   │   └── Dockerfile
│   │
│   └── kiosk-desktop/     # Tauri app
│       ├── agent/         # Go printer agent
│       ├── src-tauri/     # Rust backend
│       └── package.json
│
├── packages/
│   ├── shared-types/      # Common types
│   ├── ui-kit/            # UI components
│   └── kiosk-lib/         # Kiosk utilities
│
├── .github/workflows/     # CI/CD pipelines
├── nx.json                # Nx configuration
├── pnpm-workspace.yaml    # pnpm workspace config
└── tsconfig.base.json     # Base TypeScript config
```

## Nx Commands

### Building

```bash
# Build everything
pnpm nx run-many -t build --all

# Build only affected projects
pnpm nx affected -t build

# Build specific app
pnpm nx build frontend
```

### Testing

```bash
# Test all
pnpm nx run-many -t test --all

# Test only affected
pnpm nx affected -t test
```

### Linting

```bash
# Lint all
pnpm nx run-many -t lint --all

# Lint only affected
pnpm nx affected -t lint
```

### Dependency Graph

Visualize project dependencies:

```bash
pnpm nx graph
```

## CI/CD

The monorepo uses Nx affected detection to intelligently deploy only changed applications:

### Workflows

1. **CI** (`.github/workflows/ci.yml`)
   - Runs on every PR and push to `main`
   - Tests, lints, and builds only affected projects
   - Uses Nx cache for faster builds

2. **Deploy Frontend** (`.github/workflows/deploy-frontend.yml`)
   - Triggers when `apps/frontend/` or `packages/` change
   - Bumps version in `apps/frontend/package.json`
   - Builds Docker image
   - Deploys to Yandex Cloud
   - Tags release as `vX.Y.Z-frontend`

3. **Deploy Backend** (`.github/workflows/deploy-backend.yml`)
   - Triggers when `apps/backend/` changes
   - Bumps version in `apps/backend/VERSION`
   - Builds Docker image
   - Deploys to Yandex Cloud
   - Tags release as `vX.Y.Z-backend`

4. **Release Kiosk** (`.github/workflows/release-kiosk.yml`)
   - Triggers when `apps/kiosk-desktop/` or `packages/` change
   - Bumps version in `package.json`, `Cargo.toml`, `tauri.conf.json`
   - Builds for macOS, Windows, and Linux in parallel
   - Creates GitHub Release
   - Tags release as `vX.Y.Z-kiosk`

### Version Bumping

Versions are bumped automatically based on commit messages:

- `[major]` or `BREAKING CHANGE` → major version bump
- `[minor]` or `feat:` → minor version bump
- Otherwise → patch version bump

Example:
```bash
git commit -m "feat: add new feature [minor]"
```

### Independent Versioning

Each application has its own version:
- Frontend: `apps/frontend/package.json`
- Backend: `apps/backend/VERSION`
- Kiosk: `apps/kiosk-desktop/package.json`

Tags follow the pattern: `v1.2.3-frontend`, `v1.2.3-backend`, `v1.2.3-kiosk`

## Package Dependencies

```
frontend
├── @quokkaq/shared-types
└── @quokkaq/ui-kit

kiosk-desktop
├── @quokkaq/shared-types
├── @quokkaq/ui-kit
└── @quokkaq/kiosk-lib

kiosk-lib
└── @quokkaq/shared-types
```

Nx automatically detects these dependencies and:
- Builds packages in the correct order
- Deploys apps when their dependencies change
- Caches builds for faster rebuilds

## Adding a New Package

1. Create directory: `packages/my-package/`
2. Add `package.json`:
   ```json
   {
     "name": "@quokkaq/my-package",
     "version": "0.1.0",
     "main": "./src/index.ts"
   }
   ```
3. Add `project.json`:
   ```json
   {
     "name": "my-package",
     "$schema": "../../node_modules/nx/schemas/project-schema.json",
     "sourceRoot": "packages/my-package/src",
     "projectType": "library",
     "tags": ["type:lib"]
   }
   ```
4. Add `tsconfig.json` (extends `../../tsconfig.base.json`)
5. Update `tsconfig.base.json` paths:
   ```json
   {
     "paths": {
       "@quokkaq/my-package": ["packages/my-package/src/index.ts"]
     }
   }
   ```
6. Run `pnpm install`

## Environment Variables

### Frontend

See `apps/frontend/.env.example`

### Backend

See `apps/backend/.env.example` and `apps/backend/.env.prod.example`

### CI/CD Secrets

Required GitHub secrets:
- `YC_SA_JSON_CREDENTIALS` - Yandex Cloud service account JSON
- `YC_REGISTRY_ID` - Yandex Container Registry ID
- `VM_HOST` - Deployment server host
- `VM_USERNAME` - Deployment server username
- `VM_SSH_KEY` - SSH private key for deployment
- `NEXT_PUBLIC_API_URL` - Frontend API URL
- `NEXT_PUBLIC_WS_URL` - Frontend WebSocket URL
- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, etc. - Backend secrets

## Troubleshooting

### Nx Cache Issues

Clear Nx cache:
```bash
pnpm nx reset
```

### Dependency Issues

Reinstall all dependencies:
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### Build Errors

Build packages in order:
```bash
pnpm nx run-many -t build --projects=shared-types,ui-kit,kiosk-lib
pnpm nx run-many -t build --projects=frontend,backend,kiosk-desktop
```

## Migration from Old Structure

This monorepo was migrated from three separate repositories:
- `quokkaq-frontend` → `apps/frontend`
- `quokkaq-go-backend` → `apps/backend`
- `quokkaq-kiosk-desktop` → `apps/kiosk-desktop`

The old repositories are archived in `../quokkaq-old/` and can be restored if needed.

## Contributing

1. Create a feature branch from `main`
2. Make changes
3. Run tests and linting
4. Create a PR
5. CI will automatically test only affected projects
6. After merge to `main`, affected apps will be deployed automatically

## License

See individual app LICENSE files.
