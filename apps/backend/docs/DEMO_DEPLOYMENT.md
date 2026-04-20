# Demo deployment (QuokkaQ)

This document complements the runnable stack in [`deploy/demo`](../../../deploy/demo/README.md).

## Contents of `deploy/demo`

| Artifact | Role |
|----------|------|
| [`docker-compose.demo.yml`](../../../deploy/demo/docker-compose.demo.yml) | Postgres, Redis, MinIO (+ init), Traefik, backend (build via [`Dockerfile.demo`](../../../deploy/demo/Dockerfile.demo)), frontend image, optional `demo-scheduler` profile |
| [`Dockerfile.demo`](../../../deploy/demo/Dockerfile.demo) | Backend API + `seed-plans` + `seed-demo` binaries |
| [`demo-reset.sh`](../../../deploy/demo/demo-reset.sh) | Stop API → wipe `public` schema → start API → run seeds |
| [`.env.demo.example`](../../../deploy/demo/.env.demo.example) | Template for secrets and public hostnames |

## Security notes

- **`demo-scheduler`** mounts the Docker socket and the repo tree. Treat this as **root-equivalent** on the host. Use a **dedicated demo VM**, not a shared CI runner or laptop.
- Demo seeds **do not** grant `platform_admin` to public users; keep **`NEXT_PUBLIC_PLATFORM_ALLOW_TENANT_ADMIN`** unset or `false` on the frontend so tenant `admin` cannot open `/{locale}/platform`.

## Fallback: systemd timer (no scheduler container)

On the VM (paths are examples — adjust to your clone location):

`/etc/systemd/system/quokkaq-demo-reset.service`

```ini
[Unit]
Description=QuokkaQ demo DB reset and reseed
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/quokkaq
ExecStart=/usr/bin/bash /opt/quokkaq/deploy/demo/demo-reset.sh
```

`/etc/systemd/system/quokkaq-demo-reset.timer`

```ini
[Unit]
Description=Daily QuokkaQ demo reset

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now quokkaq-demo-reset.timer
```

## `APP_ENV=demo`

The demo compose sets **`APP_ENV=demo`** on the API so first-run setup token behaviour matches a public demo (see [`internal/config/setup_token.go`](../internal/config/setup_token.go)).

## GitHub Actions: demo images and VM refresh

The workflow [`.github/workflows/deploy-demo.yml`](../../../.github/workflows/deploy-demo.yml) builds and pushes **demo** images to Yandex Container Registry and refreshes the `backend` and `frontend` services on the demo VM.

| Topic | Detail |
|-------|--------|
| **When it runs** | `push` to **`release` only**, with a **paths** filter (`deploy/demo`, `apps/backend`, `apps/frontend`, shared packages, workflow). Pushes to **`main` do not** start this workflow. There is **no** `workflow_dispatch`. |
| **Images** | `quokkaq-backend-demo` (from [`Dockerfile.demo`](../../../deploy/demo/Dockerfile.demo)) and `quokkaq-frontend-demo` (from [`apps/frontend/Dockerfile`](../../frontend/Dockerfile)), tags: commit SHA and `latest`. |
| **On the VM** | Assumes `~/quokkaq-demo/.env.demo` and runs `docker compose -f ~/quokkaq-demo/docker-compose.demo.yml --env-file ~/quokkaq-demo/.env.demo pull … up -d`. CI exports `DEMO_BACKEND_IMAGE` / `DEMO_FRONTEND_IMAGE` for that run so compose pulls the new tags. |
| **Data** | **`demo-reset.sh` is not invoked** by the pipeline; deploys upgrade containers only. Nightly or manual reset stays separate (scheduler / systemd / manual). |

### Secrets checklist (repository)

- **Registry:** `YC_SA_JSON_CREDENTIALS`, `YC_REGISTRY_ID` (same pattern as prod).
- **Demo frontend build:** `DEMO_NEXT_PUBLIC_API_URL`, `DEMO_NEXT_PUBLIC_WS_URL` (browser-facing URLs for the demo hostnames).
- **Demo VM:** `DEMO_VM_HOST`, `DEMO_VM_USERNAME`, `DEMO_VM_SSH_KEY`.

See also [`deploy/demo/README.md`](../../../deploy/demo/README.md) (CI section).

## Related

- Product infrastructure overview: [`docs/saas/INFRASTRUCTURE.md`](../../../docs/saas/INFRASTRUCTURE.md)
- Local dev seeds (not used for demo): `cmd/seed`, `cmd/seed-simple`
