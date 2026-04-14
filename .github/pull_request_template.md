## Summary

What does this PR change and why?

## Affected areas

Check all that apply (CI may also add `area/*` labels from paths):

- [ ] Frontend (`apps/frontend`)
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

## Notes

Risks, rollout, or follow-ups (optional):
