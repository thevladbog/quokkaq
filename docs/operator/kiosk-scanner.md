# Kiosk: barcode and document scanners (HID vs serial)

For employee IdP **badge** mode, the kiosk only needs a string in the `raw` field of `POST /units/{unitId}/employee-idp/resolve` — the same as for other flows that accept a scanned line.

## USB HID (keyboard wedge)

- The device emulates a keyboard: it “types” digits or letters, often ending with **Enter** or **Tab**.
- The frontend uses a short debounce and line aggregation (`useKioskBarcodeWedge` / `useKioskSerialScanner`) so bursts of key events are merged into one line.
- **No** serial port configuration; works in the browser and in the desktop shell as long as OS input focus is on the app.

## Serial (COM / RS-232) via desktop agent

- The optional **kiosk desktop agent** can read from a **serial** reader and send lines to the webview (see the agent’s `scanner` integration in the repository).
- Prefer when the reader does not support HID, or for industrial scanners wired only to serial.

## Logs and PII

- Do **not** log raw badge strings or full IdP request bodies. Prefer structured `employee_idp.resolve` lines with `unit_id`, `outcome` (`matchStatus` or error class), and `request_id` (see the API handler).
