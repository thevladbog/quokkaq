## Summary

What does this PR change and why?

## Affected areas

Check all that apply (CI may also add `area/*` labels from paths):

- [ ] Frontend (`apps/frontend`)
- [ ] Marketing site (`apps/marketing`)
- [ ] Backend (`apps/backend`)
- [ ] Kiosk desktop (`apps/kiosk-desktop`)
- [ ] Shared packages (`packages/*`)
- [ ] CI / tooling only (`.github`, Nx, pnpm)

## How to test

Steps you ran or reviewers should follow:

**Backend (copy-paste when applicable)**

- Changes matching `**/{apps,packages}/backend/**/*.go` → `pnpm nx run backend:test`

**Frontend (copy-paste when applicable)**

- Changes matching `**/{apps,packages}/frontend/**/*.{js,jsx,ts,tsx}` → `pnpm nx run frontend:test`
- Changes matching `**/{apps,packages}/frontend/**/*.{js,jsx,ts,tsx,json,css,scss,md}` → `pnpm nx run frontend:format:check`
- Same frontend paths → `pnpm nx run frontend:lint` when you touched TS/JS/CSS that should pass ESLint

_(In this monorepo the app lives under `apps/frontend/`; use the same Nx targets if you only touched shared UI under `packages/` that the frontend consumes.)_

**Marketing (copy-paste when applicable)**

- Changes under `apps/marketing/**/*.{ts,tsx,js,jsx,mjs,css,md,mdx}` → `pnpm nx run marketing:lint`
- Same tree → `pnpm nx run marketing:format:check`
- Full build → `pnpm nx run marketing:build`
- If you changed the backend OpenAPI spec, the marketing Orval config (`apps/marketing/orval.config.ts` or related), or files under `apps/marketing/lib/api/generated` → run `pnpm nx run marketing:orval:check`. When the check reports drift, regenerate from the repo root with `pnpm --dir apps/marketing run orval` or `pnpm nx run marketing:orval`, then commit the updated generated files so CI passes.

## Notes

Risks, rollout, or follow-ups (optional):
