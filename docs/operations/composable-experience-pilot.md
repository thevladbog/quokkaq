# Composable experience pilot runbook

This runbook covers the first ticket-station pilot. A published experience is immutable; a draft save never changes a device. The current browser acceptance suite covers the routed builder host and bounded desktop layout. Hardware acceptance remains a separate gate.

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

## Acceptance gates

Automated browser checks are not hardware acceptance. Record each gate as `PASS`, `FAIL`, or `NOT RUN`:

| Gate | Result | Evidence / notes |
| --- | --- | --- |
| Chromium builder workflow | PASS / FAIL / NOT RUN | Playwright report or CI run |
| Fixed viewport: 820×1180 | PASS / FAIL / NOT RUN | screenshot and scroll/clipping result |
| Fixed viewport: 1180×820 | PASS / FAIL / NOT RUN | screenshot and scroll/clipping result |
| Fixed viewport: 1080×1920 | PASS / FAIL / NOT RUN | screenshot and scroll/clipping result |
| iPad Safari / PWA | NOT RUN | Requires a real iPad |
| Tauri 1080×1920 station | NOT RUN | Requires the packaged desktop app |
| ESC/POS printer | NOT RUN | Requires the target printer |
| Scanner / OCR | NOT RUN | Requires the target scanner/device |
| Badge reader | NOT RUN | Requires the target reader and employee account |
| Audio / TTS | NOT RUN | Requires the target speaker/browser policy |
| Network loss and recovery | NOT RUN | Requires an instrumented station |

The `ticket-station.spec.ts` and `queue-display-preview.spec.ts` placeholders intentionally skip until deterministic fixture hosts exist. A skipped browser test must not be reported as physical acceptance.

## Incident evidence

Capture:

- terminal id and effective terminal kind;
- assigned template id, variant id, published version id and acknowledgement status;
- whether the station was online or using a last-known-good cache;
- UTC timestamps for assignment, first load, acknowledgement, and rollback;
- redacted browser/Tauri console and network diagnostics;
- viewport dimensions and a screenshot of the non-sensitive state.

Do not capture or paste access tokens, pairing codes, visitor tokens, badge values, OCR payloads, phone numbers, or raw form/session data.
