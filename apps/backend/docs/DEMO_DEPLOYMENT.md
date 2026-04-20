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

## Related

- Product infrastructure overview: [`docs/saas/INFRASTRUCTURE.md`](../../../docs/saas/INFRASTRUCTURE.md)
- Local dev seeds (not used for demo): `cmd/seed`, `cmd/seed-simple`
