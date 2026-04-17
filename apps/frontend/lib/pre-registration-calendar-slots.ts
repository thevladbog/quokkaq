/**
 * Stable key for a calendar-backed slot option (disambiguates same time across integrations).
 */
export function preRegCalendarSlotRowKey(
  calendarIntegrationId: string | undefined,
  externalEventHref: string | undefined,
  index: number
): string {
  return `${calendarIntegrationId ?? ''}|${externalEventHref ?? ''}|${index}`;
}

export interface CalendarSlotLike {
  time?: string;
  calendarIntegrationId?: string;
  integrationLabel?: string;
}

/**
 * Label for a slot in a select; duplicates the same clock time across integrations.
 */
export function formatCalendarSlotLabel(
  item: CalendarSlotLike,
  sameTimePeers: CalendarSlotLike[]
): string {
  const timeStr = item.time ?? '';
  if (sameTimePeers.length <= 1) {
    return timeStr;
  }
  if (item.integrationLabel?.trim()) {
    return `${timeStr} (${item.integrationLabel.trim()})`;
  }
  return `${timeStr} (#${(item.calendarIntegrationId ?? '').slice(0, 6)})`;
}
