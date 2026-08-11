# Queue Display Unit Assignment Design

## Goal

Allow a published composable `queue-display` experience to be assigned directly to a `unit`, and let `/screen/[unitId]` render it safely while preserving the current screen implementation as the automatic fallback.

## Context

The composable runtime already supports a `queue-display` surface, portrait and landscape device profiles, queue-display widgets, operational-state precedence, and a validated `ExperienceTemplate` definition. The terminal runtime currently resolves assignments through a terminal JWT, while the public screen route is addressed by `unitId` and already owns the live queue/signage data flow. These are separate deployment paths and should remain separate.

## Chosen approach

Use a unit-level assignment for public queue displays. A unit references the selected experience template; runtime resolution returns the latest immutable published version and a compatible variant. The existing terminal assignment protocol is unchanged.

Two related concepts remain distinct:

- **Surface:** `queue-display`, describing the product role and widget contract.
- **Device profile:** portrait or landscape dimensions, describing the target viewport.

The first migration supports the existing unit-level public screen route only. It does not introduce display-device inventory, schedules, groups, proof-of-play, or per-screen assignments within one unit.

## Assignment and API behavior

The backend exposes a read-only runtime manifest for a public unit screen. The response is one of:

- `legacy`: no usable unit assignment is available; the caller must use the current screen renderer.
- `experience`: immutable published version metadata, selected variant, and opaque definition.

The public endpoint must not require a user or terminal JWT. It must reveal only the published definition intentionally assigned to that unit, and it must not expose drafts, unpublished versions, internal assignment fields, or tenant-wide template listings.

Resolution rules, in order:

1. Load the unit by opaque `unitId`.
2. If it has no composable assignment, return `legacy`.
3. Resolve the assigned template's current published version.
4. Reject to `legacy` when the template is unpublished, invalid, incompatible, or has no queue-display variant.
5. Return the immutable version and the variant matching the optional `profile=portrait|landscape` query. If no profile is supplied, prefer the landscape variant and otherwise use the lexicographically first valid variant ID.

The endpoint is safe to cache only for a short bounded period or with explicit no-store semantics during the initial rollout. Publishing, restoring, or unassigning must never mutate an already published version.

## Frontend data flow

`ScreenUnitClient` continues to load the existing live data through `useScreenRendererLiveData`. A dedicated resolver/client then:

1. requests the unit experience manifest;
2. validates the response envelope and definition with `ExperienceTemplateSchema`;
3. verifies `surface === 'queue-display'`, the selected variant exists, and the variant profile is usable;
4. maps current queue data into `ExperienceRuntimeContext.display` and `live`;
5. mounts `ExperienceRenderer` only for a valid experience response;
6. falls back to the existing `ScreenRenderer`/legacy layout for every failure or unsupported case.

The fallback must be indistinguishable from the current route behavior: existing screen templates, advertisements, announcements, QR code, queue ticker, colors, date/time, and live updates remain available. A manifest failure must not replace a working screen with a blank or error state.

## Runtime contract

The queue-display context contains:

- unit display name;
- localized current time label;
- current primary called ticket, if any;
- bounded recent called tickets;
- connection/open/stale/emergency state already used by operational precedence;
- reduced-motion preference.

The runtime will reuse the existing queue-display widgets and registry. This slice does not add new widget types. Unknown or unsupported widgets continue to produce the runtime's safe diagnostic/fallback behavior and must never execute arbitrary actions.

The variant profile is the source of layout orientation. The renderer must work in both declared portrait and landscape profiles without page scrolling or clipped operational controls, as already required by the accepted composable-screen design.

## Error handling and rollout

The unit manifest client returns a discriminated result rather than throwing assignment errors into the screen tree. Invalid network responses, schema failures, wrong surface, missing variant, unpublished assignment, and backend 4xx/5xx all resolve to `legacy` with a redacted diagnostic suitable for local telemetry.

The migration is opt-in: only a unit with an explicit published `queue-display` assignment can use the new runtime. Unassignment immediately restores legacy behavior on the next manifest refresh. There is no destructive migration and no deletion of legacy screen/signage code.

## Testing and acceptance

Backend tests cover:

- no assignment returns `legacy`;
- valid published queue-display assignment returns the immutable version and variant;
- draft/unpublished, wrong-surface, invalid-definition, and missing-variant assignments return `legacy`;
- the public unit scope cannot resolve another unit's assignment.

Frontend tests cover:

- valid manifest renders `ExperienceRenderer` with display context;
- malformed or unavailable manifest renders the existing legacy path;
- portrait and landscape variants select the expected layout;
- primary and recent calls are bounded and rendered safely;
- existing screen-template behavior remains unchanged when no assignment exists.

The final PR must run focused shared-types/frontend/backend tests plus OpenAPI/Orval checks. Browser acceptance remains a separate gate; real display hardware and long-running signage behavior are reported separately from automated tests.

## Explicit non-goals

- multiple independent public screens assigned to one unit;
- display-device records or fleet management;
- schedules, playlists, proof of play, or media policy changes;
- migration of counter displays or visitor mobile screens;
- deleting or rewriting the existing `ScreenRenderer` implementation;
- adding payment, arbitrary scripts, or tenant-authored custom HTML.
