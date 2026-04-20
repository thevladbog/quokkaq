# QuokkaQ demo stack (all-in-one)

Single Compose file: Postgres, Redis, MinIO, Traefik, backend (with `seed-plans` + `seed-demo` binaries), and the product frontend.

## Prerequisites

- Docker Engine + Compose v2 on a **dedicated demo VM** (do not mount `docker.sock` into schedulers on shared hosts).
- DNS `A` records for `DEMO_APP_HOST`, `DEMO_API_HOST`, `DEMO_S3_HOST` pointing to the VM.
- A pushed **frontend** image tag (`DEMO_FRONTEND_IMAGE`). Backend is built from this repo via [`Dockerfile.demo`](Dockerfile.demo).

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
