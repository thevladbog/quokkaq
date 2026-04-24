# Runbook: Employee IdP (badge / login, upstream HTTPS)

Internal notes for operators and SRE. Tenant-facing contract for **your customers’** HR API is in [`docs/wiki/en/developer-api.md`](../wiki/en/developer-api.md). Scanner hardware (HID vs serial) is covered in [`kiosk-scanner.md`](kiosk-scanner.md).

## What it is

- Per-**unit** config in `unit_employee_idp_*` tables; secrets stored **ciphertext** (same crypto stack as other tenant secrets).
- Kiosk/terminal calls **`POST /units/{unitId}/employee-idp/resolve`**. Plan gate: `CompanyHasPlanFeature(…, kiosk_employee_idp)`.
- Upstream: **HTTPS only**; `forbiddenUpstreamHost` blocks private/loopback targets (DNS resolution included).

## Rate limits

- Resolve is throttled **per client IP and per `unitId`** (see `EmployeeIdpResolveRateLimit` in the API).
- Adjust with env (defaults are conservative; tune under load or abuse):
  - **`EMPLOYEE_IDP_RESOLVE_RATE_INTERVAL_SEC`** — minimum seconds between sustained allows (default **2**).
  - **`EMPLOYEE_IDP_RESOLVE_BURST`** — short burst size (default **6**).
- A client exceeding the limit gets **HTTP 429** with a short plain-text message (no PII in the body).

## Observability and support

- The handler emits structured log lines: **`employee_idp.resolve`** with `unit_id`, **`outcome`** (on success, `matchStatus` such as `matched` / `no_user` / `ambiguous`, or on error, classes such as `empty_input`, `disabled_or_plan`, `upstream_error`, `error_internal` — not raw user input), and **Chi `request_id`**.
- Do **not** log raw `raw` from resolve requests or full upstream JSON. Align with PII policy; never log the upstream response body in clear text.
- **502** to client often means upstream HTTP error, timeout, or mapping failure; **403** — plan or disabled or permission; **429** — rate limit (suggest backoff).
- If tenants report "always no_user": check email path config vs actual JSON, and that a **user with that email** exists in the **same company** as the unit. If the returned email from the IdP matches **more than one** user in that company (e.g. duplicate or case-divergent `users.email` rows in range of the LOWER-matching rule), the API returns **`matchStatus: "ambiguous"`** with no `userId` — the tenant should deduplicate or fix data.

## Security

- **SSRF:** URL is tenant-controlled; hostname resolution must not point only at internal IPs (blocked).
- **Secrets:** header values use `${secret:NAME}`; stored encrypted. Rotate with PATCH `secretValues` and use **`secretNamesToDelete`** to remove a name without new plaintext.
- **Response size** capped (see `io.LimitReader` in service).

## Subscription / pricing

- Feature key **`kiosk_employee_idp`** in plan `features` JSON (see `docs/saas/PRICING.md` and subscription catalog when enabling for a plan).
