# DaData API (reference)

Backend integration uses:

- **Suggestions API** — base URL `https://suggestions.dadata.ru/suggestions/api/4_1/rs`
  - `POST .../findById/party` — organization / IE by INN (`FindPartyByIdRequest`, response `SuggestResponseParty`).
  - `POST .../suggest/party` — name hints (`SuggestPartyRequest`).
  - `POST .../suggest/address` — address hints (`SuggestAddressRequest`).
- **Cleaner API** — `https://cleaner.dadata.ru/api/v1/clean/ADDRESS` — normalize address strings (array of strings in the body).

Official OpenAPI descriptions are published by DaData (e.g. `suggestions.yml`, `cleaner.yml`); you can download current versions from [dadata.ru/api](https://dadata.ru/api/) and keep copies next to this README if you need offline contract review.

## QuokkaQ env vars

| Variable | Purpose |
|----------|---------|
| `DADATA_API_KEY` | Suggestions API (`Authorization: Token …`). If unset, DaData proxy routes return **503**. |
| `DADATA_SECRET` | Optional `X-Secret` header when your project requires it. |
| `DADATA_CLEANER_API_KEY` | Cleaner API token; if unset, Cleaner falls back to `DADATA_API_KEY`. |

Tenant admins call proxied routes under `/companies/dadata/*`; platform admins use `/platform/dadata/*` (same handlers).

Company records store the legal profile in PostgreSQL as `companies.counterparty` (JSONB). See `SETUP.md` for a short overview.
