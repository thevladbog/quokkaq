import type { Ticket } from '@/lib/api';

export function isTicketOverWait(ticket: Ticket): boolean {
  if (!ticket.maxWaitingTime || !ticket.createdAt) return false;
  const elapsedSec = Math.floor(
    (Date.now() - new Date(ticket.createdAt).getTime()) / 1000
  );
  return elapsedSec > ticket.maxWaitingTime;
}

export function countOverWaitTickets(queue: Ticket[]): number {
  return queue.filter((ticket) => isTicketOverWait(ticket)).length;
}

export function elapsedSecondsSince(createdAt?: string | null): number {
  if (!createdAt) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  );
}

/** Service / active ticket duration threshold for "long duration" badge (seconds). */
export const SUPERVISOR_LONG_SERVICE_SEC = 15 * 60;

/** Seconds from ticket creation until call to counter (queue wait before desk). */
export function ticketPreCallWaitSeconds(ticket: Ticket): number | null {
  if (!ticket.createdAt || !ticket.calledAt) return null;
  const start = new Date(ticket.createdAt).getTime();
  const called = new Date(ticket.calledAt).getTime();
  if (called < start) return null;
  return Math.floor((called - start) / 1000);
}

/** Same shape as `useTicketTimer` formatting — safe to use outside React. */
export function formatWaitDurationSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatMetricSecondsOrDash(
  seconds: number | null,
  empty = '—'
): string {
  if (seconds === null || seconds < 0) return empty;
  return formatWaitDurationSeconds(seconds);
}
