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

Deployment happens automatically via GitHub Actions when you push to `main`:

1. **Frontend** - Deployed if `apps/frontend/` or `packages/` changed
2. **Backend** - Deployed if `apps/backend/` changed
3. **Kiosk** - Released if `apps/kiosk-desktop/` or `packages/` changed

See [README.md](README.md#cicd) for details.

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
