# Operator Workplace Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the operator workplace polish by neutralizing the visitor portrait, presenting waiting SLA inside the existing dense queue row, eliminating polling-induced layout shift, and restoring staff access to the canonical unit-service reads.

**Architecture:** Keep UI work in the existing staff components and current timer/query contracts. Add one RBAC middleware that composes the established same-unit terminal path with the established any-of-unit-permissions path, and put only the two service reads behind it. The backend remains the API-contract owner, so OpenAPI is regenerated before Orval.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vitest/Testing Library, Go 1.26, chi, Swag/OpenAPI, Orval, Nx/pnpm.

## Global Constraints

- Preserve queue order, call-next selection, service filtering, ticket snapshot semantics, SLA thresholds, dense row height, and the 36 px Call target.
- Never derive a missing ticket maxWaitingTime from the current Service record.
- Do not add a queue progress bar, large SLA badge, extra SLA row, or height-producing polling status.
- Keep kiosk telemetry, printer telemetry, and employee IdP resolution behind access.kiosk.
- Preserve unrelated untracked files and the already-completed responsive changes in the four queue/shell files.
- Use RED -> GREEN -> REFACTOR for every new behavior and run the named failing assertion before production edits.
- Do not claim browser acceptance until authenticated 1440 px and compact layouts remain stable through two polling cycles.

---

## File Map

Responsive baseline already present and to be preserved:

- apps/frontend/components/staff/StaffQueuePanel.tsx
- apps/frontend/components/staff/StaffQueuePanel.test.tsx
- apps/frontend/components/staff/StaffWorkstationShell.tsx
- apps/frontend/components/staff/StaffWorkstationShell.test.tsx

Visitor portrait:

- Modify: apps/frontend/components/staff/VisitorPhotoFrame.tsx
- Create: apps/frontend/components/staff/VisitorPhotoFrame.test.tsx

Compact SLA and polling:

- Modify: apps/frontend/components/staff/StaffQueuePanel.tsx
- Modify: apps/frontend/components/staff/StaffQueuePanel.test.tsx
- Modify: apps/frontend/messages/en.json
- Modify: apps/frontend/messages/ru.json

Service authorization contract:

- Modify: apps/backend/internal/middleware/rbac_middleware.go
- Create: apps/backend/internal/middleware/rbac_middleware_test.go
- Modify: apps/backend/cmd/api/main.go
- Create: apps/backend/cmd/api/unit_access_routes.go
- Create: apps/backend/cmd/api/unit_access_routes_test.go
- Modify: apps/backend/internal/handlers/service_handler.go
- Create: apps/backend/internal/handlers/service_openapi_contract_test.go
- Modify generated: apps/backend/docs/swagger.json
- Modify generated: apps/backend/docs/swagger.yaml
- Modify generated: apps/backend/docs/openapi.json
- Modify generated: apps/frontend/src/lib/api/generated/**
- Modify: apps/frontend/lib/api.ts

---

### Task 1: Capture the completed responsive baseline

**Files:**

- apps/frontend/components/staff/StaffQueuePanel.tsx
- apps/frontend/components/staff/StaffQueuePanel.test.tsx
- apps/frontend/components/staff/StaffWorkstationShell.tsx
- apps/frontend/components/staff/StaffWorkstationShell.test.tsx

- [ ] **Step 1: Inspect the isolated diff**

Run:

~~~bash
git diff -- \
  apps/frontend/components/staff/StaffQueuePanel.tsx \
  apps/frontend/components/staff/StaffQueuePanel.test.tsx \
  apps/frontend/components/staff/StaffWorkstationShell.tsx \
  apps/frontend/components/staff/StaffWorkstationShell.test.tsx
~~~

Expected: only the verified queue-header wrapping, 1366 px two-column threshold, and compact spacing assertions.

- [ ] **Step 2: Re-run the focused tests**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/StaffQueuePanel.test.tsx \
  components/staff/StaffWorkstationShell.test.tsx
~~~

Expected: PASS.

- [ ] **Step 3: Commit only this baseline**

~~~bash
git add apps/frontend/components/staff/StaffQueuePanel.tsx \
  apps/frontend/components/staff/StaffQueuePanel.test.tsx \
  apps/frontend/components/staff/StaffWorkstationShell.tsx \
  apps/frontend/components/staff/StaffWorkstationShell.test.tsx
git commit -m "fix(staff): stabilize responsive workplace layout"
~~~

Expected: unrelated untracked files remain untouched.

---

### Task 2: Restore the service-read RBAC contract

**Files:**

- Modify: apps/backend/internal/middleware/rbac_middleware.go
- Create: apps/backend/internal/middleware/rbac_middleware_test.go
- Modify: apps/backend/cmd/api/main.go
- Create: apps/backend/cmd/api/unit_access_routes.go
- Create: apps/backend/cmd/api/unit_access_routes_test.go

- [ ] **Step 1: Write the middleware contract test**

Add table-driven tests for RequireTerminalUnitMatchOrUnitAnyPermission:

1. same-unit terminal -> 200;
2. terminal from another unit -> 403;
3. user with direct access.kiosk -> 200;
4. user with direct access.staff_panel -> 200;
5. user without either permission -> 403;
6. request without user identity -> 401.

Build chi and auth context explicitly:

~~~go
routeCtx := chi.NewRouteContext()
routeCtx.URLParams.Add("unitId", "unit-1")
ctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
ctx = context.WithValue(ctx, UserIDKey, "user-1")
~~~

Use small repositories that embed the existing interfaces/test doubles and override only invoked methods. For the tenant repository, embed repository.TenantRBACRepository and override UserHasTenantPermission. Record the slice passed to UserMatchesAnyUnitPermission to prove both permissions are checked.

Cover both terminal-aware middleware variants with differently cased representations of the same valid UUID, which must be accepted after canonicalization, and with case variants of an opaque/non-UUID identifier, which must be rejected.

Add a Chi route-integration test around the route-registration helper used by main.go. For every affected route, run authorized and forbidden requests. Prove that only GET /{unitId}/services and GET /{unitId}/services-tree accept either access.kiosk or access.staff_panel, while kiosk printer telemetry, kiosk telemetry, and employee IdP resolution accept access.kiosk and reject staff-panel-only access.

- [ ] **Step 2: Run RED**

~~~bash
cd apps/backend
go test ./internal/middleware -run TestRequireTerminalUnitMatchOrUnitAnyPermission -count=1
go test ./internal/middleware -run TestTerminalUnitMatchMiddlewareNormalizesUUIDsButNotOpaqueIDs -count=1
go test ./cmd/api -run TestUnitAccessRoutesKeepServiceReadsSeparateFromKioskOperations -count=1
~~~

Expected: FAIL on the named missing middleware or route-registration contract before production edits.

- [ ] **Step 3: Add the compositional middleware**

Add it beside RequireTerminalUnitMatchOrUnitPermission:

~~~go
func RequireTerminalUnitMatchOrUnitAnyPermission(
	userRepo repository.UserRepository,
	tr repository.TenantRBACRepository,
	unitRepo repository.UnitRepository,
	urlUnitParam string,
	permissions []string,
) func(http.Handler) http.Handler {
	unitAnyPermission := RequireUnitAnyPermission(
		userRepo, tr, unitRepo, urlUnitParam, permissions,
	)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			unitID := unitIDFromRequest(r, urlUnitParam)
			if unitID == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			if isTerminal, allowed := terminalUnitAuthorization(r, unitID); isTerminal {
				if !allowed {
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			unitAnyPermission(next).ServeHTTP(w, r)
		})
	}
}
~~~

Extract terminal authorization shared by both terminal-aware middleware variants. The helper owns TokenTypeKey, TerminalUnitIDKey, trimming, and ID comparison. Parse and compare valid UUIDs canonically; when either value is not a UUID, require exact trimmed equality. Do not use EqualFold for opaque identifiers and do not pass a case-variant ID to FindByIDLight.

- [ ] **Step 4: Split the routes**

In apps/backend/cmd/api/main.go, create a service-read group guarded by the new middleware with:

~~~go
[]string{rbac.PermAccessKiosk, rbac.PermAccessStaffPanel}
~~~

It owns only:

~~~go
r.Get("/{unitId}/services", serviceHandler.GetServicesByUnit)
r.Get("/{unitId}/services-tree", serviceHandler.GetServicesByUnit)
~~~

Keep these three operations in the existing access.kiosk-only group:

~~~go
r.Post("/{unitId}/kiosk-printer-telemetry", unitHandler.PostKioskPrinterTelemetry)
r.Post("/{unitId}/kiosk-telemetry", kioskHandler.PostKioskTelemetry)
r.With(authmiddleware.EmployeeIdpResolveRateLimit).
	Post("/{unitId}/employee-idp/resolve", employeeIdpHandler.PostPublicEmployeeIdpResolve)
~~~

Register both groups through the small helper covered by the Chi integration test so future route moves cannot silently broaden kiosk-only operations.

- [ ] **Step 5: Verify GREEN**

~~~bash
cd apps/backend
go test ./internal/middleware -count=1
go test ./cmd/api -run TestUnitAccessRoutesKeepServiceReadsSeparateFromKioskOperations -count=1
cd ../..
pnpm nx run backend:test
~~~

Expected: PASS.

- [ ] **Step 6: REFACTOR and run the final focused tests**

Remove duplication by making both terminal-aware middleware wrappers call the shared terminal authorization helper. Keep forbidden responses and handler flow unchanged, then run:

~~~bash
cd apps/backend
go test ./internal/middleware ./cmd/api -run 'TestRequireTerminalUnitMatchOrUnitAnyPermission|TestTerminalUnitMatchMiddlewareNormalizesUUIDsButNotOpaqueIDs|TestUnitAccessRoutesKeepServiceReadsSeparateFromKioskOperations' -count=1
~~~

Expected: PASS after refactoring, before claiming Task 2 complete.

- [ ] **Step 7: Commit the RBAC behavior**

~~~bash
git add apps/backend/internal/middleware/rbac_middleware.go \
  apps/backend/internal/middleware/rbac_middleware_test.go \
  apps/backend/cmd/api/main.go \
  apps/backend/cmd/api/unit_access_routes.go \
  apps/backend/cmd/api/unit_access_routes_test.go
git commit -m "fix(api): allow staff to read unit services"
~~~

---

### Task 3: Publish the corrected API contract

**Files:**

- Modify: apps/backend/internal/handlers/service_handler.go
- Create: apps/backend/internal/handlers/service_openapi_contract_test.go
- Modify: apps/backend/cmd/api/main.go
- Modify generated: apps/backend/docs/swagger.json
- Modify generated: apps/backend/docs/swagger.yaml
- Modify generated: apps/backend/docs/openapi.json
- Modify generated: apps/frontend/src/lib/api/generated/**
- Modify: apps/frontend/lib/api.ts

- [ ] **Step 1: Add distinct documented handlers**

Extract shared response logic:

~~~go
func (h *ServiceHandler) respondServicesByUnit(
	w http.ResponseWriter,
	r *http.Request,
) {
	unitID := chi.URLParam(r, "unitId")
	unitServices, err := h.service.GetServicesByUnit(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, unitServices)
}
~~~

Keep separate handlers and annotations so each operation has a stable ID. Both annotations include @Security BearerAuth, @Failure 401, @Failure 403, @Failure 500, and their respective routers:

~~~go
// @ID GetServicesByUnit
// @Router /units/{unitId}/services [get]
func (h *ServiceHandler) GetServicesByUnit(w http.ResponseWriter, r *http.Request) {
	h.respondServicesByUnit(w, r)
}

// @ID GetServicesTreeByUnit
// @Router /units/{unitId}/services-tree [get]
func (h *ServiceHandler) GetServicesTreeByUnit(w http.ResponseWriter, r *http.Request) {
	h.respondServicesByUnit(w, r)
}
~~~

Switch only the services-tree route in apps/backend/cmd/api/main.go from GetServicesByUnit to GetServicesTreeByUnit in the same service-read authorization group introduced by Task 2.

- [ ] **Step 2: Add a generated-contract assertion and run RED**

Create apps/backend/internal/handlers/service_openapi_contract_test.go. Load ../../docs/openapi.json and assert both canonical paths exist with GET methods, exact operation IDs GetServicesByUnit and GetServicesTreeByUnit, and 401 and 403 responses. Scan all path/method operations and require each expected operation ID to occur exactly once at its assigned GET path, so missing, duplicated, and swapped/misassigned IDs fail while the response checks remain intact.

Expected before regeneration: FAIL because the tree operation and auth responses are absent.

- [ ] **Step 3: Regenerate in backend-owner order**

~~~bash
pnpm nx run backend:openapi
pnpm nx run frontend:orval
~~~

Expected: both service-list operations and their auth responses exist in backend docs and frontend generated clients.

- [ ] **Step 4: Remove the dead frontend wrapper**

Delete only servicesApi.getByUnitId from apps/frontend/lib/api.ts. It calls the nonexistent /services/unit/{unitId} route. Preserve unitApi.getServices and unitApi.getServicesTree, which use canonical routes.

- [ ] **Step 5: Verify contract consistency**

~~~bash
pnpm nx run backend:test
pnpm nx run frontend:build
git diff --check
~~~

Expected: backend tests and generated clients compile. If the full frontend build reaches a pre-existing unrelated error, record the exact file/error, run focused touched-code checks, and do not report the build as accepted.

- [ ] **Step 6: REFACTOR and run the final focused contract test**

Keep shared response logic in respondServicesByUnit and keep only route-specific annotations/handlers separate. Remove any duplicate assertion setup without weakening the exact path, GET method, operation ID uniqueness/assignment, or 401/403 checks, then run:

~~~bash
cd apps/backend
go test ./internal/handlers -run TestServiceListOpenAPIRequiresAuthenticationAndAuthorization -count=1
~~~

Expected: PASS after refactoring, before claiming Task 3 complete.

- [ ] **Step 7: Commit docs and generated artifacts**

~~~bash
git add apps/backend/internal/handlers/service_handler.go \
  apps/backend/internal/handlers/service_openapi_contract_test.go \
  apps/backend/cmd/api/main.go \
  apps/backend/docs/swagger.json \
  apps/backend/docs/swagger.yaml \
  apps/backend/docs/openapi.json \
  apps/frontend/src/lib/api/generated \
  apps/frontend/lib/api.ts
git commit -m "docs(api): publish staff service read contract"
~~~

---

### Task 4: Implement the neutral visitor portrait

**Files:**

- Create: apps/frontend/components/staff/VisitorPhotoFrame.test.tsx
- Modify: apps/frontend/components/staff/VisitorPhotoFrame.tsx

- [ ] **Step 1: Write portrait behavior and styling tests**

Cover:

- identified visitor without a photo shows initials;
- anonymous visitor shows the User icon and not a question mark;
- idle state shows the Headphones icon;
- valid photo keeps empty alt, object-cover, and current dimensions;
- image error falls back to initials;
- the outer frame has a neutral border/surface and no rotation style, gradient, violet/fuchsia/amber, or shadow class.

Add data-testid="visitor-photo-frame" on the visual frame and assert the existing sm/md size tokens remain.

- [ ] **Step 2: Run RED**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/VisitorPhotoFrame.test.tsx
~~~

Expected: FAIL on the current transform/gradient/shadow and missing stable selector.

- [ ] **Step 3: Implement the approved neutral frame**

Preserve inner dimensions, icons, the current inline showPhoto ternary, object-cover, empty image alt, and image-error fallback. Remove rotate from SIZES and remove the transform/hover wrapper. Give the outer visual frame data-testid='visitor-photo-frame' and the exact base classes border-border/70 bg-muted/40 border plus sz.outer. Keep the current complete showPhoto ternary directly inside an inner frame with bg-card relative overflow-hidden plus sz.inner.

Use rounded-xl p-px for sm and rounded-2xl p-[2px] for md, with no shadow. Use bg-muted/35, text-muted-foreground, and text-foreground for all fallback visuals.

- [ ] **Step 4: Verify portrait and hero compatibility**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/VisitorPhotoFrame.test.tsx \
  components/staff/StaffCurrentTicketHero.test.tsx
~~~

Expected: PASS.

- [ ] **Step 5: REFACTOR and run the final focused tests**

Remove redundant portrait branches or test setup without changing size tokens, photo fallback, accessible name, or neutral styling. Re-run the same focused portrait and hero command from Step 4.

Expected: PASS after refactoring, before claiming Task 4 complete.

- [ ] **Step 6: Commit**

~~~bash
git add apps/frontend/components/staff/VisitorPhotoFrame.tsx \
  apps/frontend/components/staff/VisitorPhotoFrame.test.tsx
git commit -m "refactor(staff): neutralize visitor portrait"
~~~

---

### Task 5: Put SLA into the existing dense queue timer

**Files:**

- Modify: apps/frontend/components/staff/StaffQueuePanel.test.tsx
- Modify: apps/frontend/components/staff/StaffQueuePanel.tsx
- Modify: apps/frontend/messages/en.json
- Modify: apps/frontend/messages/ru.json

- [ ] **Step 1: Write compact SLA tests**

With fake time and ticket snapshots, cover:

- normal: 14:38 / 16:40 plus 02:02 remaining and neutral marker;
- warning during the last 10%: amber elapsed/delta and marker;
- overdue: 16:41 / 16:40 plus 00:01 over limit and red marker;
- no positive maxWaitingTime: ordinary Waiting and elapsed only;
- no old SLA pill or progressbar;
- p-2 row density and size-9 Call control remain;
- ticket order does not change when a later ticket crosses SLA;
- a ticket without a snapshot remains no-SLA even when its current Service has a limit.

- [ ] **Step 2: Run RED**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/StaffQueuePanel.test.tsx
~~~

Expected: FAIL because the row still renders Max and the large warning/overdue pill.

- [ ] **Step 3: Add localized copy**

Under staff.queue in both message files add:

~~~json
{
  "sla_waiting": "Waiting SLA",
  "sla_remaining": "{time} remaining",
  "sla_over_by": "{time} over limit"
}
~~~

Russian values:

~~~json
{
  "sla_waiting": "SLA ожидания",
  "sla_remaining": "{time} осталось",
  "sla_over_by": "{time} сверх лимита"
}
~~~

Remove max_label, sla_warning, sla_overdue, and sla_label only if repository-wide search shows no remaining consumers.

- [ ] **Step 4: Implement snapshot-only delta**

Continue using useTicketTimer for elapsed, isWarning, isOverdue, and formatTime. Calculate:

~~~ts
const maxWaitingTime = hasMaxBudget ? ticket.maxWaitingTime : undefined;
const deltaSeconds = maxWaitingTime
  ? isOverdue
    ? elapsed - maxWaitingTime
    : Math.max(0, maxWaitingTime - elapsed)
  : undefined;
~~~

Use the existing three-line time stack:

1. queue.sla_waiting or queue.waiting;
2. elapsed plus a smaller inline slash and limit;
3. localized remaining/over-limit delta only when the ticket snapshot is positive.

Always use a thin neutral left marker for SLA rows and replace it with amber/red by state. Remove the timer background gradient from queue rows so normal SLA remains neutral. Keep p-2, information order, and action size.

- [ ] **Step 5: Verify GREEN**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/StaffQueuePanel.test.tsx
~~~

Expected: PASS for normal, warning, overdue, no-SLA, snapshot-only, density, and order.

- [ ] **Step 6: REFACTOR and run the final focused test**

Consolidate repeated SLA state/copy selection without changing ticket ordering, snapshot-only limits, or dense row geometry. Re-run the StaffQueuePanel focused command from Step 5.

Expected: PASS after refactoring, before claiming Task 5 complete.

- [ ] **Step 7: Commit**

~~~bash
git add apps/frontend/components/staff/StaffQueuePanel.tsx \
  apps/frontend/components/staff/StaffQueuePanel.test.tsx \
  apps/frontend/messages/en.json \
  apps/frontend/messages/ru.json
git commit -m "feat(staff): show compact waiting SLA"
~~~

---

### Task 6: Replace the polling line with a stable title dot

**Files:**

- Modify: apps/frontend/components/staff/StaffQueuePanel.test.tsx
- Modify: apps/frontend/components/staff/StaffQueuePanel.tsx

- [ ] **Step 1: Write polling geometry tests**

Render queueRefreshing false and true. Assert:

- data-testid="staff-queue-refresh-indicator" exists in both;
- idle has opacity-0 and refreshing has opacity-100;
- refreshing includes motion-safe:animate-pulse;
- both use the fixed size-1.5 slot;
- the sorting paragraph is identical;
- no visible Refreshing queue paragraph or role=status exists below it;
- accessible refresh copy is present without aria-live.

- [ ] **Step 2: Run RED**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/StaffQueuePanel.test.tsx
~~~

Expected: FAIL because the current conditional paragraph changes header height.

- [ ] **Step 3: Implement the permanent title slot**

Place immediately after the title:

~~~tsx
<span
  data-testid='staff-queue-refresh-indicator'
  className={cn(
    'bg-primary size-1.5 shrink-0 rounded-full transition-opacity',
    queueRefreshing
      ? 'opacity-100 motion-safe:animate-pulse'
      : 'opacity-0'
  )}
  aria-hidden='true'
/>
<span className='sr-only'>
  {queueRefreshing ? t('queue.refreshing') : ''}
</span>
~~~

Keep the slot mounted in both states. Delete the conditional visible paragraph under queue.sorted_by_wait. Do not add role=status or aria-live, because routine polling must not repeatedly interrupt the operator.

- [ ] **Step 4: Verify polling and responsive regressions**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/StaffQueuePanel.test.tsx \
  components/staff/StaffWorkstationShell.test.tsx
~~~

Expected: PASS.

- [ ] **Step 5: REFACTOR and run the final focused tests**

Remove redundant polling branches or duplicated assertions while keeping the indicator slot permanently mounted and non-live. Re-run the same queue and shell command from Step 4.

Expected: PASS after refactoring, before claiming Task 6 complete.

- [ ] **Step 6: Commit**

~~~bash
git add apps/frontend/components/staff/StaffQueuePanel.tsx \
  apps/frontend/components/staff/StaffQueuePanel.test.tsx
git commit -m "fix(staff): keep queue polling geometry stable"
~~~

---

### Task 7: Full verification and authenticated browser acceptance

**Files:** Verify every file changed in Tasks 1-6.

- [ ] **Step 1: Run focused frontend regressions**

~~~bash
pnpm --dir=apps/frontend exec vitest run \
  components/staff/VisitorPhotoFrame.test.tsx \
  components/staff/StaffCurrentTicketHero.test.tsx \
  components/staff/StaffQueuePanel.test.tsx \
  components/staff/StaffWorkstationShell.test.tsx \
  "app/[locale]/staff/[unitId]/[counterId]/page.test.tsx"
~~~

Expected: PASS.

- [ ] **Step 2: Run full gates**

~~~bash
pnpm nx run frontend:test
pnpm nx run frontend:lint
pnpm nx run frontend:format:check
# If format:check reports task-owned drift, repair it and re-run the check:
pnpm nx run frontend:format:fix
pnpm nx run frontend:format:check
pnpm nx run backend:test
pnpm nx run backend:lint
pnpm nx run frontend:build
pnpm nx run backend:build
git diff --check
~~~

Expected: touched-code gates PASS. Run frontend:format:fix only for task-owned drift in a clean or safely isolated tree; do not rewrite known unrelated formatting debt. Record unrelated pre-existing failures with exact evidence and never mark a blocked gate accepted.

- [ ] **Step 3: Confirm local listeners without stopping unrelated processes**

~~~bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
~~~

If any `apps/backend/**/*.go` file changed, browser acceptance must not reuse an API process started before those changes. Build and restart the worktree-owned backend through `pnpm nx run backend:build` and `pnpm nx run backend:serve`, then verify that the serving process was started from the current worktree after the rebuild. Point the worktree frontend at that rebuilt API and restart the worktree-owned frontend if its API environment changed.

If ports 3000 or 3001 belong to unrelated processes, do not stop them. Start the worktree frontend/backend on available ports instead, preserve the user's authenticated browser session whenever possible, and perform acceptance only against the rebuilt worktree backend—not an already-running old binary.

- [ ] **Step 4: Accept the authenticated 1440 px layout**

Verify and capture evidence that:

- queue header and actions do not overlap;
- the portrait is neutral and unrotated;
- rows stay dense and normal/warning/overdue SLA remains readable;
- there is no horizontal overflow;
- queue height and first-row position stay fixed through two polling cycles;
- only the title dot changes opacity/animation during polling.

- [ ] **Step 5: Accept compact width below 1366 px**

At 1180 px or another representative compact width, verify and capture:

- intended stacked shell gap;
- no text collision or missing edge padding;
- unchanged dense ticket rows;
- stable geometry through two polling cycles.

- [ ] **Step 6: Review the aggregate diff**

~~~bash
git status --short
git diff --check
git log --oneline -8
~~~

Confirm no placeholders, temporary selectors, broad kiosk permission changes, generated drift, or unrelated user files staged. Report automated, browser, and unrun manual gates separately.

---

## Plan Self-Review Checklist

- [ ] Every approved design behavior maps to an implementation task and an automated or browser check.
- [ ] Ticket snapshot SLA semantics and oldest-first ordering remain unchanged.
- [ ] The polling indicator stays mounted in both states and uses reduced-motion-safe animation.
- [ ] Service reads accept same-unit terminal, kiosk, or staff-panel access without broadening kiosk operations.
- [ ] OpenAPI regeneration precedes Orval generation.
- [ ] Commands use repository-supported Nx/pnpm syntax.
- [ ] No step stages unrelated untracked files.
- [ ] No placeholder implementation, invented endpoint, or unverified acceptance remains.
