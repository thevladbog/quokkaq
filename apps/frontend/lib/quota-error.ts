import { ApiHttpError } from '@/lib/api';

/**
 * Returns true when the error is an HTTP 402 quota_exceeded response from the backend.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof ApiHttpError) {
    return err.status === 402;
  }
  return false;
}

/**
 * Returns true when the error is an HTTP 402 with metric === 'tickets_per_month'
 * (credit warning scenario — quota exceeded but the response may still carry a ticket).
 */
export function isTicketCreditWarning(err: unknown): boolean {
  if (!(err instanceof ApiHttpError) || err.status !== 402) return false;
  try {
    const parsed = JSON.parse(err.rawBody ?? '');
    return parsed?.metric === 'tickets_per_month';
  } catch {
    return false;
  }
}
