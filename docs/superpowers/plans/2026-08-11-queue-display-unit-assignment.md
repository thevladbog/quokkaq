# Queue Display Unit Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign a published composable `queue-display` experience directly to a unit and make `/screen/[unitId]` use it with an automatic legacy fallback.

**Architecture:** Add typed unit-level assignment fields and a backend service that resolves only the current published version of a queue-display template. Expose an authenticated admin mutation and a public read-only manifest endpoint. Keep the existing terminal assignment protocol and screen renderer unchanged; the frontend selects `ExperienceRenderer` only after validating the manifest and otherwise renders the current path.

**Tech Stack:** Go 1.26, Chi 5, GORM/PostgreSQL, OpenAPI + Orval, Next.js 16, React 19, TanStack Query 5, Zod 4, Vitest 4, existing `ExperienceRenderer` and `ScreenRenderer`.

## Global Constraints

- Unit assignment fields are optional and nullable; no existing unit or screen changes behavior without an explicit published assignment.
- Only `queue-display` definitions and variants are accepted by this rollout.
- Published definitions are immutable; drafts are never returned by the public manifest.
- Public manifest failures resolve to legacy rendering and never blank the screen.
- The public endpoint returns no tenant metadata, drafts, assignment internals, or user-authenticated data.
- Existing signage, advertisements, announcements, QR, ticker, colors, and live queue updates remain available through legacy rendering.
- Do not add display-device inventory, schedules, groups, proof-of-play, or new widget types.

---

### Task 1: Add unit assignment persistence and migration

**Files:**

- Modify: `apps/backend/internal/models/unit.go`
- Modify: `apps/backend/pkg/database/postgres.go` (versioned migration registry/backfill wiring used by this repository)
- Modify: `apps/backend/pkg/database/postgres.go` (add migration `v1.8.20_unit_queue_display_experience_assignment` after the current `v1.8.19` migration)
- Test: `apps/backend/pkg/database/experience_templates_migration_test.go` or a focused unit-assignment migration test beside it

**Interfaces:**

- Produces nullable `Unit.ExperienceTemplateID *string` and `Unit.ExperienceVariantID *string` fields with JSON names `experienceTemplateId` and `experienceVariantId`.
- The database stores both fields as an all-or-nothing pair and references `screen_layout_templates(id)` with delete protection.

- [ ] **Step 1: Write migration tests for the new nullable columns and pair constraint.**

  Assert that an existing unit remains assignable with both fields null, both fields can be set together, and a one-sided assignment is rejected by the service/database contract.

- [ ] **Step 2: Add the model fields and migration.**

  Add both fields with indexes, add the foreign key from `units.experience_template_id` to `screen_layout_templates.id`, and add a check constraint requiring both fields to be null or both non-null. Register the exact migration name `v1.8.20_unit_queue_display_experience_assignment`. Do not backfill existing units.

- [ ] **Step 3: Run the focused migration/model tests.**

  Run: `cd apps/backend && go test ./pkg/database ./internal/models -run 'Test.*Experience|Test.*Unit' -count=1`

  Expected: PASS, with existing units unchanged.

- [ ] **Step 4: Commit the persistence boundary.**

  ```bash
  git add apps/backend/internal/models/unit.go apps/backend/pkg/database
  git commit -m "feat(experience): persist unit queue display assignment"
  ```

### Task 2: Implement backend unit assignment resolution

**Files:**

- Modify: `apps/backend/internal/repository/screen_layout_template_repository.go`
- Modify: `apps/backend/internal/services/screen_layout_template_service.go`
- Modify: `apps/backend/internal/repository/unit_repository.go` and its implementation where unit updates are persisted
- Create: `apps/backend/internal/handlers/unit_experience_handler.go`
- Modify: `apps/backend/cmd/api/main.go`
- Test: `apps/backend/internal/repository/screen_layout_template_repository_test.go`
- Test: `apps/backend/internal/handlers/unit_experience_handler_test.go`

**Interfaces:**

- Admin mutation: `PATCH /units/{unitId}/queue-display-experience` with `{ "templateId": string|null, "variantId": string|null }`.
- Public manifest: `GET /units/{unitId}/queue-display-experience` returning either `{ "mode": "legacy" }` or `{ "mode": "experience", "templateId": string, "versionId": string, "version": number, "variantId": string, "definition": object, "publishedAt": string }`.
- Repository/service resolver accepts `profile=portrait|landscape` and returns a discriminated legacy/experience result. It maps unpublished, wrong-surface, invalid-definition, missing-variant, and incomplete assignment to legacy for the public read path.

- [ ] **Step 1: Write repository/service tests before implementation.**

  Cover no assignment, valid published `queue-display` assignment, draft-only template, wrong surface, malformed published definition, missing variant, cross-company template, and one-sided assignment. Use the existing `experience.ValidateDefinition` and `experience.HasVariant` semantics already used for terminal resolution.

- [ ] **Step 2: Implement assignment validation and atomic update.**

  Lock the unit row, verify the selected template belongs to the same company, require `templateId` and `variantId` together or both null, require `template.surface == queue-display`, require a current published version, validate that version, and verify the variant exists. Clear the assignment on explicit nulls. Never accept a client-supplied published version.

- [ ] **Step 3: Implement public resolution.**

  Load the unit by `unitId`, join only its assigned template and current published version, validate the immutable definition and select a matching variant for `profile=portrait|landscape`. With no profile, prefer the landscape variant and otherwise choose the lexicographically first valid variant ID. Return legacy for all unavailable/invalid assignment states. Keep errors from revealing whether another tenant's template exists.

- [ ] **Step 4: Add route authorization and response limits.**

  Put the PATCH route in the authenticated unit scope with the existing unit permission checks. Put the GET route in the public unit route group with the existing public rate limit and `Cache-Control: no-store`; bound the JSON response and do not include unit/company fields beyond the requested manifest contract.

- [ ] **Step 5: Run backend handler/repository tests.**

  Run: `cd apps/backend && go test ./internal/repository ./internal/handlers ./internal/services -run 'Test.*UnitExperience|Test.*Experience.*Resolution|Test.*QueueDisplay' -count=1`

  Expected: PASS, including cross-tenant denial and legacy fallback cases.

- [ ] **Step 6: Commit the backend contract.**

  ```bash
  git add apps/backend/internal/repository apps/backend/internal/services apps/backend/internal/handlers/unit_experience_handler.go apps/backend/cmd/api/main.go
  git commit -m "feat(experience): resolve queue displays from unit assignments"
  ```

### Task 3: Regenerate and wrap the frontend API contract

**Files:**

- Modify: `apps/backend/docs/docs.go`, `apps/backend/docs/swagger.json`, `apps/backend/docs/swagger.yaml`, `apps/backend/docs/openapi.json`
- Modify: `apps/frontend/lib/api/generated/units.ts` (regenerated by the existing Orval configuration)
- Create: `apps/frontend/lib/experience/queue-display-manifest.ts`
- Test: `apps/frontend/lib/experience/queue-display-manifest.test.ts`

**Interfaces:**

- `parseQueueDisplayManifest(payload: unknown): QueueDisplayManifestResult` returns `{ kind: 'legacy' }`, `{ kind: 'experience', template, variantId, version... }`, or a redacted `{ kind: 'invalid' }` result.
- The wrapper always calls `ExperienceTemplateSchema.safeParse` and checks `template.surface === 'queue-display'` and that `variantId` exists in `template.variants`.

- [ ] **Step 1: Add OpenAPI annotations and regenerate artifacts.**

  Document both response modes and PATCH request semantics, then run `pnpm nx run backend:openapi`, `pnpm nx run frontend:orval`, and `pnpm nx run marketing:orval`. Do not hand-edit generated clients.

- [ ] **Step 2: Write parser tests.**

  Cover legacy, valid experience, malformed envelope, invalid definition, wrong surface, missing variant, and extra untrusted fields. The parser must never throw for remote payloads.

- [ ] **Step 3: Implement the typed parser/client wrapper.**

  Keep API status/error handling separate from definition validation. Convert any non-2xx GET or invalid payload into the legacy-safe result used by the screen route.

- [ ] **Step 4: Run frontend/shared type checks.**

  Run: `pnpm nx run shared-types:test` and `pnpm nx run frontend:test` with the focused parser test included.

- [ ] **Step 5: Commit the generated contract and parser.**

  ```bash
  git add apps/backend/docs apps/frontend/lib/api/generated apps/frontend/lib/experience/queue-display-manifest.ts packages/shared-types/src/index.ts
  git commit -m "feat(experience): add public queue display manifest client"
  ```

### Task 4: Add unit settings assignment UI

**Files:**

- Create: `apps/frontend/components/admin/units/unit-queue-display-experience-settings.tsx`
- Modify: `apps/frontend/app/[locale]/settings/units/[unitId]/page.tsx`
- Modify: `apps/frontend/lib/api.ts` or the existing unit API wrapper
- Modify: `apps/frontend/messages/en.json`
- Modify: `apps/frontend/messages/ru.json`
- Test: `apps/frontend/components/admin/units/unit-queue-display-experience-settings.test.tsx`

**Interfaces:**

- The component receives `unitId`, current assignment, and the existing published template list.
- Save sends the exact pair `{ templateId, variantId }` or `{ templateId: null, variantId: null }`.
- Only templates with `surface === 'queue-display'` and variants declared by the validated definition are selectable.

- [ ] **Step 1: Write component tests.**

  Cover empty state, selecting a template and variant, refusing to save a one-sided selection, successful assignment, explicit unassignment, and API error feedback. Keep permission gating consistent with `PermUnitSettingsManage`.

- [ ] **Step 2: Implement the settings panel.**

  Place it in the existing unit display/settings area. Load templates through the existing tenant-scoped template API, parse definitions before showing variants, show the currently assigned published target, and provide an explicit “Use legacy screen” action.

- [ ] **Step 3: Run the component test and typecheck.**

  Run: `pnpm exec vitest run apps/frontend/components/admin/units/unit-queue-display-experience-settings.test.tsx` and `pnpm exec tsc --noEmit`.

- [ ] **Step 4: Commit the admin assignment surface.**

  ```bash
  git add apps/frontend/components/admin/units apps/frontend/app/[locale]/settings/units/[unitId]/page.tsx apps/frontend/lib/api.ts apps/frontend/messages
  git commit -m "feat(experience): assign queue displays from unit settings"
  ```

### Task 5: Connect `/screen/[unitId]` to the composable runtime

**Files:**

- Modify: `apps/frontend/components/screen/screen-unit-client.tsx`
- Create: `apps/frontend/components/screen/queue-display-experience-runtime.tsx`
- Create: `apps/frontend/lib/experience/queue-display-runtime-context.ts`
- Test: `apps/frontend/components/screen/queue-display-experience-runtime.test.tsx`
- Test: `apps/frontend/components/screen/screen-unit-client.test.tsx` or the existing screen client test location

**Interfaces:**

- `QueueDisplayExperienceRuntime` accepts the parsed manifest, existing `useScreenRendererLiveData` output, locale, and reduced-motion preference.
- It renders `ExperienceRenderer` with `mode="deployed"`, the resolved `variantId`, `runtimeContext.display`, normalized `live`, and no ticket-station mutation adapters.
- It returns legacy rendering when the manifest is legacy, invalid, unavailable, or incompatible.

- [ ] **Step 1: Write runtime adapter tests.**

  Assert valid manifest selection, portrait/landscape profile mapping, unit name/time/current/recent calls, bounded recent-call data, and fallback for every invalid manifest result.

- [ ] **Step 2: Implement the display context adapter.**

  Determine `portrait|landscape` from the current viewport, request that profile in the manifest query, and map `calledTickets` and current queue state into `QueueDisplayRuntimeData` and `ExperienceLiveSnapshot`. Use the existing localized formatting and connection state; do not create a second polling/WebSocket data source.

- [ ] **Step 3: Integrate the guarded branch in `ScreenUnitClient`.**

  Fetch the manifest alongside current live data. Keep the current loading/error states for queue data. Once the manifest resolves, mount the composable runtime only for a valid queue-display response; otherwise execute the existing `screenTemplate`/legacy branch unchanged.

- [ ] **Step 4: Verify operational fallback behavior.**

  Ensure announcement overlays and legacy content continue to render when the composable branch is not selected. Ensure an invalid composable definition cannot cause a blank screen or unhandled render exception.

- [ ] **Step 5: Run focused frontend tests.**

  Run: `pnpm exec vitest run apps/frontend/components/screen/queue-display-experience-runtime.test.tsx apps/frontend/components/experience/experience-renderer.test.tsx apps/frontend/components/screen/screen-renderer-cell-grid.test.tsx`.

- [ ] **Step 6: Commit the guarded live migration.**

  ```bash
  git add apps/frontend/components/screen apps/frontend/lib/experience
  git commit -m "feat(screen): render unit-assigned queue experiences"
  ```

### Task 6: Add end-to-end contract coverage and runbook updates

**Files:**

- Modify: `apps/frontend/e2e/experience/queue-display-preview.spec.ts`
- Modify: `docs/operations/composable-experience-pilot.md`

**Interfaces:**

- Browser acceptance covers assigned and unassigned public screens without physical hardware assumptions.
- Runbook documents publish, assign to unit, verify manifest/version, unassign, and legacy recovery.

- [ ] **Step 1: Add browser cases.**

  Extend the existing fixed-viewport matrix for 1920×1080 and 1080×1920: assigned queue-display renders the composable calls widget; unassigned unit renders the legacy screen; invalid/unavailable manifest stays usable. Assert no horizontal or vertical page scrolling.

- [ ] **Step 2: Update the pilot runbook.**

  Add unit assignment and unassignment steps, manifest/version evidence, cache refresh expectations, and a clear statement that iPad/Tauri/display hardware acceptance remains separate.

- [ ] **Step 3: Run final automated gates.**

  ```bash
  pnpm nx run shared-types:test
  pnpm nx run frontend:test
  pnpm nx run backend:test
  pnpm nx run backend:openapi:check
  pnpm nx run frontend:orval:check
  pnpm nx run frontend:lint
  pnpm nx run backend:lint
  pnpm nx run frontend:build
  pnpm nx run frontend:e2e:experience
  pnpm nx run frontend:format:check
  pnpm nx run frontend:format:fix
  ```

- [ ] **Step 4: Commit acceptance coverage and documentation.**

  ```bash
  git add apps/frontend/e2e/experience/queue-display-preview.spec.ts docs/operations/composable-experience-pilot.md .github/workflows/ci.yml
  git commit -m "test(experience): cover unit-assigned queue displays"
  ```

## Verification before handoff

- `git diff --check` is clean and the worktree contains only this feature.
- The public manifest never returns a draft or cross-tenant definition.
- An unassigned or invalid unit renders the pre-existing screen path.
- OpenAPI and Orval artifacts are regenerated and pass their CI checks.
- Automated browser checks do not claim physical display, iPad Safari, Tauri, audio, or network-recovery acceptance.
