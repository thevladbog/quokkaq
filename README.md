<div align="center">
  <img src="./quokka-logo.svg" alt="QuokkaQ Mascot" width="150"/>
  <h1>QuokkaQ Monorepo</h1>
  <p><strong>Modern queue management system - Nx monorepo with Next.js, Go, and Tauri</strong></p>
  
  [![Nx](https://img.shields.io/badge/Nx-22.6.1-143055?style=flat&logo=nx)](https://nx.dev/)
  [![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Go](https://img.shields.io/badge/Go-1.26+-00ADD8?style=flat&logo=go&logoColor=white)](https://golang.org/)
  [![pnpm](https://img.shields.io/badge/pnpm-10+-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)
  [![Next.js](https://img.shields.io/badge/Next.js-16+-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![Tauri](https://img.shields.io/badge/Tauri-2.1+-FFC131?style=flat&logo=tauri&logoColor=white)](https://tauri.app/)
  [![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Applications](#applications)
- [Packages](#packages)
- [Getting Started](#getting-started)
- [Development](#development)
- [CI/CD](#cicd)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## 🌟 Overview

**QuokkaQ** is a comprehensive, modern queue management system designed for organizations that need to efficiently manage customer flows across multiple service units. Built as an Nx monorepo, QuokkaQ combines the power of Next.js, Go, and Tauri to deliver a seamless experience across web, API, and desktop platforms.

### What's Included

- 🌐 **Web Application** - Next.js 16 with React 19, TanStack Query, and shadcn/ui
- 🔧 **API Backend** - Go 1.26 with PostgreSQL, Redis, WebSocket, and MinIO
- 🖥️ **Desktop Kiosk** - Tauri 2.1 desktop application with thermal printer support
- 📦 **Shared Packages** - TypeScript types (Zod schemas), React UI components, and kiosk utilities

### Key Features

- ✅ **Multi-tenant Support** - Manage multiple units/branches from a single system
- ✅ **Real-time Updates** - WebSocket-based notifications for instant queue updates
- ✅ **Self-service Kiosks** - Desktop application for ticket dispensing with printer integration
- ✅ **Staff Management** - Counter assignment, shift tracking, and performance monitoring
- ✅ **Booking System** - Pre-scheduled appointments with slot management
- ✅ **Display Screens** - Public queue display with real-time ticket calling
- ✅ **Supervisor Dashboard** - Comprehensive oversight of unit operations
- ✅ **User Invitations** - Template-based email system for user onboarding
- ✅ **Internationalization** - Full support for English and Russian languages

---

## 🏗️ Architecture

### Monorepo Structure

```mermaid
graph TB
    subgraph monorepo [QuokkaQ Monorepo]
        subgraph apps [Applications]
            frontend[Frontend<br/>Next.js 16 + React 19<br/>Port 3000]
            backend[Backend<br/>Go 1.26 + PostgreSQL<br/>Port 3001]
            kiosk[Kiosk Desktop<br/>Tauri 2.1 + Rust]
        end
        
        subgraph packages [Shared Packages]
            sharedTypes[shared-types<br/>TypeScript Types + Zod]
            uiKit[ui-kit<br/>React Components]
            kioskLib[kiosk-lib<br/>Kiosk Utilities]
        end
        
        frontend -->|uses| sharedTypes
        frontend -->|uses| uiKit
        
        kiosk -->|uses| sharedTypes
        kiosk -->|uses| uiKit
        kiosk -->|uses| kioskLib
        
        kioskLib -->|uses| sharedTypes
        
        frontend -->|HTTP/WS| backend
        kiosk -->|HTTP/WS| backend
    end
    
    subgraph infrastructure [Infrastructure]
        postgres[(PostgreSQL)]
        redis[(Redis)]
        minio[(MinIO/S3)]
    end
    
    backend --> postgres
    backend --> redis
    backend --> minio
```

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Monorepo** | Nx | 22.6.1 |
| **Package Manager** | pnpm | 10+ |
| **Node.js** | Node.js | 22+ |
| **Frontend** | Next.js | 16.2.1 |
| **Frontend UI** | React | 19.2.4 |
| **Styling** | Tailwind CSS | 4+ |
| **UI Components** | shadcn/ui (Radix) | Latest |
| **Backend** | Go | 1.26.0 |
| **Backend Framework** | Chi Router | v5 |
| **Desktop** | Tauri | 2.1+ |
| **Database** | PostgreSQL | 16+ |
| **Cache** | Redis | 7+ |
| **Storage** | MinIO/S3 | Latest |
| **Real-time** | WebSocket | Native |

---

## 📱 Applications

### Frontend (`apps/frontend/`)

**Next.js web application** for administrators and staff.

**Features:**
- 👥 **Admin Panel** - Manage units, services, counters, users, and system settings
- 🎫 **Staff Panel** - Call, serve, and complete tickets at service counters
- 📊 **Supervisor Dashboard** - Monitor unit performance and queue statistics
- 🖥️ **Kiosk Interface** - Self-service ticket dispensing (web version)
- 📺 **Display Screen** - Public queue display with real-time updates
- 🌍 **Internationalization** - English and Russian locales with next-intl

**Technology:**
- Next.js 16 (App Router)
- React 19
- TypeScript 6
- Tailwind CSS 4
- shadcn/ui (Radix UI)
- TanStack Query
- Framer Motion
- next-intl

**Port:** `3000`

**Documentation:** [apps/frontend/README.md](apps/frontend/README.md)

---

### Backend (`apps/backend/`)

**Go API server** with PostgreSQL, Redis, and MinIO integration.

**Features:**
- 🔐 **Authentication** - JWT-based auth with role-based access control
- 🎫 **Queue Management** - Create, call, transfer, and complete tickets
- 📡 **Real-time WebSocket** - Room-based broadcasting for unit updates
- 🔄 **Background Jobs** - Async task processing with Asynq
- 📧 **Email System** - Template-based email notifications
- 📦 **File Storage** - MinIO/S3-compatible storage for logos and media
- 🔍 **API Documentation** - Interactive Scalar API reference
- 📝 **Audit Logging** - Comprehensive activity tracking

**Technology:**
- Go 1.26
- Chi Router v5
- PostgreSQL (GORM)
- Redis (Asynq)
- Gorilla WebSocket
- MinIO/AWS SDK v2
- gomail v2

**Port:** `3001`

**Documentation:** [apps/backend/README.md](apps/backend/README.md) | [apps/backend/README.ru.md](apps/backend/README.ru.md)

---

### Kiosk Desktop (`apps/kiosk-desktop/`)

**Tauri desktop application** for self-service kiosks with thermal printer support.

**Features:**
- 🖨️ **Thermal Printing** - Direct printer integration via Go sidecar agent
- 🔒 **Kiosk Mode** - Fullscreen lockdown mode for public terminals
- 🎯 **Terminal Pairing** - Secure device registration via pairing codes
- 🌍 **Multi-language** - Persistent locale selection per terminal
- ⚡ **Offline Resilience** - Handles network interruptions gracefully
- 🔊 **Audio Feedback** - Optional sound effects for user interactions

**Technology:**
- Tauri 2.1 (Rust)
- React 19
- TypeScript
- Go 1.26 (printer agent sidecar)
- ESC/POS printing protocol

**Documentation:** [apps/kiosk-desktop/README.md](apps/kiosk-desktop/README.md)

---

## 📦 Packages

### `shared-types` (`packages/shared-types/`)

TypeScript types and Zod validation schemas shared between frontend and kiosk applications.

**Contents:**
- API request/response types
- Domain models (Ticket, Service, Counter, Unit, etc.)
- Zod validation schemas
- Type guards and utilities

**Usage:**
```typescript
import { Ticket, TicketStatus } from '@quokkaq/shared-types';
```

---

### `ui-kit` (`packages/ui-kit/`)

Reusable React UI components based on shadcn/ui and Radix UI primitives.

**Contents:**
- Form components (Button, Input, Select, etc.)
- Layout components (Card, Dialog, Popover, etc.)
- Custom components (Logo, ThemeToggle, etc.)
- Tailwind CSS configuration

**Usage:**
```typescript
import { Button } from '@quokkaq/ui-kit';
```

---

### `kiosk-lib` (`packages/kiosk-lib/`)

Kiosk-specific utilities for WebSocket connections, printing, and timers.

**Contents:**
- WebSocket client wrapper
- Thermal printer utilities
- Timer and timeout management
- Kiosk-specific hooks and helpers

**Usage:**
```typescript
import { usePrinter, useKioskTimer } from '@quokkaq/kiosk-lib';
```

---

### Package Dependencies

```text
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

---

## 🚀 Getting Started

### Prerequisites

Before running QuokkaQ, ensure you have:

- **Node.js** 22+ ([Download](https://nodejs.org/))
- **pnpm** 10+ ([Installation](https://pnpm.io/installation))
- **Go** 1.26+ ([Download](https://golang.org/dl/)) - for backend
- **Rust** (stable) ([Installation](https://rustup.rs/)) - for kiosk-desktop
- **Docker** ([Download](https://www.docker.com/)) - for infrastructure services

---

### Installation

Clone the repository and install dependencies:

```bash
# Clone the repository
git clone <repository-url>
cd quokkaq

# Install all dependencies
pnpm install
```

---

### Quick Start

#### Option 1: Run Full Stack Locally

**1. Start backend infrastructure (PostgreSQL, Redis, MinIO):**

```bash
cd apps/backend
docker-compose up -d postgres redis minio
```

**2. Create backend `.env` file:**

```bash
# From apps/backend/ directory
cp .env.example .env
# Edit .env with your configuration
```

> ⚠️ **SECURITY WARNING**: The `.env.example` contains placeholder values. **Replace all secrets with strong, randomly generated values** before deploying to production. Never commit real secrets to version control.

**3. Start backend API:**

```bash
# From apps/backend/ directory
go run cmd/api/main.go
```

The backend API will be available at <http://localhost:3001>

- API Documentation: <http://localhost:3001/swagger/>
- WebSocket: ws://localhost:3001/ws

**4. Create frontend `.env.local` file:**

```bash
# Create .env.local from the template
cp apps/frontend/env.local apps/frontend/.env.local
```

The template contains:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

> **Note:** The `env.local` (without dot) is a template file tracked in git. The `.env.local` (with dot) is your local configuration and is gitignored.

**5. Start frontend:**

```bash
pnpm nx dev frontend
```

The frontend will be available at <http://localhost:3000>

**6. (Optional) Start kiosk desktop:**

```bash
# From workspace root - Nx will build agent and start dev server
pnpm nx dev kiosk-desktop
```

> **Note:** The kiosk desktop requires Rust toolchain. The `dev` command automatically builds the Go agent sidecar before starting Tauri.

---

#### Option 2: Run Individual Apps with Nx

```bash
# Frontend only
pnpm nx dev frontend

# Backend (requires infrastructure services running)
pnpm nx serve backend

# Kiosk Desktop
pnpm nx dev kiosk-desktop
```

---

## 🛠️ Development

### Running Applications

```bash
# Run all apps in dev mode
pnpm nx run-many -t dev

# Run specific app
pnpm nx dev frontend
pnpm nx serve backend
pnpm nx dev kiosk-desktop
```

---

### Building

```bash
# Build all projects
pnpm nx run-many -t build --all

# Build only affected projects (based on git changes)
pnpm nx affected -t build

# Build specific app
pnpm nx build frontend
pnpm nx build backend
```

---

### Testing

```bash
# Test all projects
pnpm nx run-many -t test --all

# Test only affected
pnpm nx affected -t test

# Test specific app
pnpm nx test frontend
```

---

### Linting

```bash
# Lint all projects
pnpm nx run-many -t lint --all

# Lint only affected
pnpm nx affected -t lint

# Lint with auto-fix
pnpm nx run-many -t lint --all --fix
```

---

### Nx Commands

#### Dependency Graph

Visualize project dependencies:

```bash
pnpm nx graph
```

#### Cache Management

Nx caches build outputs for faster rebuilds:

```bash
# Clear Nx cache
pnpm nx reset

# Show project details
pnpm nx show project <project-name>
```

#### Affected Detection

See what's affected by your changes:

```bash
# Show affected projects
pnpm nx show projects --affected

# Run commands only on affected projects
pnpm nx affected -t test
pnpm nx affected -t build
pnpm nx affected -t lint
```

---

## 🔄 CI/CD

### Automated Workflows

The monorepo uses Nx affected detection to intelligently deploy only changed applications.

#### 1. **CI Workflow** (`.github/workflows/ci.yml`)

Runs on every PR and push to `main`:
- Lints, tests, and builds only affected projects
- Uses Nx cache for faster builds
- Validates code quality and type safety

#### 2. **Deploy Frontend** (`.github/workflows/deploy-frontend.yml`)

Runs on push to the **`release`** branch when `apps/frontend/` or `packages/` change:
- Automatically bumps version in `apps/frontend/package.json`
- Builds Docker image with Next.js standalone output
- Pushes to Yandex Container Registry
- Deploys to Yandex Cloud VM
- Creates git tag: `vX.Y.Z-frontend`

#### 3. **Deploy Backend** (`.github/workflows/deploy-backend.yml`)

Runs on push to **`release`** when `apps/backend/` changes:
- Bumps version in `apps/backend/VERSION`
- Builds Go binary in Docker
- Pushes to Yandex Container Registry
- Deploys to Yandex Cloud VM
- Creates git tag: `vX.Y.Z-backend`

#### 4. **Release Kiosk** (`.github/workflows/release-kiosk.yml`)

Runs on push to **`release`** when `apps/kiosk-desktop/` or `packages/` change:
- Bumps version in `package.json`, `Cargo.toml`, and `tauri.conf.json`
- Builds for macOS, Windows, and Linux in parallel
- Creates GitHub Release with installers
- Creates git tag: `vX.Y.Z-kiosk`

---

### Version Bumping Strategy

Versions are bumped automatically based on commit messages:

| Commit Message | Version Bump |
|----------------|--------------|
| `[major]` or `BREAKING CHANGE` | Major (1.0.0 → 2.0.0) |
| `[minor]` or `feat:` | Minor (1.0.0 → 1.1.0) |
| Default | Patch (1.0.0 → 1.0.1) |

**Typical flow:** merge feature work into `main` via pull request. When you are ready to ship, merge `main` into **`release`** (pull request or equivalent). The version bump reads the **latest commit on `release`** (often the merge commit), so put `[minor]`, `feat:`, or `BREAKING CHANGE` in that merge message if you need more than a patch bump.

---

### Independent Versioning

Each application maintains its own version:

- **Frontend**: `apps/frontend/package.json`
- **Backend**: `apps/backend/VERSION`
- **Kiosk**: `apps/kiosk-desktop/package.json`

Git tags follow the pattern: `v1.2.3-frontend`, `v1.2.3-backend`, `v1.2.3-kiosk`

This allows deploying apps independently without unnecessary version bumps.

---

## 🚢 Deployment

### Docker Deployment

#### Backend with Docker Compose

The easiest way to run the backend stack:

```bash
cd apps/backend

# Start all services (PostgreSQL, Redis, MinIO, Backend)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

After starting, services will be available at:

- **API**: <http://localhost:3001>
- **API Documentation**: <http://localhost:3001/swagger/>
- **MinIO Console**: <http://localhost:9001>
  - ⚠️ **DEFAULT CREDENTIALS (DEV ONLY)**: `minioadmin/minioadmin`
  - **DO NOT USE IN PRODUCTION** - Change these credentials immediately in production environments

The backend Compose file defaults `PLATFORM_ALLOW_TENANT_ADMIN` to **`false`**. Set `PLATFORM_ALLOW_TENANT_ADMIN=true` in your environment only when you deliberately want tenant `admin` users to access `/platform/*` in that dev stack (see [SETUP.md](SETUP.md#saas-platform-admin-product-owner)).

#### Frontend Docker Build

```bash
cd apps/frontend

# Build production image
docker build -t quokkaq-frontend .

# Run with environment variables
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:3001 \
  -e NEXT_PUBLIC_WS_URL=http://localhost:3001 \
  quokkaq-frontend
```

---

### Production Considerations

- ✅ Use a reverse proxy (Nginx, Traefik)
- ✅ Enable HTTPS/TLS for all endpoints
- ✅ Configure CORS for your frontend domain
- ✅ Set up database backups and replication
- ✅ Configure log aggregation (ELK, Grafana Loki)
- ✅ Use managed Redis and PostgreSQL services
- ✅ Set up health check endpoints
- ✅ Configure rate limiting on API endpoints
- ✅ Use environment-specific `.env` files
- ✅ Implement monitoring (Prometheus, Grafana)
- ✅ Set up alerting for critical errors

---

### Environment Variables

#### Frontend (`.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

#### Backend (`.env`)

> ⚠️ **SECURITY WARNING**: These are **example values for local development only**. In production:
> - Generate strong random secrets for `JWT_SECRET` (use `openssl rand -base64 32`)
> - Use secure passwords for all services (PostgreSQL, Redis, MinIO, SMTP)
> - Never use default credentials like `postgres/postgres` or `minioadmin/minioadmin`
> - Store secrets in a secure vault (HashiCorp Vault, AWS Secrets Manager, etc.) or environment variables
> - Rotate credentials regularly

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quokkaq?sslmode=disable
PORT=3001
APP_BASE_URL=http://localhost:3000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=quokkaq-materials
AWS_ENDPOINT=http://localhost:9000
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=your-super-secret-key
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
```

For complete configuration examples, see:
- Frontend: `apps/frontend/env.local` (template - copy to `.env.local`)
- Backend: `apps/backend/.env.example`

---

### Required GitHub Secrets

For automated deployment, configure these secrets:

- `YC_SA_JSON_CREDENTIALS` - Yandex Cloud service account JSON
- `YC_REGISTRY_ID` - Yandex Container Registry ID
- `VM_HOST` - Deployment server host
- `VM_USERNAME` - Deployment server username
- `VM_SSH_KEY` - SSH private key for deployment
- `NEXT_PUBLIC_API_URL` - Frontend API URL
- `NEXT_PUBLIC_WS_URL` - Frontend WebSocket URL
- Backend environment variables (POSTGRES_PASSWORD, REDIS_PASSWORD, etc.)

---

## 🔧 Troubleshooting

### Nx Cache Issues

Clear Nx cache if you encounter stale builds:

```bash
pnpm nx reset
```

---

### Dependency Issues

Reinstall all dependencies:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

---

### Build Errors

Build packages in correct order:

```bash
# Build shared packages first
pnpm nx run-many -t build --projects=shared-types,ui-kit,kiosk-lib

# Then build applications
pnpm nx run-many -t build --projects=frontend,backend,kiosk-desktop
```

---

### Docker Issues

If Docker containers fail to start:

```bash
cd apps/backend

# Stop and remove containers
docker-compose down -v

# Restart services
docker-compose up -d postgres redis minio
```

---

### Port Conflicts

If ports are already in use:

```bash
# Check what's using port 3000 (frontend)
lsof -i :3000

# Check what's using port 3001 (backend)
lsof -i :3001

# Kill process if needed
kill -9 <PID>
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

### Development Guidelines

1. **Code Style**
   - Follow existing code conventions
   - Use TypeScript for all frontend/kiosk code
   - Follow Go best practices for backend
   - After `pnpm install`, **pre-commit** runs ESLint/Prettier (frontend), `gofmt` (backend Go), and Prettier (selected packages) on staged files; see [SETUP.md](SETUP.md#quick-start) for details and how to skip hooks (`HUSKY=0`)

2. **Testing**
   - Write tests for new features
   - Ensure existing tests pass
   - Run `pnpm nx affected -t test`

3. **Pull Requests**
   - Create a feature branch from `main`
   - Make focused, atomic commits
   - Write clear commit messages
   - Update documentation if needed
   - Request review from maintainers

4. **Commit Messages**
   - Use conventional commits format
   - Include scope when applicable
   - Examples:
     - `feat(frontend): add user profile page`
     - `fix(backend): correct ticket status logic`
     - `docs: update installation instructions`

### PR Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

CI will automatically:
- Test only affected projects
- Run linting and type checking
- Build affected applications
- Report status checks

After merge to `main`, CI runs on the trunk. To deploy or publish a kiosk release, merge `main` into **`release`** (via pull request); affected apps are then version-bumped, tagged, and deployed by the release workflows.

---

## 📄 License

This project is proprietary software. **All rights reserved.**

The source code is made available for viewing and evaluation purposes only. Any use, modification, or distribution requires explicit written permission from the copyright holder.

For complete license terms, see:
- Root license: [LICENSE](LICENSE) | [LICENSE.ru](LICENSE.ru)
- Application licenses: [Frontend](apps/frontend/LICENSE) | [Backend](apps/backend/LICENSE) | [Kiosk](apps/kiosk-desktop/LICENSE)

---

## 🙏 Acknowledgments

### Frontend
- Built with [Next.js](https://nextjs.org/)
- UI components by [shadcn/ui](https://ui.shadcn.com/)
- Styling with [Tailwind CSS](https://tailwindcss.com/)

### Backend
- Built with [Chi Router](https://github.com/go-chi/chi)
- WebSockets by [Gorilla WebSocket](https://github.com/gorilla/websocket)
- Database ORM by [GORM](https://gorm.io/)
- Background jobs with [Asynq](https://github.com/hibiken/asynq)

### Desktop
- Built with [Tauri](https://tauri.app/)
- Powered by [Rust](https://www.rust-lang.org/)

### Monorepo
- Managed by [Nx](https://nx.dev/)
- Package management by [pnpm](https://pnpm.io/)

---

## 📚 Additional Resources

- [Frontend Documentation](apps/frontend/README.md)
- [Backend Documentation](apps/backend/README.md) | [Russian](apps/backend/README.ru.md)
- [Kiosk Documentation](apps/kiosk-desktop/README.md)
- [Migration Checklist](MIGRATION-CHECKLIST.md)
- [Setup Guide](SETUP.md)

---

<div align="center">
  <p>Made ❤️ by Vladislav Bogatyrev</p>
  <img src="./logo-text.svg" alt="QuokkaQ" width="120"/>
</div>
