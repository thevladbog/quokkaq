import type { HandlersPublicMarketingStatsResponse } from '@/lib/api/generated/subscriptions';
import { getPublicMarketingStats } from '@/lib/api/generated/subscriptions';

/**
 * Fetches public marketing aggregate counts (server) via Orval.
 * Returns null when API URL is unset or the request fails.
 */
export async function fetchMarketingPublicStats(): Promise<HandlersPublicMarketingStatsResponse | null> {
  const raw =
    process.env.MARKETING_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';
  if (!raw) {
    return null;
  }
  try {
    const res = await getPublicMarketingStats();
    if (res.status !== 200 || res.data == null) {
      return null;
    }
    return res.data;
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : '';
    if (name !== 'AbortError') {
      console.warn('[fetchMarketingPublicStats] request failed', err);
    }
    return null;
  }
}
