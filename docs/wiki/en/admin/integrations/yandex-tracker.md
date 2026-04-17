# Yandex Tracker

**Yandex Tracker** is Yandex’s issue tracker. QuokkaQ can create issues via the REST API v3 and sync status back into the in-app support report list.

Official API overview: [Yandex Tracker — API](https://yandex.ru/support/tracker/en/api-ref/).

## Behaviour in QuokkaQ

- The user submits a **support report** from the staff UI.
- The backend creates an **issue** in the configured queue and stores the issue key in PostgreSQL.
- The list in the app is read **from the QuokkaQ API**, not directly from Tracker.
- Reports are **not deleted** in Tracker; marking a report as “not relevant” adds a **comment** on the issue and stores `markedIrrelevantAt` locally.

## Local issue fields on create

Create matching **local fields** on the Tracker queue (same keys as in the API body). QuokkaQ sets:

| Field id | Value |
| --- | --- |
| `apiAccessToTheTicket` | Comma-separated QuokkaQ user IDs who may read this support report via the API (report author + tenant `admin` role + any users granted a **share** in QuokkaQ). The field is updated when shares are added or removed (PATCH with optimistic `version` when returned by Tracker). |
| `applicantsEmailApi` | Email of the user who created the report (`users.email`). |
| `company` | `Tenant name (short legal name)` — `companies.name` and, when present, `companies.counterparty.shortName` (else `fullName`) from the author’s primary company (first `user_units` → `units.company_id`). If there is no short/full legal name in counterparty, only the tenant name is sent (useful for filtering by tenant). |

## Choosing the backend

Set on the QuokkaQ API server:

| Variable | Description |
| --- | --- |
| `SUPPORT_REPORT_PLATFORM` | `yandex_tracker` to use Tracker, `plane` for Plane, unset/other = integration off. |
| `PLANE_ENABLED` | When using Tracker, set `false` so Plane credentials are ignored. |

## Environment variables (backend only)

| Variable | Description |
| --- | --- |
| `YANDEX_TRACKER_SA_KEY_FILE` | Optional. Path to the Yandex Cloud **service account authorized key** JSON. When set, QuokkaQ uses **`github.com/yandex-cloud/go-sdk/v2`** (`credentials.ServiceAccountKeyFile` + `ycsdk.Build`) to exchange a signed JWT for a short-lived **IAM token** and sends `Authorization: Bearer <iam>` to Tracker. `YANDEX_TRACKER_TOKEN` is then **ignored** for Tracker calls. Official flow: [IAM token for a service account (Go)](https://yandex.cloud/en/docs/iam/operations/iam-token/create-for-sa#go_1) — the doc may show `go get github.com/yandex-cloud/go-sdk`; this project uses the **v2** module path `github.com/yandex-cloud/go-sdk/v2`. |
| `YANDEX_TRACKER_TOKEN` | OAuth user token or a **static** IAM token when `YANDEX_TRACKER_SA_KEY_FILE` is **not** set. |
| `YANDEX_TRACKER_AUTH_SCHEME` | `OAuth` (default) or `Bearer` (static IAM). Ignored when `YANDEX_TRACKER_SA_KEY_FILE` is set (always rotating Bearer IAM). |
| `YANDEX_TRACKER_ORG_ID` | Organization ID from Tracker administration. |
| `YANDEX_TRACKER_USE_CLOUD_ORG_ID` | If `true`, send `X-Cloud-Org-ID` instead of `X-Org-ID`. |
| `YANDEX_TRACKER_QUEUE` | Queue **key** where new issues are created. |
| `YANDEX_TRACKER_API_BASE` | Optional; default `https://api.tracker.yandex.net`. |
| `SUPPORT_REPORT_CANCEL_COMMENT` | Optional ticket comment when a report is marked not relevant. Default is a short, polite note to the requester in Russian (second person). |

See also `apps/backend/.env.example` in the repository.

## Network and security

- The Tracker API must be reachable **from the QuokkaQ API server** (HTTPS).
- For IAM via service account, the API server must also reach **Yandex Cloud IAM** (`iam.api.cloud.yandex.net`) and the **endpoint discovery** host used by the SDK (HTTPS).
- Store the SA key file **outside the repository** (e.g. mounted secret); do not commit JSON keys. The repo’s `temp/` directory is gitignored but is not suitable for production secrets.

## Staff UI: two columns, comments, sharing

- The staff support report detail page uses a **two-column layout**: saved appeal text and a **comment timeline** on the left; ticket metadata and **sharing** on the right (Yandex Tracker only for comments/shares; Plane keeps the previous behaviour).
- **Comments** are read from Tracker (`GET /v3/issues/{id}/comments`) and classified for the API as `internal`, `public`, or `email` (see below). Staff post comments through QuokkaQ as plain text; **whether a comment is public for the requester is set in Tracker**, not via a toggle in the staff UI.

## `[public]` and `[email]` markers

- **`public`**: the comment body (after trim) starts with `[public]`; matching is **case-insensitive** on the tag. Applicant APIs return `displayText` **without** the prefix.
- **`email`**: if Tracker exposes mail-related metadata (`type` and/or the **`transport`** field — often `email`, `incoming`, **`outcoming`**, `outgoing`), the comment is treated as **email**. The message body may be in **`textHtml`** while `text` is empty; QuokkaQ requests comments with `expand=all` and strips HTML to plain text for the timeline. Otherwise, a line starting with `[email]` (same rules as `[public]`) is classified as email.
- **`internal`**: everything else (default staff-only thread).

## Applicant vs staff comment APIs

- `GET /support/reports/{id}/comments?audience=staff` — full timeline for anyone who may view the report (author, tenant admin, or a user with a **share**).
- `GET /support/reports/{id}/comments?audience=applicant` — **only the report author**; returns items with `kind` `public` or `email` only, with prefixes stripped in `displayText`.

## Sharing (QuokkaQ ACL + Tracker sync)

- **Author or tenant admin** can search colleagues in the **author’s company** (roles `admin`, `staff`, `supervisor`, `operator`) and grant read access. Shares are stored in PostgreSQL and included in `apiAccessToTheTicket` after each change.
- Endpoints (all under authenticated `/support`, same access as other support report routes): list/add/remove shares and search candidates; see the generated OpenAPI / Swagger for paths.
