# QuokkaQ demo stack (all-in-one)

Single Compose file: Postgres, Redis, MinIO, Traefik, backend (with `seed-plans` + `seed-demo` binaries), and the product frontend.

## Prerequisites

- Docker Engine + Compose v2 on a **dedicated demo VM** (do not mount `docker.sock` into schedulers on shared hosts).
- DNS `A` records for `DEMO_APP_HOST`, `DEMO_API_HOST`, `DEMO_S3_HOST` pointing to the VM.
- A pushed **frontend** image tag (`DEMO_FRONTEND_IMAGE`). Backend is built from this repo via [`Dockerfile.demo`](Dockerfile.demo).

## CI/CD (GitHub Actions)

Workflow: [`.github/workflows/deploy-demo.yml`](../../.github/workflows/deploy-demo.yml).

| Item | Behaviour |
|------|-----------|
| **Trigger** | `push` to branch **`release` only** (not `main`, not `workflow_dispatch`). |
| **Paths filter** | Runs only when changes touch `deploy/demo/**`, `apps/backend/**`, `apps/frontend/**`, `packages/shared-types/**`, `packages/kiosk-lib/**`, or the workflow file. |
| **Images** | Pushes `quokkaq-backend-demo` and `quokkaq-frontend-demo` to Yandex Container Registry (`cr.yandex/<YC_REGISTRY_ID>/…`), tagged with the commit SHA and `:latest`. |
| **VM** | Copies [`docker-compose.demo.yml`](docker-compose.demo.yml) to `~/quokkaq-demo/`, then SSH: `docker login` → `compose pull backend frontend` → `compose up -d`. **Does not** run [`demo-reset.sh`](demo-reset.sh) (no DB wipe on each deploy). |

### GitHub Secrets / variables

**Registry (same idea as prod):**

| Secret | Purpose |
|--------|---------|
| `YC_SA_JSON_CREDENTIALS` | Service account JSON for `docker login` to `cr.yandex` (CI and on the VM). |
| `YC_REGISTRY_ID` | Registry ID in image URLs. |

**Frontend build (demo-specific; avoid reusing prod `NEXT_PUBLIC_*` secrets):**

| Secret | Purpose |
|--------|---------|
| `DEMO_NEXT_PUBLIC_API_URL` | Passed as `NEXT_PUBLIC_API_URL` when building the demo frontend image (must match what browsers use, e.g. `https://<DEMO_API_HOST>`). |
| `DEMO_NEXT_PUBLIC_WS_URL` | Passed as `NEXT_PUBLIC_WS_URL` for the demo WebSocket endpoint. |

**Demo VM SSH:**

| Secret | Purpose |
|--------|---------|
| `DEMO_VM_HOST` | Hostname or IP of the demo VM. |
| `DEMO_VM_USERNAME` | SSH user. |
| `DEMO_VM_SSH_KEY` | Private key (PEM) for that user. |

### VM layout before the first CI deploy

1. Create `~/quokkaq-demo/` on the VM.
2. Place **`.env.demo`** there (not from git): copy from [`.env.demo.example`](.env.demo.example), set passwords, `JWT_SECRET`, hostnames, bucket, etc. Values for public URLs should align with `DEMO_NEXT_PUBLIC_*` in GitHub.
3. First-time stack: from the repo (or after CI has pushed images), run `docker compose … up -d` and seed as in [First run](#first-run). Later pushes to `release` update only **backend** and **frontend** images via Actions.

**Seed smoke (local / CI):** against an **empty** PostgreSQL **16+** database, set `DATABASE_URL`, then from the repo root run `pnpm nx run backend:test-demoseed-smoke` (migrations → plans → `demoseed.Run`). GitHub Actions runs the same flow in job **`ci-backend-demoseed-smoke`** when the **`backend`** project is affected.

## First run

```bash
cp deploy/demo/.env.demo.example deploy/demo/.env.demo
# Edit deploy/demo/.env.demo — set passwords, JWT_SECRET, hostnames, DEMO_FRONTEND_IMAGE, ACME_EMAIL.

docker compose -f deploy/demo/docker-compose.demo.yml --env-file deploy/demo/.env.demo up -d --build
```

After the first `up`, load **plans + demo data** once (subsequent nights can use the scheduler or manual `demo-reset.sh`):

```bash
bash deploy/demo/demo-reset.sh
```

Then open `https://<DEMO_APP_HOST>/` and sign in with the **tenant admin** email from your `.env.demo` (`DEMO_ADMIN_EMAIL`, default `demo-admin@demo.quokkaq.local`) and `DEMO_ADMIN_PASSWORD` (default if unset in the container: `demo-admin-change-me` — set `DEMO_ADMIN_PASSWORD` in compose/backend env for production-hardened demos).

- Seeded users have **tenant `admin` / `operator` only** — no `platform_admin`; SaaS operator UI (`/platform`) stays closed unless you misconfigure `NEXT_PUBLIC_PLATFORM_ALLOW_TENANT_ADMIN` on the frontend.
- Historical demo data spans **~90 days** (override with `DEMO_HISTORY_DAYS`).

## Nightly reset (optional)

The `demo-scheduler` service runs [`demo-reset.sh`](demo-reset.sh) on a schedule (UTC 03:00 by default via [`supercronic-crontab`](supercronic-crontab)). It needs the **repository root** mounted at `/repo` and the Docker socket — enable with the Compose profile:

Set **`DOCKER_GID`** in `.env.demo` to the numeric group owning `/var/run/docker.sock` on the host (e.g. `stat -c '%g' /var/run/docker.sock`) so the non-root scheduler user can call `docker compose`.

```bash
docker compose -f deploy/demo/docker-compose.demo.yml --env-file deploy/demo/.env.demo --profile scheduler up -d
```

Security: this is equivalent to giving the container **root on the Docker daemon**; use only on an isolated demo machine.

To run a reset manually from the host:

```bash
bash deploy/demo/demo-reset.sh
```

(`COMPOSE_DIR` defaults to the script directory; override when wrapping.)

## Without in-Docker scheduler

Use a **systemd timer** on the host that invokes `bash /path/to/repo/deploy/demo/demo-reset.sh` — see [DEMO_DEPLOYMENT.md](../../apps/backend/docs/DEMO_DEPLOYMENT.md).

## `APP_ENV=demo`

Backend runs with `APP_ENV=demo` so first-run setup token rules match a public demo (no `SETUP_TOKEN` requirement like production/staging).
