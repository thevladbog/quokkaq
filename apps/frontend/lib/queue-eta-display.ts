/**
 * Public queue ETA (minutes until call) for display. Avoids showing 0 when the API
 * returns a small positive fraction (e.g. 0.3 → 1).
 */
export function displayEstimateToCallMinutes(
  value: number | null | undefined
): number {
  if (value == null || value <= 0) {
    return 0;
  }
  if (value < 1) {
    return Math.ceil(value);
  }
  return Math.round(value);
}

/** Longest current wait among waiting tickets (now − created_at), in whole minutes. */
export function displayMaxWaitInQueueMinutes(
  value: number | null | undefined
): number {
  if (value == null) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}
