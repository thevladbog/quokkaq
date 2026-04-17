# Plane (self-hosted)

**Plane** is an open-source work management system (work items). Together with QuokkaQ it can act as the **backend for support tickets**: the app creates a work item via the REST API, and statuses are synced back into the in-app report list.

Official Plane docs: [developers.plane.so](https://developers.plane.so/) (self-hosting, REST API).

## Role in QuokkaQ

- The user submits a **report** from the QuokkaQ UI.
- The backend creates a **work item** in the chosen Plane project and stores the link in PostgreSQL.
- The report list in the app is read **from the QuokkaQ API**, not directly from Plane.

## Environment requirements

Exact sizing depends on the Plane version and load; rough guidance:

- **CPU/RAM:** at least **2 vCPU / 4 GB RAM** for a small Docker Compose deployment; for production and larger teams, see the [official self-hosting guides](https://developers.plane.so/).
- **Disk:** allow space for the Plane database (PostgreSQL/Redis in the stack) and logs; plan for **tens of gigabytes** with headroom.
- **OS:** Linux with Docker (or Kubernetes per Plane docs).

## Networking and security

- Expose **HTTPS only** to the outside world (reverse proxy: Traefik, nginx, Caddy, etc.).
- The Plane API and UI must be reachable **from the QuokkaQ API server** (VPC, VPN, or internal DNS).
- Store the Plane **API key** **only on the application server** (backend environment variables), not in the repo or frontend.
- Configure **backups** of the Plane database per your operations policy.

## Deployment (high level)

1. Follow the [official Plane self-hosting guide](https://developers.plane.so/) (Docker Compose or Kubernetes).
2. Bring up the instance and complete first-time setup (workspace, admin user).
3. Create a **project** for support tickets (e.g. “Support”).
4. In the Plane web UI, open the workspace URL and read **`workspace_slug`** from the path (e.g. `https://plane.example.com/<workspace_slug>/...`).

## Configuration for QuokkaQ

In Plane, create an **API key** with **read/write** access to work items in the target project (see Plane docs for scopes: `projects.work_items:read`, `projects.work_items:write`).

Set these backend environment variables:

| Variable | Description |
|----------|-------------|
| `PLANE_BASE_URL` | API base URL, e.g. `https://plane.example.com` (no trailing `/`). For self-hosted, often the same origin as the web UI if the API is on the same host. |
| `PLANE_API_KEY` | Secret key (`X-API-Key`). |
| `PLANE_WORKSPACE_SLUG` | Workspace slug. |
| `PLANE_PROJECT_ID` | Project UUID in Plane (from project settings or API). |
| `PLANE_TLS_INSECURE_SKIP_VERIFY` | Optional. If `true`, the QuokkaQ→Plane HTTP client **skips TLS certificate verification** (private CA / self-signed hosts only). Prefer **installing your root CA** on the API server instead of disabling verification in production. |

If integration is not needed yet, you can omit these variables — report endpoints will return a clear error when Plane is unavailable.

## API check

Substitute your own values (do not commit secrets to documentation):

```bash
curl -sS -X POST \
  "${PLANE_BASE_URL}/api/v1/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PLANE_PROJECT_ID}/work-items/" \
  -H "X-API-Key: ${PLANE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"name":"QuokkaQ connectivity test","description_html":"<p>ok</p>","external_id":"quokkaq-connectivity-test","external_source":"quokkaq"}'
```

Expect **201** and JSON containing the created work item `id`.

## Common issues

| Symptom | What to check |
|--------|----------------|
| `401` / `403` from Plane | API key validity, expiry, scopes for the project. |
| `404` on `.../work-items/` | Wrong `workspace_slug` or `project_id` (UUID). |
| `x509: certificate signed by unknown authority` | Plane uses TLS from a private CA: trust that CA on the API host/container, or temporarily set `PLANE_TLS_INSECURE_SKIP_VERIFY=true` (non-prod only, use consciously). |
| QuokkaQ cannot reach Plane | Firewall, DNS, TLS; from the API server run `curl` to `PLANE_BASE_URL`. |
| Timeouts | Increase Plane host resources; check network latency. |

## Where it is configured in the product

Variables are set **only for the QuokkaQ backend** (see `apps/backend/.env.example`). There may be no dedicated admin UI for Plane keys — they are typically provided by DevOps or infrastructure admins.
