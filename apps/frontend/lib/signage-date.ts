/**
 * Civil calendar YYYY-MM-DD in an IANA timezone (matches backend unit TZ for “today”).
 */
export function getCivilYmdInIanaTimeZone(
  timeZone: string,
  d: Date = new Date()
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Inclusive [validFrom, validTo] when set; open ends mean unbounded.
 * Inputs should be YYYY-MM-DD or empty; compares lexicographically for same-length dates.
 */
export function scheduleInCalendarForTodayYmd(
  validFrom: string | undefined,
  validTo: string | undefined,
  todayYmd: string
): boolean {
  const from = (validFrom ?? '').trim().slice(0, 10) || undefined;
  const to = (validTo ?? '').trim().slice(0, 10) || undefined;
  if (from && from > todayYmd) {
    return false;
  }
  if (to && to < todayYmd) {
    return false;
  }
  return true;
}

export type SlideDateHealth =
  | 'ok'
  | 'open'
  | 'upcoming'
  | 'active_expiring'
  | 'expired';

const MS_DAY = 86_400_000;

/** @param todayYmd — YYYY-MM-DD in unit timezone */
export function slideDateHealth(
  validFrom: string,
  validTo: string,
  todayYmd: string
): SlideDateHealth {
  const f = (validFrom ?? '').trim().slice(0, 10);
  const t = (validTo ?? '').trim().slice(0, 10);
  if (!f && !t) {
    return 'open';
  }
  if (f && todayYmd < f) {
    return 'upcoming';
  }
  if (t && todayYmd > t) {
    return 'expired';
  }
  if (t) {
    const end = new Date(`${t}T12:00:00.000Z`);
    const tod = new Date(`${todayYmd}T12:00:00.000Z`);
    const daysLeft = Math.floor((+end - +tod) / MS_DAY);
    if (daysLeft >= 0 && daysLeft <= 7) {
      return 'active_expiring';
    }
  }
  return 'ok';
}

export function slideDateNeedsAttention(h: SlideDateHealth): boolean {
  return h === 'expired' || h === 'upcoming' || h === 'active_expiring';
}
