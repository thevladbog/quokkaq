/**
 * How to filter counters for a subdivision, or how to fix `serviceZoneId` when creating a counter.
 * - `undefined` — all counters; dialog: free choice of zone.
 * - `null` — only subdivision-wide pool (`serviceZoneId` absent); dialog: locked to no zone.
 * - string — zone unit id; dialog: locked to that zone.
 */
export type CounterServiceZoneFilter = undefined | null | string;
