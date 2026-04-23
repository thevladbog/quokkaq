# Digital Signage (unit display)

QuokkaQ pairs **one queue location (unit)** with **one public screen** (`/screen/...`). This is not a large multi-site display network: the value is **queue sync** (tickets, ETA) plus **seasonal or urgent messages**.

## Playlists and slides

- A **playlist** is an ordered list of **materials** (images/videos) with a duration per slide.
- Optional **Valid from / Valid to** (YYYY-MM-DD) on each **slide** limits when that slide is shown. Dates are evaluated in the **unit’s timezone** (same as the rest of the queue day).

## Schedules (time-of-day and calendar)

- A **schedule** maps a playlist to **days of the week** (1 = Monday … 7 = Sunday) and a **time range** (supports overnight windows).
- Optional **Valid from / Valid to** on the schedule restrict the **calendar** period when that rule applies (inclusive), in the **unit timezone**. Unset = unbounded.
- If several schedules match, **higher priority** wins; the admin weekly view highlights **overlaps** and slots **outside today’s calendar** when date limits are set.

## Default playlist

- Mark a playlist as **default** for fallback when no schedule matches the current time (or all calendar windows exclude “today”).

## External feeds

- RSS, weather, or custom URL feeds are polled on a schedule. Check **Status** for last fetch and error streaks.

## Status tab

- **Signage & feeds** summarizes: effective playlist source, empty playlist after date filtering, default playlist flag, and **external feed** health (last success / consecutive failures).

## Announcements

- **Banner** — in-layout row of notices.
- **Full screen** — high-visibility overlay (respects **reduced motion** in the browser). A **preview** is available in admin before adding (not published until you add).

## Related

- API: see OpenAPI tag `signage` on your server (`/docs/openapi.json`).
- Product scope (what we do and do not build as baseline) is summarised in `apps/backend/AGENTS.md` and `apps/frontend/AGENTS.md`.
