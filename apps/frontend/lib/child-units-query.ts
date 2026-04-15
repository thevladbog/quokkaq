import type { ModelsUnit } from '@/lib/api/generated/units';

/**
 * GET /units/:id/child-units: Orval returns `{ status, data }`; legacy callers may pass `ModelsUnit[]`.
 * Normalize before `.filter` / `.map`.
 */
export function normalizeChildUnitsQueryData(data: unknown): ModelsUnit[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as ModelsUnit[];
  }
  return [];
}
