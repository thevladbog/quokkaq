import {
  AdScreenConfigSchema,
  type AdScreenConfig
} from '@quokkaq/shared-types';

/** Parse `unitConfig.adScreen` for counter board / workplace display. */
export function parseAdScreen(
  unitConfig: Record<string, unknown> | undefined
): Partial<AdScreenConfig> | undefined {
  if (!unitConfig?.adScreen || typeof unitConfig.adScreen !== 'object') {
    return undefined;
  }
  const parsed = AdScreenConfigSchema.partial().safeParse(unitConfig.adScreen);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Preserve pathname and query string minus `code` (e.g. after pairing bootstrap).
 * @param searchParamsSerialized — e.g. `searchParams.toString()` from Next.js useSearchParams()
 */
export function pathWithQueryNoCode(
  pathname: string,
  searchParamsSerialized: string
): string {
  const sp = new URLSearchParams(searchParamsSerialized);
  sp.delete('code');
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
