# Operator workplace visual polish

## Goal

Bring the visitor portrait and waiting-ticket rows into the same restrained visual system as the redesigned operator workplace, expose waiting SLA without making queue rows taller, remove polling layout shift, and repair the service-list authorization contract used by the staff route.

## Scope

This change covers four focused areas:

1. Visitor portrait treatment in the active and idle workstation heroes.
2. Compact SLA presentation inside existing waiting-ticket rows.
3. A stable background-refresh indicator in the queue heading.
4. Authorization and documentation for the canonical unit service-list endpoints.

It does not change ticket ordering, call-next selection, service-scope behavior, SLA thresholds, ticket snapshot semantics, or kiosk telemetry permissions.

## Visitor portrait

Use the approved neutral portrait direction (option A).

- Preserve the current portrait proportions and size tokens so the hero layout does not reflow.
- Remove the rotation, hover unrotation, violet–fuchsia–amber border, and decorative shadow.
- Use a neutral one-pixel border, a quiet dark surface, and the existing container radius scale.
- Keep the real photo behavior unchanged: cover crop, image-error fallback, and empty `alt` because the surrounding frame already supplies the accessible label.
- Keep the three fallback states: initials for an identified visitor without a photo, a user icon for an anonymous visitor, and headphones for the idle workplace.
- Use one neutral treatment for active and idle states. Status color belongs to ticket status and SLA components, not to visitor identity.

## Compact queue ticket and waiting SLA

Keep the current dense row height, padding, information order, and 36 px Call target. Do not add a progress bar, large badge, or extra row.

For tickets with a positive `maxWaitingTime`, reuse the existing three-line time area:

1. Label: `SLA ожидания` / `Waiting SLA`.
2. Main line: elapsed time followed by a smaller total limit, for example `14:38 / 16:40`.
3. Delta line:
   - before the warning threshold: `11:22 осталось` / `11:22 remaining`;
   - within the final 10%: `02:02 осталось` / `02:02 remaining` in amber;
   - after the limit: `00:32 сверх лимита` / `00:32 over limit` in red.

The existing SLA timing rules remain authoritative: warning begins when remaining time is at most 10% of the snapshot limit, and overdue begins after elapsed time exceeds the limit.

Visual state is conveyed by both text and color:

- normal: neutral time and neutral thin left marker;
- warning: amber elapsed/delta and amber left marker;
- overdue: red elapsed/delta and red left marker.

For tickets without a positive `maxWaitingTime`, keep the current ordinary waiting timer and omit the separator, total, and delta. Never derive a missing ticket snapshot from the service's current SLA setting.

Queue order remains oldest waiting ticket first. SLA transitions do not reorder tickets.

## Stable background refresh

Remove the conditional `Refreshing queue…` line below the sorting description because it changes header height on every polling cycle.

Reserve a fixed dot-sized slot immediately after the queue title:

- hidden but space-preserving when idle;
- visible and softly pulsing while background ticket or service polling is active;
- static when the user prefers reduced motion;
- accessible label/status text available to assistive technology without adding visible height.

Initial loading still uses queue-shaped skeleton rows. Refresh errors continue to use the existing inline error and retry action. Routine polling must not announce repeatedly through a live region.

## Service-list API contract

The staff page used `useUnitServices` before and after the workplace redesign. The canonical endpoints are:

- `GET /units/{unitId}/services`
- `GET /units/{unitId}/services-tree`

The RBAC hardening commit grouped these reads with kiosk-only operations, while the default operator receives `access.staff_panel` but not `access.kiosk`. There is no alternative working unit service-list endpoint; the frontend wrapper for `/services/unit/{unitId}` points to no backend route.

Repair the contract as follows:

- Keep the two `/units/{unitId}/...` endpoints canonical.
- Allow a same-unit terminal JWT, or a staff JWT with either `access.kiosk` or `access.staff_panel`.
- Move the two read routes out of the kiosk-operation group so printer telemetry, kiosk telemetry, and employee IdP resolution remain kiosk-only.
- Add middleware/route contract tests for terminal access, kiosk access, staff-panel access, and denial without either permission.
- Document `401` and `403` responses in OpenAPI and regenerate the OpenAPI artifacts and frontend client.
- Remove the unused frontend `servicesApi.getByUnitId` wrapper for the nonexistent route.

`maxWaitingTime` does not require a contract change. It is already an optional Service field copied into Ticket at creation and returned through the backend model, OpenAPI, generated client, and frontend schema. Missing values remain a valid no-SLA state.

## Testing and acceptance

Automated coverage must prove:

- portrait variants have neutral, unrotated framing while preserving photo and fallback behavior;
- queue rows render elapsed/limit/delta for normal, warning, and overdue SLA states without adding a new block;
- no-SLA rows retain the ordinary waiting timer;
- polling toggles the reserved title indicator without changing header structure or height-producing content;
- reduced-motion styling does not require animation;
- staff-panel-only users can read unit services, while kiosk-only operations remain protected;
- OpenAPI and generated frontend artifacts match backend annotations.

Browser acceptance uses the authenticated local workplace at 1440 px and a compact width below 1366 px. Confirm no text overlap, no horizontal overflow, stable queue geometry across at least two polling cycles, unchanged dense row height, and readable neutral/warning/overdue SLA states.

## Pencil references

- Visitor portrait directions: `Operator workplace — visitor portrait directions` (`pNlLV`), option A approved.
- Compact SLA rows: `Operator queue — compact SLA rows` (`aG0OT`), approved compact direction.
