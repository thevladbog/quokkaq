const EMPTY_NAME_PLACEHOLDER = '—';

/**
 * Joins trimmed first/last name parts; returns an em dash when both are empty.
 */
export function formatFullName(
  firstName?: string | null,
  lastName?: string | null
): string {
  const parts = [firstName ?? '', lastName ?? '']
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return EMPTY_NAME_PLACEHOLDER;
  }
  return parts.join(' ');
}
