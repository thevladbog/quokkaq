# Composable experience pilot runbook

This runbook covers the first composable-experience pilots for ticket stations and unit queue displays. A published experience is immutable; a draft save never changes a device. A queue display is opted in at the unit level, so sibling units can remain on Legacy while one screen is evaluated. Hardware acceptance remains a separate gate.

## Publish and assign

1. Open the tenant's **Experiences** page.
2. Create or open a `ticket-station` experience.
3. Select one or two concrete device profiles. Keep portrait and landscape placement complete before publishing.
4. Save the draft and review the validation report. A blocked publish must be resolved; do not bypass it by editing generated data.
5. Publish. Record the immutable template version id and version number in the pilot ticket.
6. Assign the published template and selected variant to the paired kiosk terminal. Confirm that the terminal's effective kind is `kiosk` and that the variant exists in the published definition.
7. Open the station and confirm the applied-version acknowledgement in the terminal details before directing visitors to it.

## Rollback and safe unassignment

- If the station is unhealthy, unassign both the template and variant. The station must return to the legacy kiosk flow.
- If the previous version is known-good, restore it through version history. Restore creates a new immutable version; it does not mutate the historical row.
- If a station is offline, do not assume a publish has applied. Confirm the last applied version after network recovery.
- If a cached manifest is suspected to be stale, unassign first, reset the station's local experience cache, reload, and verify legacy mode before assigning again.
- Preserve the terminal id, template/version ids, acknowledgement status, timestamp, browser/Tauri logs, and a screenshot of the visible state in the incident record. Never attach visitor identity, badge values, OCR output, phone numbers, or visitor tokens.

## Queue-display pilot

1. Create a `queue-display` experience with both portrait and landscape profiles when the unit may use different screen orientations.
2. Save, validate, and publish the experience. Confirm that the published definition contains the intended pages, widgets, and queue-display data bindings.
3. Open the unit's **Display** settings and assign the published experience and a default profile. The assignment is stored on the unit, not on an individual browser or screen URL.
4. Verify the public unit manifest in both orientations. The runtime selects the requested orientation when available; otherwise it selects the deterministic compatible profile from the published definition.
5. Confirm called-ticket updates continue through the existing WebSocket flow and that the experience renderer shows the same queue state as Legacy.
6. To roll back, select **Legacy queue display** and save. If the manifest is unavailable, malformed, unpublished, or has the wrong surface, the display must also render Legacy automatically.

The committed Playwright acceptance fixture uses a deterministic public unit and API responses rather than a live tenant or demo database. It covers the assigned experience at 1920×1080 and 1080×1920, plus Legacy fallback for both an explicitly legacy and an invalid manifest. This verifies the browser rendering contract and scroll bounds; it does not replace real-device acceptance.

The unit assignment endpoint is intentionally fail-safe: it accepts only a published `queue-display` template and a variant belonging to that published definition. Do not make a screen depend on a draft definition or copy manifest JSON into device configuration.

## Acceptance gates

Automated browser checks are not hardware acceptance. Record each gate as `PASS`, `FAIL`, or `NOT RUN`:

| Gate | Result | Evidence / notes |
| --- | --- | --- |
| Chromium builder workflow | PASS / FAIL / NOT RUN | Playwright report or CI run |
| Queue display assigned unit: portrait profile | PASS / FAIL / NOT RUN | 9:16 or equivalent viewport; verify manifest and rendered widgets |
| Queue display assigned unit: landscape profile | PASS / FAIL / NOT RUN | 16:9 or equivalent viewport; verify manifest and rendered widgets |
| Queue display unit unassigned | PASS / FAIL / NOT RUN | Select Legacy; verify the pre-existing renderer is shown |
| Invalid/unavailable manifest fallback | PASS / FAIL / NOT RUN | Simulate non-200 or invalid definition; verify Legacy |
| Fixed viewport: 1920×1080 | PASS / FAIL / NOT RUN | screenshot and scroll/clipping result |
| Fixed viewport: 1080×1920 | PASS / FAIL / NOT RUN | screenshot and scroll/clipping result |
| Fixed viewport: 1080×1920 | PASS / FAIL / NOT RUN | screenshot and scroll/clipping result |
| iPad Safari / PWA | NOT RUN | Requires a real iPad |
| Tauri 1080×1920 station | NOT RUN | Requires the packaged desktop app |
| ESC/POS printer | NOT RUN | Requires the target printer |
| Scanner / OCR | NOT RUN | Requires the target scanner/device |
| Badge reader | NOT RUN | Requires the target reader and employee account |
| Audio / TTS | NOT RUN | Requires the target speaker/browser policy |
| Network loss and recovery | NOT RUN | Requires an instrumented station |

The `ticket-station.spec.ts` and `queue-display-preview.spec.ts` placeholders remain skipped regardless of environment variables until deterministic fixture hosts and real assertions are implemented and validated. A skipped browser test must not be reported as physical acceptance.

## Incident evidence

Capture:

- terminal id and effective terminal kind;
- assigned template id, variant id, published version id and acknowledgement status;
- whether the station was online or using a last-known-good cache;
- UTC timestamps for assignment, first load, acknowledgement, and rollback;
- redacted browser/Tauri console and network diagnostics;
- viewport dimensions and a screenshot of the non-sensitive state.

Do not capture or paste access tokens, pairing codes, visitor tokens, badge values, OCR payloads, phone numbers, or raw form/session data.
