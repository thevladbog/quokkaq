# Test IdP (Keycloak) for OIDC and SAML

Use this stack to exercise Quokka SSO against a real IdP on your machine. It is **not** for production.

## Start Keycloak

From the repository root:

```bash
docker compose -f docker-compose.test-idp.yml up -d --wait
```

- Admin console: `http://127.0.0.1:8080` — user `admin`, password `admin` (change after first login).
- Pre-imported realm: **`quokkaq-test`** (see `keycloak/import/quokkaq-test-realm.json`).

Stop:

```bash
docker compose -f docker-compose.test-idp.yml down
```

## OIDC (OpenID Connect)

Use these values in **Organization → Login & SSO** (or API `PATCH /companies/me/sso`) for protocol **OIDC**:

| Field | Value |
| --- | --- |
| Issuer (discovery) URL | `http://127.0.0.1:8080/realms/quokkaq-test` |
| Client ID | `quokkaq-oidc` |
| Client secret | `quokkaq-oidc-secret-change-me` |
| Redirect URI registered in Keycloak | `http://localhost:3001/auth/sso/callback` (must match `API_PUBLIC_URL` / `apiPublicURL()` + `/auth/sso/callback`; see `apps/backend/internal/services/sso_service.go`) |

**Backend / browser URL alignment:** set `API_PUBLIC_URL` to the **Go API origin** the IdP redirects to (typically `http://localhost:3001`). If it points at the Next port (`:3000`), Keycloak returns **Invalid parameter: redirect_uri** because only `http://localhost:3001/auth/sso/callback` is registered on client `quokkaq-oidc`. The frontend still uses `NEXT_PUBLIC_API_URL` for `/api` proxy to the same backend.

Do not rely on `APP_BASE_URL` for OIDC redirect: the backend defaults `API_PUBLIC_URL` to `http://localhost:3001` when unset.

The app calls `/auth/sso/authorize` with an optional **`locale`** query (`en` or `ru`). That value is stored for the redirect chain so post-SSO URLs (login error or `/login/sso/callback`) use the same locale as the page where SSO was started.

Test user in realm:

- Email: `ssotest@example.com`
- Password: `ssotest`

Add `ssotest@example.com` to **email domains** for the company if your login flow routes by domain.

## SAML

Quokka needs **SP signing material** via environment variables (see `apps/backend/internal/services/saml_flow.go`):

- `SAML_SP_PRIVATE_KEY_PEM`
- `SAML_SP_CERT_PEM`

Generate local dev certs:

```bash
chmod +x tools/test-idp/generate-saml-sp-certs.sh
./tools/test-idp/generate-saml-sp-certs.sh
```

Load the PEM contents into your backend environment (or `apps/backend/.env` for `go run`). See `SAML_SP_*` in `apps/backend/.env.example`.

In **Login & SSO**, set protocol **SAML** and:

| Field | Value |
| --- | --- |
| IdP metadata URL | `http://127.0.0.1:8080/realms/quokkaq-test/protocol/saml/descriptor` |

Use a company whose **slug is `test`**, or add another SAML client in Keycloak whose **Entity ID** and **ACS URL** match `apiPublicURL()` for your slug (see Organization Login & SSO page for copyable ACS / SP metadata URLs).

The imported realm includes a SAML client for **`tenant=test`**:

- SP Entity ID: `http://localhost:3001/auth/saml/metadata?tenant=test`
- ACS: `http://localhost:3001/auth/saml/acs?tenant=test`

## Frontend env

Point the Next.js app at the API the browser can reach:

- `NEXT_PUBLIC_API_URL=http://localhost:3001` (or your proxied origin)

Cookie SSO requires the existing `/api` proxy to forward `Cookie` to the Go API.

When SSO completes at the IdP but the backend cannot issue a session (for example no tenant access or JIT disabled), the API redirects the browser back to the app login page with a stable `sso_error` query parameter (for example `?sso_error=no_tenant_access`) instead of showing a plain “access denied” response on the API host.

## Dex / Ory Hydra

OIDC-only alternatives are discussed in the internal plan; this repo standardizes on **Keycloak** here so both OIDC and SAML are covered in one compose file.
